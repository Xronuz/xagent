import { generateText, convertToModelMessages, UIMessage, generateId } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { LocalBox } from "../local-sandbox";
import { observeBrowser, BrowserObservation } from "../browser-observer";
import { codingTools } from "./tools/github-tools";

interface HealingReport {
  iteration: number;
  action: string;
  filesChanged: string[];
  success: boolean;
}

export interface SelfHealingResult {
  status: "success" | "failed" | "aborted";
  iterations: number;
  initialErrors: Partial<BrowserObservation>;
  finalErrors: Partial<BrowserObservation>;
  changedFiles: string[];
  report: HealingReport[];
}

const SYSTEM_PROMPT = `
You are a highly restricted, narrow-focused Autonomous Repair Agent.
Your SOLE purpose is to fix the exact runtime/build/typescript errors provided.

RULES:
1. DO NOT create new features.
2. DO NOT perform broad refactors.
3. DO NOT install dependencies or edit package.json unless explicitly required to fix the error and safe to do so.
4. DO NOT touch database, migrations, infrastructure, auth, or payment logic.
5. DO NOT run destructive commands.
6. DO NOT modify more than 3 files per iteration.
7. ONLY use bash for safe verification commands (e.g., npm run typecheck, npm run lint).
8. Inspect source files before proposing edits.
9. Keep your changes extremely minimal and precise.
10. If you are not confident, explain why and stop. Do not guess.

Output:
First explain the root cause. Then use tools to inspect the code. Finally use tools to apply the precise fix.
`;

export async function runSelfHealingLoop(
  box: LocalBox,
  url: string,
  maxIterations: number = 3,
  repoUrl: string | null = null,
  repoName: string = "workspace",
  branchName: string | null = null,
  slugId: string = ""
): Promise<SelfHealingResult> {
  const cappedMaxIterations = Math.min(maxIterations, 5);
  
  const report: HealingReport[] = [];
  const changedFiles = new Set<string>();
  
  let initialErrors: Partial<BrowserObservation> = {};
  let finalErrors: Partial<BrowserObservation> = {};
  
  let previousErrorsHash = "";
  let sameErrorCount = 0;

  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
  });

  const allTools = codingTools(box, repoUrl, repoName, branchName, slugId);
  const allowedTools = {
    read: allTools.read,
    list: allTools.list,
    edit: allTools.edit,
    bash: allTools.bash,
  };

  let iteration = 0;
  
  for (iteration = 0; iteration < cappedMaxIterations; iteration++) {
    // 1. Observe Browser
    const observation = await observeBrowser(url, 3000);
    const hasErrors = 
      observation.consoleErrors.length > 0 || 
      observation.loadError !== null || 
      observation.failedRequests.length > 0;

    const currentErrors = {
      consoleErrors: observation.consoleErrors,
      failedRequests: observation.failedRequests,
      loadError: observation.loadError,
    };

    if (iteration === 0) {
      initialErrors = currentErrors;
    }
    finalErrors = currentErrors;

    if (!hasErrors) {
      return {
        status: "success",
        iterations: iteration,
        initialErrors,
        finalErrors,
        changedFiles: Array.from(changedFiles),
        report,
      };
    }

    const currentErrorsHash = JSON.stringify(currentErrors);
    if (currentErrorsHash === previousErrorsHash) {
      sameErrorCount++;
    } else {
      sameErrorCount = 0;
    }
    previousErrorsHash = currentErrorsHash;

    if (sameErrorCount >= 2) {
      report.push({
        iteration: iteration + 1,
        action: "Aborted: The exact same errors persisted after 2 fix attempts.",
        filesChanged: [],
        success: false,
      });
      return {
        status: "aborted",
        iterations: iteration + 1,
        initialErrors,
        finalErrors,
        changedFiles: Array.from(changedFiles),
        report,
      };
    }

    // 2. Propose & Apply Fix
    try {
      const result = await generateText({
        model: deepseek("deepseek-chat"),
        system: SYSTEM_PROMPT,
        prompt: `The following errors were detected at ${url}:\n${JSON.stringify(currentErrors, null, 2)}\n\nDOM Summary:\n${observation.domSummary}\n\nDiagnose the issue, read relevant files, and apply a minimal fix using your tools. Do not restart the dev server; assume hot reload works.`,
        tools: allowedTools,
        maxSteps: 5,
      } as any);

      const iterationFiles = new Set<string>();
      let finalActionText = result.text.substring(0, 150) + (result.text.length > 150 ? "..." : "");

      // Extract changed files from the steps
      if ((result as any).steps) {
         for (const step of (result as any).steps) {
           if (step.toolCalls) {
             for (const call of step.toolCalls) {
               if (call.toolName === "edit") {
                 const path = (call as any).args?.path || (call as any).input?.path;
                 if (path) {
                   iterationFiles.add(path);
                   changedFiles.add(path);
                 }
               }
             }
           }
         }
      }

      report.push({
        iteration: iteration + 1,
        action: finalActionText || "Tool execution completed",
        filesChanged: Array.from(iterationFiles),
        success: true,
      });
      
    } catch (e: any) {
      console.error(e.stack);
      report.push({
        iteration: iteration + 1,
        action: `LLM Error: ${e.message}`,
        filesChanged: [],
        success: false,
      });
      return {
        status: "aborted",
        iterations: iteration + 1,
        initialErrors,
        finalErrors,
        changedFiles: Array.from(changedFiles),
        report,
      };
    }
  }

  // Check one last time after max iterations
  const finalObservation = await observeBrowser(url, 3000);
  const stillHasErrors = 
    finalObservation.consoleErrors.length > 0 || 
    finalObservation.loadError !== null || 
    finalObservation.failedRequests.length > 0;
    
  finalErrors = {
    consoleErrors: finalObservation.consoleErrors,
    failedRequests: finalObservation.failedRequests,
    loadError: finalObservation.loadError,
  };

  return {
    status: stillHasErrors ? "failed" : "success",
    iterations: iteration,
    initialErrors,
    finalErrors,
    changedFiles: Array.from(changedFiles),
    report,
  };
}
