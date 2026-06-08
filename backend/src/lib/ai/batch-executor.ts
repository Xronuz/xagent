import { generateText } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { LocalBox } from "../local-sandbox";
import { observeBrowser } from "../browser-observer";
import { codingTools } from "./tools/github-tools";
import { GoalEngine, Task } from "./goal-engine";
import { runSelfHealingLoop } from "./self-healing";
import { generateId } from "ai";

const EXECUTOR_PROMPT = `
You are a highly restricted Batch Execution Agent. 
Your SOLE purpose is to execute EXACTLY ONE task from the roadmap.
You MUST strictly follow the Acceptance Criteria and Verification Steps provided.

RULES:
1. DO NOT auto-complete the batch.
2. DO NOT start the next batch.
3. DO NOT install dependencies without approval.
4. DO NOT make high-risk changes or architectural rewrites without approval.
5. DO NOT touch unrelated files.
6. Only use the provided tools to edit files, list directories, and run commands.
7. After completing the code changes, run verification steps (like 'npm run build' or 'npx tsc --noEmit').
8. Provide a final comprehensive report detailing what was changed and verified.
`;

export async function runBatchExecutor(slugId: string, repoUrl: string | null = null, repoName: string = "workspace", branchName: string | null = null): Promise<void> {
  const engine = new GoalEngine(slugId);
  const state = await engine.getState();
  
  if (!state || !state.currentBatchId) {
    console.error("Batch Executor Error: No active batch found.");
    return;
  }

  if (state.executionStatus === "running" || state.executionStatus === "verifying" || state.executionStatus === "self_healing") {
    // If we get here but execution was just triggered, let it pass. But typically we prevent parallel runs at the controller level.
  }

  const executionId = state.currentExecutionId || generateId();
  
  // Find task details
  let task: Task | null = null;
  for (const phase of state.roadmap.phases) {
    for (const ms of phase.milestones) {
      const found = ms.tasks.find(t => t.id === state.currentBatchId);
      if (found) task = found;
    }
  }

  if (!task) {
    state.executionStatus = "failed";
    state.lastExecutionReport = { error: "Task details not found in roadmap." };
    await engine.saveState(state);
    return;
  }

  const deepseek = createDeepSeek({
    apiKey: process.env.DEEPSEEK_API_KEY || "",
  });

  // Exclude goal_manager to prevent bypassing batch constraints
  const box = new LocalBox({ boxId: slugId });
  const allTools = codingTools(box, repoUrl, repoName, branchName, slugId);
  const { goal_manager, ...safeTools } = allTools as any;

  try {
    const promptContext = `
EXECUTE THE FOLLOWING BATCH:
Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Risk Level: ${task.riskLevel}

Acceptance Criteria:
${task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

Verification Steps:
${task.verificationSteps.map(v => `- ${v}`).join('\n')}

Files Likely Touched:
${task.filesLikelyTouched.join(', ')}

Dependencies:
${task.dependencies.join(', ')}

Please begin execution, make the necessary file edits, run verification, and output a detailed report of your actions.
`;

    const result = await generateText({
      model: deepseek("deepseek-chat"),
      system: EXECUTOR_PROMPT,
      prompt: promptContext,
      tools: safeTools,
      maxSteps: 5,
    } as any);

    // Refresh state as it might have changed
    const freshState = await engine.getState();
    if (!freshState) return;

    // Check if blocked by approval gates (a tool would return an ApprovalRequest, the LLM usually stops or reports it)
    if (result.text.includes("ApprovalRequest") || result.text.includes("requiresApproval: true")) {
      freshState.executionStatus = "blocked";
      freshState.lastExecutionReport = {
        success: false,
        message: "Execution blocked by approval gates.",
        agentOutput: result.text,
      };
      freshState.executionFinishedAt = new Date().toISOString();
      await engine.saveState(freshState);
      return;
    }

    freshState.executionStatus = "verifying";
    await engine.saveState(freshState);

    // Attempt automatic verification / self-healing if preview URL exists
    // We can assume if the user has a dev server running, we can observe it.
    // However, the agent itself should have run typechecks.
    let selfHealTriggered = false;
    let selfHealingResult = null;

    // We don't have a direct URL tracking yet unless we query process manager.
    // For now, if the LLM output suggests it failed verification, we can trigger self-healing.
    if (result.text.toLowerCase().includes("verification failed") || result.text.toLowerCase().includes("build failed")) {
      selfHealTriggered = true;
      freshState.executionStatus = "self_healing";
      await engine.saveState(freshState);

      // Self-heal loop (without URL, we just rely on typecheck/build errors inside the loop if we pass null URL)
      // Since self-healing requires a URL currently, we might just run a mock or rely on the self-healing agent to use bash.
      // We will skip actual self-healing here if no URL is provided, as it requires browser observer.
      // Instead, we just mark it failed.
      freshState.executionStatus = "failed";
    } else {
      freshState.executionStatus = "completed";
    }

    freshState.lastExecutionReport = {
      success: freshState.executionStatus === "completed",
      message: "Execution loop finished.",
      agentOutput: result.text.substring(0, 500) + (result.text.length > 500 ? "...\n[Truncated]" : ""),
      selfHealTriggered,
      selfHealingResult
    };
    freshState.executionFinishedAt = new Date().toISOString();
    await engine.saveState(freshState);

  } catch (error: any) {
    console.error("Batch Executor Error:", error);
    const freshState = await engine.getState();
    if (freshState) {
      freshState.executionStatus = "failed";
      freshState.lastExecutionReport = {
        success: false,
        error: error.message || "Unknown execution error"
      };
      freshState.executionFinishedAt = new Date().toISOString();
      await engine.saveState(freshState);
    }
  }
}
