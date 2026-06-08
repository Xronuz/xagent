import { LocalBox } from "../../local-sandbox";
import { tool } from "ai";
import z from "zod";

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean);
}

function escapeShellArg(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function getDiffStats(diffText: string) {
  let additions = 0;
  let deletions = 0;

  for (const line of splitLines(diffText)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

export const codingTools = (
  box: LocalBox,
  repoUrl: string | null,
  repoName: string,
  branchName: string | null,
  slugId: string,
  //defaultBranch: string
  writer?: { write: (payload: any) => void } | null,
) => {
  return {
    list: tool({
      description:
        "List files and directories at a given path relative to the current repo root. Use . for the root, or src/components for subfolders.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe(
            "Path relative to the repo root e.g src/components, use . for root",
          ),
      }),
      execute: async ({ path }) => {
        const files = await box.files.list(path);
        return { success: true, path, files };
      },
    }),

    grep: tool({
      description: "Search for text across files in the repository",
      inputSchema: z.object({
        query: z.string().describe("Text or pattern to search for"),
        path: z.string().default(".").describe("Directory to search in"),
      }),
      execute: async ({ query, path }) => {
        const result = await box.exec.command(
          `grep -RIn --exclude-dir=.git --exclude-dir=node_modules ${escapeShellArg(query)} ${escapeShellArg(path)}`,
        );
        const lines = splitLines(result.result || "");
        return {
          success: result.exitCode === 0,
          query,
          path,
          lines,
          matchCount: lines.length,
          exitCode: result.exitCode,
        };
      },
    }),

    // READ TOOL
    read: tool({
      description: "Read the full content of a file",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Path relative to repo root e.g. src/index.ts"),
      }),
      execute: async ({ path }) => {
        const content = await box.files.read(path);
        const lineCount = splitLines(content).length;
        return { success: true, path, content, lineCount };
      },
    }),

    // WRITE TOOL
    write: tool({
      description: "Create a new file with the given content",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Path relative to repo root e.g. src/utils/helper.ts"),
        content: z.string().describe("Content to write into the file"),
      }),
      execute: async ({ path, content }) => {
        const { RiskClassifier } = await import("../safety-layer");
        const approvalReq = RiskClassifier.checkFile(path);
        if (approvalReq) return approvalReq;

        await box.files.write({ path, content });
        const lineCount = splitLines(content).length;
        return { success: true, path, lineCount };
      },
    }),

    // EDIT TOOL
    edit: tool({
      description: "Overwrite an existing file with new content",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Path relative to repo root e.g. src/index.ts"),
        content: z.string().describe("New file content"),
      }),
      execute: async ({ path, content }) => {
        const { RiskClassifier } = await import("../safety-layer");
        const approvalReq = RiskClassifier.checkFile(path);
        if (approvalReq) return approvalReq;

        await box.files.write({ path, content });
        const diffResult = await box.git.exec({ args: ["diff", "--", path] });
        const patch = diffResult.output.trim();
        const { additions, deletions } = getDiffStats(patch);
        return { success: true, path, patch, additions, deletions };
      },
    }),

    //BASH TOOl
    bash: tool({
      description:
        "Run a shell command in the repository (npm install, build, test, delete files etc.)",
      inputSchema: z.object({
        command: z.string().describe("Shell command to run"),
      }),
      execute: async ({ command }) => {
        const { RiskClassifier } = await import("../safety-layer");
        const approvalReq = RiskClassifier.checkCommand(command);
        if (approvalReq) return approvalReq;

        const result = await box.exec.command(command);
        const lines = splitLines(result.result || "");
        return {
          success: result.exitCode === 0,
          output: result.result,
          lines,
          exitCode: result.exitCode,
        };
      },
    }),

    // START PROCESS TOOL
    start_process: tool({
      description:
        "Start a long-running background process (e.g. npm run dev, python server). Returns a processId immediately.",
      inputSchema: z.object({
        command: z.string().describe("Command to run"),
        cwd: z.string().optional().describe("Directory to run the command in, relative to repo root"),
        name: z.string().optional().describe("Optional name to track the process"),
      }),
      execute: async ({ command, cwd, name }) => {
        const { RiskClassifier } = await import("../safety-layer");
        const approvalReq = RiskClassifier.checkCommand(command);
        if (approvalReq) return approvalReq;

        return await box.processes.start({ command, cwd, name });
      },
    }),

    // READ PROCESS LOGS TOOL
    read_process_logs: tool({
      description: "Read stdout and stderr logs of a running background process",
      inputSchema: z.object({
        processId: z.string().describe("The ID of the process"),
      }),
      execute: async ({ processId }) => {
        try {
          return await box.processes.readLogs(processId);
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),

    // STOP PROCESS TOOL
    stop_process: tool({
      description: "Stop a running background process",
      inputSchema: z.object({
        processId: z.string().describe("The ID of the process to stop"),
      }),
      execute: async ({ processId }) => {
        try {
          return await box.processes.stop(processId);
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),

    // LIST PROCESSES TOOL
    list_processes: tool({
      description: "List all background processes and their statuses",
      inputSchema: z.object({}),
      execute: async () => {
        return { processes: await box.processes.list() };
      },
    }),

    // OBSERVE BROWSER TOOL
    observe_browser: tool({
      description: "Observe a running application in a headless browser to capture console logs, network errors, DOM snapshot, and screenshot metadata.",
      inputSchema: z.object({
        url: z.string().describe("The URL to observe (e.g. http://localhost:5173)"),
        waitMs: z.number().optional().describe("Optional milliseconds to wait after page load before capturing state (default 3000)"),
        screenshotName: z.string().optional().describe("Optional prefix for the screenshot file name"),
      }),
      execute: async ({ url, waitMs, screenshotName }) => {
        try {
          const { observeBrowser } = await import("../../browser-observer");
          return await observeBrowser(url, waitMs, screenshotName);
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),

    // SELF HEAL TOOL
    self_heal: tool({
      description: "Run an autonomous self-healing loop to diagnose and fix frontend runtime, build, or typescript errors on a given URL.",
      inputSchema: z.object({
        url: z.string().describe("The URL of the application to observe and heal (e.g. http://localhost:5173)"),
        maxIterations: z.number().optional().describe("Max number of repair iterations (default 3, max 5)"),
      }),
      execute: async ({ url, maxIterations }) => {
        try {
          const { runSelfHealingLoop } = await import("../self-healing");
          return await runSelfHealingLoop(box, url, maxIterations || 3, repoUrl, repoName, branchName, slugId);
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),

    // GOAL MANAGER TOOL
    goal_manager: tool({
      description: "Manage goal-oriented planning, roadmaps, and execution batches without writing code.",
      inputSchema: z.object({
        action: z.enum(["analyze", "view_roadmap", "next_batch", "start_batch", "complete_batch", "block_batch", "reset_goal"]),
        goal: z.string().optional().describe("Required for 'analyze' action"),
        taskId: z.string().optional().describe("Required for 'start_batch', 'complete_batch', and 'block_batch' actions"),
        notes: z.string().optional().describe("Required verification notes for 'complete_batch', or reason for 'block_batch'"),
        confirmation: z.string().optional().describe("Must be exactly 'RESET_GOAL_STATE' for 'reset_goal' action")
      }),
      execute: async ({ action, goal, taskId, notes, confirmation }) => {
        try {
          const { GoalEngine } = await import("../goal-engine");
          const engine = new GoalEngine(slugId);
          
          if (action === "analyze") {
            if (!goal) return { error: "goal is required for analyze action" };
            return await engine.analyze(goal);
          }
          if (action === "view_roadmap") {
            return await engine.getState() || { message: "No active goal state found." };
          }
          if (action === "next_batch") {
            return await engine.getNextBatch() || { message: "No pending tasks found." };
          }
          if (action === "start_batch") {
            if (!taskId) return { error: "taskId is required for start_batch action" };
            return await engine.startBatch(taskId);
          }
          if (action === "complete_batch") {
            if (!taskId || !notes) return { error: "taskId and notes are required for complete_batch action" };
            await engine.completeBatch(taskId, notes);
            return { success: true, message: `Task ${taskId} completed.` };
          }
          if (action === "block_batch") {
            if (!taskId || !notes) return { error: "taskId and notes (reason) are required for block_batch action" };
            await engine.blockBatch(taskId, notes);
            return { success: true, message: `Task ${taskId} blocked.` };
          }
          if (action === "reset_goal") {
            if (confirmation !== "RESET_GOAL_STATE") return { error: "Confirmation must be RESET_GOAL_STATE" };
            await engine.resetGoal(confirmation);
            return { success: true, message: "Goal state reset." };
          }
          return { error: "Unknown action" };
        } catch (e: any) {
          return { error: e.message };
        }
      },
    }),

    //GIT STATUS TOOL
    git_status: tool({
      description:
        "Run git status to get the current changed/status files in the repository",
      inputSchema: z.object({}),
      execute: async () => {
        const statusResult = await box.git.status();
        return {
          success: true,
          message: "Git status retrieved",
          status: statusResult,
        };
      },
    }),

    //COMMIT TOOL
    commit: tool({
      description:
        "Stage all changes and create a commit. Use a short conventional commit subject only, ideally under 72 characters, with no bullet list or body.",
      inputSchema: z.object({
        message: z
          .string()
          .describe("short Commit message e.g. feat: add new feature"),
      }),
      execute: async ({ message }) => {
        // Clean the message to remove any leading bullets or extra whitespace
        const cleanMessage =
          String(message ?? "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean)
            ?.replace(/^[-*•\s]+/, "")
            .replace(/\s+/g, " ")
            .trim() || "chore: update files";

        const diffText = await box.git.diff();
        const { additions, deletions } = getDiffStats(diffText);

        const result = await box.git.commit({ message: cleanMessage });
        return {
          success: true,
          sha: result.sha,
          shortSha: result.sha?.slice(0, 7),
          message: cleanMessage,
          branch: branchName,
          timestamp: new Date().toISOString(),
          additions,
          deletions,
        };
      },
    }),

    // PUSH COMMIT
    git_push: tool({
      description: "Push committed changes to the remote branch",
      inputSchema: z.object({}),
      execute: async () => {
        if (!branchName) return "Branch not passed";
        await box.git.push({ branch: branchName });
        const repoWithoutGit = repoUrl?.replace(/\.git$/, "");
        const repoWithBranch = repoWithoutGit
          ? `${repoWithoutGit}/tree/${branchName}`
          : null;
        const commitResult = await box.git.exec({
          args: ["log", "-1", "--pretty=%s"],
        });
        const commitTitle =
          String(commitResult.output || "").trim() || `Update ${repoName}`;

        try {
          await box.git.exec({
            args: ["pull", "--rebase", "origin", branchName],
          });
        } catch (e) {
        }

        const prBody = `Create a pull request for ${branchName} in ${repoName}.`;

        writer?.write({
          type: "data-pr-ready",
          data: {
            slugId,
            branch: branchName,
            title: commitTitle,
            body: prBody,
          },
          transient: true,
        });

        return {
          success: true,
          branch: branchName,
          repoUrl,
          compareUrl: repoWithBranch,
          timestamp: new Date().toISOString(),
        };
      },
    }),

    // CREATE PR
    //  create_pr: tool({
    //   description: "Open a pull request on GitHub. Only call this if the user explicitly asks for a PR.",
    //   inputSchema: z.object({
    //     title: z.string().describe("Pull request title"),
    //     body: z.string().describe("Pull request description"),
    //   }),
    //   execute: async ({ title, body }) => {
    //     if (!branchName) return "Branch not passed"

    //     const pr = await box.git.createPR({
    //          title,
    //           body,
    //           base:defaultBranch,
    //     });
    //     return {
    //       success: true,
    //       url: pr.url,
    //       title,
    //       body,
    //       base: defaultBranch,
    //       branch: branchName,
    //       timestamp: new Date().toISOString(),
    //     };
    //   },
    // }),
  };
};
