import { Response } from "express";
import { createDeepSeek } from "@ai-sdk/deepseek";
import SessionModel from "../models/session.model";
import { LocalBox } from "../lib/local-sandbox";
import { SessionDocument } from "../models/session.model";
import { NotFoundException, BadRequestException } from "../utils/app-error";
import {
  convertToModelMessages,
  createUIMessageStream,
  generateId,
  generateText,
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  smoothStream,
  UIMessage,
} from "ai";
import { webSearch } from "@exalabs/ai-sdk";
import {
  createMessageService,
  getSessionMessagesService,
  sanitizeUIMessages,
  upsertSessionMessagesService,
} from "./message.service";
import { getGithubAccessToken } from "./github.service";
import { createBox, getBox } from "../lib/sandbox";
import { getCodeSystemPrompt } from "../lib/ai/prompt";
import { codingTools } from "../lib/ai/tools/github-tools";

export const getUserSessionService = async (
  userId: string,
  filters: {
    search?: string;
    pageSize: number;
    pageNumber: number;
  },
) => {
  const query: Record<string, any> = { userId };

  if (filters.search && filters.search !== undefined) {
    query.$or = [
      { title: { $regex: filters.search, $options: "i" } },
      { repoName: { $regex: filters.search, $options: "i" } },
    ];
  }

  const pagination = {
    pageSize: filters.pageSize,
    pageNumber: filters.pageNumber,
  };

  const skip = (pagination.pageNumber - 1) * pagination.pageSize;

  const [sessions, totalCount] = await Promise.all([
    SessionModel.find(query).sort({ createdAt: -1 }).lean(),
    SessionModel.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / pagination.pageSize);
  return {
    sessions,
    pagination: {
      pageSize: pagination.pageSize,
      pageNumber: pagination.pageNumber,
      totalCount,
      totalPages,
      skip,
    },
  };
};

export const getSessionBySlugIdService = async (
  userId: string,
  slugId: string,
) => {
  const session = await SessionModel.findOne({ userId, slugId }).lean();

  if (!session) {
    throw new NotFoundException("Session not found");
  }
  const { messages } = await getSessionMessagesService(session._id.toString());
  return { session, messages };
};

const createOrGetSession = async (
  userId: string,
  slugId: string,
  repoUrl: string,
  defaultBranch: string = "main",
  workspaceType: 'github' | 'local' = 'github',
  localPath?: string,
) => {
  if (!userId) throw new BadRequestException("Unable to find user");
  if (!slugId) throw new BadRequestException("slugId is required");

  // Local workspace uchun repoUrl shart emas
  if (workspaceType === 'github' && !repoUrl) {
    throw new BadRequestException("repoUrl is required for GitHub workspace");
  }
  if (workspaceType === 'local' && !localPath) {
    throw new BadRequestException("localPath is required for local workspace");
  }

  let session = await SessionModel.findOne({ userId, slugId });
  let box: LocalBox | null = null;

  // GitHub token faqat github workspace uchun kerak
  let accessToken = "";
  try {
    accessToken = await getGithubAccessToken(userId);
  } catch {
    if (workspaceType === 'github') throw new BadRequestException("GitHub not connected");
  }

  if (!session) {
    let repoName = "workspace";
    if (workspaceType === 'github') {
      repoName = repoUrl.split("/").slice(-1)[0].replace(".git", "") || "repo";
    } else if (localPath) {
      repoName = localPath.split("/").filter(Boolean).slice(-1)[0] || "workspace";
    }

    box = await createBox(accessToken, workspaceType === 'local' ? localPath : undefined);
    session = await SessionModel.create({
      userId,
      slugId,
      repoUrl: workspaceType === 'local' ? (localPath || '') : repoUrl,
      repoName,
      defaultBranch,
      boxId: box.id,
      workspaceType,
      localPath: workspaceType === 'local' ? localPath : null,
    });
  } else if (session.boxId) {
    box = await getBox(session.boxId, accessToken, session.workspaceType === 'local' ? session.localPath || undefined : undefined);
  } else {
    box = await createBox(accessToken, session.workspaceType === 'local' ? session.localPath || undefined : undefined);
    await SessionModel.findByIdAndUpdate(session._id, { boxId: box.id });
    session.boxId = box.id;
  }
  return { session, box };
};

const generateSessionTitle = async (prompt: string | null) => {
  if (!prompt) return "Untitled Session";
  try {
    const ds = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY || "" });
    const result = await generateText({
      model: ds("deepseek-chat"),
      system: `
        You are an AI assistant that generates very short session titles for coding tasks.
        - Keep it under 5 words.
        - Capitalize words appropriately.
        - Be specific and descriptive.
        - Do not include special characters.
        - Return ONLY the title, nothing else.
      `,
      prompt: `Generate a concise title for this coding session: "${prompt}"`,
    });
    return result.text.trim() || "Untitled Session";
  } catch (error) {
    return "Untitled Session";
  }
};

