import { Request, Response } from "express";
import { GoalEngine } from "../lib/ai/goal-engine";

export const getGoalStateController = async (req: Request, res: Response) => {
  try {
    const slugId = req.params.slugId as string;
    if (!slugId) return res.status(400).json({ error: "slugId is required" });

    const engine = new GoalEngine(slugId);
    const state = await engine.getState();
    
    if (!state) {
      return res.status(200).json({ state: null });
    }
    
    return res.status(200).json({ state });
  } catch (error: any) {
    console.error("Error fetching goal state:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
};

export const executeGoalActionController = async (req: Request, res: Response) => {
  try {
    const slugId = req.params.slugId as string;
    const payload = req.body;
    if (!slugId) return res.status(400).json({ error: "slugId is required" });
    if (!payload || !payload.action) return res.status(400).json({ error: "action is required in payload" });

    const engine = new GoalEngine(slugId);
    let result: any = null;

    switch (payload.action) {
      case "analyze":
        if (!payload.goal) return res.status(400).json({ error: "goal is required for analyze action" });
        result = await engine.analyze(payload.goal);
        break;
      case "execute_batch": {
        const state = await engine.getState();
        if (!state || !state.currentBatchId) {
          return res.status(400).json({ error: "No active batch found." });
        }
        if (["running", "verifying", "self_healing"].includes(state.executionStatus)) {
          return res.status(400).json({ error: "Execution already in progress." });
        }
        
        // Find task to check riskLevel
        let currentTask = null;
        for (const phase of state.roadmap.phases) {
          for (const ms of phase.milestones) {
            const found = ms.tasks.find((t: any) => t.id === state.currentBatchId);
            if (found) currentTask = found;
          }
        }
        
        if (currentTask?.riskLevel === "high" && !payload.confirmedHighRisk) {
           return res.status(400).json({ error: "High risk batch requires confirmation." });
        }

        const { runBatchExecutor } = await import("../lib/ai/batch-executor");
        const { generateId } = await import("ai");
        
        const executionId = generateId();
        state.executionStatus = "running";
        state.currentExecutionId = executionId;
        state.executionStartedAt = new Date().toISOString();
        state.executionFinishedAt = null;
        state.lastExecutionReport = null;
        await engine.saveState(state);

        // Run background task
        runBatchExecutor(slugId, req.body.repoUrl, req.body.repoName, req.body.branchName).catch(console.error);
        
        result = { ok: true, executionId, status: "running" };
        break;
      }
      case "next_batch":
        result = await engine.getNextBatch();
        break;
      case "start_batch":
        if (!payload.taskId) return res.status(400).json({ error: "taskId is required" });
        result = await engine.startBatch(payload.taskId);
        break;
      case "complete_batch":
        if (!payload.taskId || !payload.notes) return res.status(400).json({ error: "taskId and notes are required" });
        await engine.completeBatch(payload.taskId, payload.notes);
        result = { success: true };
        break;
      case "block_batch":
        if (!payload.taskId || !payload.notes) return res.status(400).json({ error: "taskId and notes (reason) are required" });
        await engine.blockBatch(payload.taskId, payload.notes);
        result = { success: true };
        break;
      case "reset_goal":
        if (payload.confirmation !== "RESET_GOAL_STATE") return res.status(400).json({ error: "Confirmation must be RESET_GOAL_STATE" });
        await engine.resetGoal(payload.confirmation);
        result = { success: true };
        break;
      case "view_roadmap":
        result = await engine.getState();
        break;
      default:
        return res.status(400).json({ error: "Unknown action" });
    }

    // Always fetch latest state after action to keep UI in sync
    const latestState = await engine.getState();
    return res.status(200).json({ result, state: latestState });
  } catch (error: any) {
    console.error(`Error executing goal action ${req.body?.action}:`, error);
    return res.status(400).json({ error: error.message || "Failed to execute goal action" });
  }
};
