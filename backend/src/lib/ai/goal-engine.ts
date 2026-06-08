import { generateObject } from "ai";
import { deepseek } from "@ai-sdk/deepseek";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// Define the Task schema
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "blocked"]),
  acceptanceCriteria: z.array(z.string()),
  verificationSteps: z.array(z.string()),
  riskLevel: z.enum(["low", "medium", "high"]),
  filesLikelyTouched: z.array(z.string()),
  dependencies: z.array(z.string()),
  notes: z.string().optional(),
});

// Define the Roadmap schema
export const RoadmapSchema = z.object({
  phases: z.array(
    z.object({
      name: z.string(),
      milestones: z.array(
        z.object({
          name: z.string(),
          acceptanceCriteria: z.array(z.string()),
          tasks: z.array(TaskSchema),
        })
      ),
    })
  ),
});

// Define the Goal State schema
export const GoalStateSchema = z.object({
  goal: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(["active", "completed", "blocked"]),
  analysis: z.object({
    modules: z.array(z.string()),
    dependencies: z.array(z.string()),
    risks: z.array(z.string()),
  }),
  roadmap: RoadmapSchema,
  currentBatchId: z.string().nullable(),
  executionStatus: z.enum(["idle", "running", "verifying", "self_healing", "completed", "failed", "blocked"]).default("idle"),
  currentExecutionId: z.string().nullable().default(null),
  lastExecutionReport: z.any().nullable().default(null),
  executionStartedAt: z.string().nullable().default(null),
  executionFinishedAt: z.string().nullable().default(null),
  completedCount: z.number(),
  pendingCount: z.number(),
  blockedCount: z.number(),
  lastReport: z.string().nullable(),
});

export type Task = z.infer<typeof TaskSchema>;
export type GoalState = z.infer<typeof GoalStateSchema>;

export class GoalEngine {
  private statePath: string;

  constructor(slugId: string) {
    // Store in backend/.sandboxes/[slugId]/goal_state.json
    const sandboxesDir = path.resolve(__dirname, "../../../../.sandboxes");
    this.statePath = path.join(sandboxesDir, slugId, "goal_state.json");
  }

  private async ensureDir() {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
  }

  async getState(): Promise<GoalState | null> {
    try {
      const data = await fs.readFile(this.statePath, "utf-8");
      return JSON.parse(data) as GoalState;
    } catch (e: any) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async saveState(state: GoalState) {
    await this.ensureDir();
    state.updatedAt = new Date().toISOString();
    
    // Recalculate counts
    let pending = 0, completed = 0, blocked = 0;
    for (const phase of state.roadmap.phases) {
      for (const ms of phase.milestones) {
        for (const task of ms.tasks) {
          if (task.status === "pending" || task.status === "in_progress") pending++;
          if (task.status === "completed") completed++;
          if (task.status === "blocked") blocked++;
        }
      }
    }
    state.pendingCount = pending;
    state.completedCount = completed;
    state.blockedCount = blocked;

    if (state.pendingCount === 0 && state.blockedCount === 0 && state.completedCount > 0) {
      state.status = "completed";
    }

    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), "utf-8");
  }

  async analyze(goal: string): Promise<GoalState> {
    const prompt = `You are a technical project manager. Analyze the following goal and generate a structured roadmap.
Goal: ${goal}
Break this down into phases, milestones, and specific executable tasks.
For each task, include acceptance criteria, verification steps, files likely touched, risk level, and any dependencies.`;

    const { object } = await generateObject({
      model: deepseek("deepseek-chat"),
      schema: z.object({
        analysis: z.object({
          modules: z.array(z.string()),
          dependencies: z.array(z.string()),
          risks: z.array(z.string()),
        }),
        roadmap: RoadmapSchema,
      }),
      prompt,
    });

    const state: GoalState = {
      goal,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      analysis: object.analysis,
      roadmap: object.roadmap,
      currentBatchId: null,
      executionStatus: "idle",
      currentExecutionId: null,
      lastExecutionReport: null,
      executionStartedAt: null,
      executionFinishedAt: null,
      completedCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      lastReport: null,
    };

    // Ensure all tasks start as pending and have an ID
    let taskIdCounter = 1;
    for (const phase of state.roadmap.phases) {
      for (const ms of phase.milestones) {
        for (const task of ms.tasks) {
          if (!task.id) task.id = `T-${taskIdCounter++}`;
          task.status = "pending";
        }
      }
    }

    await this.saveState(state);
    return state;
  }

  async getNextBatch(): Promise<Task | null> {
    const state = await this.getState();
    if (!state) throw new Error("No active goal state found.");

    if (state.currentBatchId) {
       const curr = this.findTask(state, state.currentBatchId);
       if (curr && curr.status === "in_progress") return curr;
    }

    for (const phase of state.roadmap.phases) {
      for (const ms of phase.milestones) {
        for (const task of ms.tasks) {
          if (task.status === "pending") {
            return task;
          }
        }
      }
    }
    return null;
  }

  async startBatch(taskId: string): Promise<Task> {
    const state = await this.getState();
    if (!state) throw new Error("No active goal state found.");

    if (state.currentBatchId && state.currentBatchId !== taskId) {
      const current = this.findTask(state, state.currentBatchId);
      if (current && current.status === "in_progress") {
        throw new Error(`Another task (${state.currentBatchId}) is currently in progress. Complete or block it first.`);
      }
    }

    const task = this.findTask(state, taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    task.status = "in_progress";
    state.currentBatchId = taskId;
    await this.saveState(state);
    return task;
  }

  async completeBatch(taskId: string, verificationNotes: string): Promise<void> {
    if (!verificationNotes || verificationNotes.trim() === "") {
       throw new Error("Verification notes are required to complete a batch.");
    }

    const state = await this.getState();
    if (!state) throw new Error("No active goal state found.");

    const task = this.findTask(state, taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    task.status = "completed";
    task.notes = verificationNotes;
    if (state.currentBatchId === taskId) {
      state.currentBatchId = null;
    }
    
    state.lastReport = `Completed ${taskId}: ${verificationNotes}`;
    await this.saveState(state);
  }

  async blockBatch(taskId: string, reason: string): Promise<void> {
    if (!reason || reason.trim() === "") {
      throw new Error("A reason is required to block a batch.");
    }

    const state = await this.getState();
    if (!state) throw new Error("No active goal state found.");

    const task = this.findTask(state, taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    task.status = "blocked";
    task.notes = `BLOCKED: ${reason}`;
    if (state.currentBatchId === taskId) {
      state.currentBatchId = null;
    }

    state.lastReport = `Blocked ${taskId}: ${reason}`;
    state.status = "blocked";
    await this.saveState(state);
  }

  async resetGoal(confirmation: string): Promise<void> {
    if (confirmation !== "RESET_GOAL_STATE") {
      throw new Error("Invalid confirmation string. Must be exactly 'RESET_GOAL_STATE'");
    }
    
    try {
      await fs.unlink(this.statePath);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  private findTask(state: GoalState, taskId: string): Task | null {
    for (const phase of state.roadmap.phases) {
      for (const ms of phase.milestones) {
        for (const task of ms.tasks) {
          if (task.id === taskId) return task;
        }
      }
    }
    return null;
  }
}