const generateBranchName = async (prompt: string | null) => {
  const uniqueId = Math.random().toString(36).slice(2, 8);
  if (!prompt) return `xagent/changes-${uniqueId}`;
  try {
    const ds = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY || "" });
    const result = await generateText({
      model: ds("deepseek-chat"),
      system: `
        You are a git branch naming expert.
        Generate a concise, descriptive branch suffix based on the task.
        
        Rules:
        - Generate ONLY the suffix part (not the full branch name)
        - Use kebab-case (lowercase, hyphen-separated)
        - Max 30 characters
        - Be descriptive but concise
        - No special characters except hyphens
        
        Examples:
        - "add login form with email" → "login-form"
        - "fix bug in navigation" → "nav-bug-fix"
        - "refactor user service" → "user-service-refactor"
        - "update website theme styles" → "theme-styles"
        
        Return ONLY the suffix, nothing else.
      `,
      prompt: `Generate a branch suffix for this task: "${prompt}"`,
    });

    const suffix =
      result.text
        .trim()
        .replace(/[^a-z0-9-]/g, "")
        .substring(0, 30) || "changes";
    return `xagent/${suffix}-${uniqueId}`;
  } catch (error) {
    return `xagent/changes-${uniqueId}`;
  }
};

const ensureSessionWorkspaceReady = async (
  session: SessionDocument,
  box: LocalBox,
  branchName: string,
  repoName: string,
  defaultBranch?: string,
) => {
  // ─── LOCAL WORKSPACE ───────────────────────────────────────────
  if (session.workspaceType === 'local') {
    const localPath = session.localPath;
    if (!localPath) throw new BadRequestException("localPath is required for local workspace");

    const { execSync } = await import("child_process");
    const fs = await import("fs");
    if (!fs.existsSync(localPath)) {
      throw new BadRequestException(`Local folder not found: ${localPath}`);
    }

    // Git init bo'lmagan bo'lsa init qilamiz
    if (!fs.existsSync(`${localPath}/.git`)) {
      execSync("git init", { cwd: localPath });
      execSync(`git config user.name "xagent"`, { cwd: localPath });
      execSync(`git config user.email "xronuz@gmail.com"`, { cwd: localPath });
    }

    // Branch yaratamiz (yoki mavjudini checkout)
    if (branchName && !session.repoInitializedAt) {
      try {
        execSync(`git checkout -b ${branchName}`, { cwd: localPath, stdio: "pipe" });
      } catch {
        try {
          execSync(`git checkout ${branchName}`, { cwd: localPath, stdio: "pipe" });
        } catch {
          // branch allaqachon mavjud yoki boshqa muammo — davom etamiz
        }
      }
    }

    if (!session.repoInitializedAt) {
      await SessionModel.findByIdAndUpdate(session._id, { repoInitializedAt: new Date() });
      session.repoInitializedAt = new Date();
    }
    return;
  }

  // ─── GITHUB WORKSPACE ──────────────────────────────────────────
  if (!session.repoUrl) {
    throw new BadRequestException("Session is missing repository URL");
  }

  // Repo repoName papkasida mavjudmi tekshiramiz
  const repoExist = await box.exec.command(`test -d ${repoName}/.git`);

  if (repoExist.exitCode !== 0) {
    // Clone qilamiz — targetDir: repoName → boxDir/repoName/ papkasiga
    await box.git.clone({
      repo: session.repoUrl,
      branch: defaultBranch,
      targetDir: repoName,
    });
  }

  // Endi repoName papkasiga kiramiz
  await box.cd(repoName);

  if (branchName && !session.repoInitializedAt) {
    // Avval mavjud branch checkout qilib ko'ramiz
    const checkoutResult = await box.git.exec({
      args: ["checkout", branchName],
    });
    if (checkoutResult.output.includes("error") || checkoutResult.output.includes("fatal")) {
      // Yo'q bo'lsa yangi branch yaratamiz
      await box.git.exec({ args: ["checkout", "-b", branchName] });
    }
  }

  if (!session.repoInitializedAt) {
    await SessionModel.findByIdAndUpdate(session._id, {
      repoInitializedAt: new Date(),
    });
    session.repoInitializedAt = new Date();
  }
};

export const sessionChatService = async (
  userId: string,
  slugId: string,
  repoUrl: string,
  defaultBranch: string | undefined,
  messages: UIMessage[],
  abortSignal: AbortSignal,
  res: Response,
  workspaceType: 'github' | 'local' = 'github',
  localPath?: string,
) => {
  let { session, box } = await createOrGetSession(
    userId,
    slugId,
    repoUrl,
    defaultBranch,
    workspaceType,
    localPath,
  );

  const lastMessage = messages[messages.length - 1];
  const userPrompt =
    lastMessage?.parts.find((part) => part.type === "text")?.text || null;

  if (!session.title) {
    const title = await generateSessionTitle(userPrompt);
    await SessionModel.findByIdAndUpdate(
      session._id,
      {
        title,
      },
      { new: true },
    );
    session.title = title;
  }

  let branchName: string | null = session.branchName;
  if (!branchName) {
    branchName = await generateBranchName(userPrompt);
    await SessionModel.findByIdAndUpdate(
      session._id,
      {
        branchName,
      },
      { new: true },
    );
    session.branchName = branchName;
  }

  await createMessageService(session._id.toString(), {
    id: lastMessage.id || generateId(),
    role: lastMessage.role,
    parts: lastMessage.parts,
  });

  const { messages: dbMessages } = await getSessionMessagesService(
    session._id.toString(),
  );

  const historyMessages = sanitizeUIMessages(dbMessages.slice(-10));

  const uiStream = createUIMessageStream({
    generateId: () => generateId(),
    originalMessages: dbMessages,
    onFinish: async ({ messages }) => {
      await upsertSessionMessagesService(session._id.toString(), messages);
    },
    execute: async ({ writer }) => {
      try {
        // emit session title
        writer.write({
          type: "data-session-title",
          data: { title: session.title },
          transient: true,
        });

        writer.write({
          type: "data-repo-info",
          data: {
            repoName: session.repoName,
            repoUrl: session.repoUrl,
            branchName: branchName,
          },
          transient: true,
        });

        const repoName = session.repoName;
        const defaultBranch = session.defaultBranch;

        await ensureSessionWorkspaceReady(
          session,
          box,
          branchName,
          repoName,
          defaultBranch,
        );

        const SYSTEM_PROMPT = getCodeSystemPrompt(session.repoName);

        const tools = codingTools(
          box,
          session.repoUrl,
          repoName,
          branchName,
          session.slugId,
          //defaultBranch,
          writer,
        );

        const activeTools = {
          // web
          web_search: webSearch(),
          ...tools,
        };
        const modelMesages = await convertToModelMessages(historyMessages, {
          tools: activeTools,
          ignoreIncompleteToolCalls: true,
          convertDataPart: () => undefined,
        });

        const deepseek = createDeepSeek({
          apiKey: process.env.DEEPSEEK_API_KEY || "",
        });

        const result = streamText({
          model: deepseek("deepseek-chat"),
          system: SYSTEM_PROMPT,
          messages: modelMesages,
          tools: activeTools,
          experimental_transform: smoothStream(),
          stopWhen: stepCountIs(20),
          abortSignal,
        });

        writer.merge(result.toUIMessageStream());
      } catch (error) {
        console.log(error);
        writer.write({
          type: "data-error",
          data: { message: "Something went wrong" },
        });
      }
    },
    onError: (error) => `Stream error`,
  });

  pipeUIMessageStreamToResponse({
    response: res,
    stream: uiStream,
    status: 200,
  });
};

export const createPullRequestService = async (
  userId: string,
  slugId: string,
  title?: string,
  body?: string,
) => {
  const session = await SessionModel.findOne({ userId, slugId });
  if (!session) throw new NotFoundException("Session not found");
  if (!session.boxId) throw new BadRequestException("Sandbox not available");
  if (!session.repoName)
    throw new BadRequestException("Respository not available");
  if (!session.branchName)
    throw new BadRequestException("Branch not available");

  const accessToken = await getGithubAccessToken(userId);
  const box = await getBox(session.boxId, accessToken);
  await box.cd(session.repoName);
  try {
    await box.git.checkout({ branch: session.branchName });
  } catch (error) {
    await box.git.exec({ args: ["checkout", "-b", session.branchName] });
  }
// --- Debug block ---
// console.log("status:", await box.git.status());
// console.log("current branch:", await box.git.exec({ args: ["branch", "--show-current"] }));
// console.log("remote:", await box.git.exec({ args: ["remote", "-v"] }));
// console.log("log:", await box.git.exec({ args: ["log", "--oneline", "-5"] }));
// console.log("remote head branch:", await box.git.exec({ args: ["ls-remote", "origin", session.branchName] }));
// console.log("remote base branch:", await box.git.exec({ args: ["ls-remote", "origin", session.defaultBranch] }));
// -------------------

// await box.git.push({ branch: session.branchName });

  let pr = {url: ""}
  try {
     pr = await box.git.createPR({
      title: title || `Update ${session.repoName}`,
      body: body || `Create a pull request for ${session.repoName}`,
      base: session.defaultBranch,
    });
  } catch (e: any) {
    console.log(e.statusCode, e.message, e.body);
    throw e;
  }

  return {
    success: true,
    url: pr.url,
  };
};

export const getSessionProcessesService = async (userId: string, slugId: string) => {
  const session = await SessionModel.findOne({ userId, slugId });
  if (!session) throw new NotFoundException("Session not found");
  if (!session.boxId) return { processes: [] };

  const accessToken = await getGithubAccessToken(userId).catch(() => "");
  const box = await getBox(session.boxId, accessToken);
  
  return {
    processes: await box.processes.list(),
  };
};
