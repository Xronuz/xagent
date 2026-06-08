import { GoalEngine } from "./src/lib/ai/goal-engine";
import { runBatchExecutor } from "./src/lib/ai/batch-executor";
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const slugId = "test-executor-123";
  const engine = new GoalEngine(slugId);
  
  // Set up dummy state
  await engine.analyze("Create a simple index.js file that logs hello world");
  
  const state = await engine.getState();
  if (state && state.roadmap.phases[0].milestones[0].tasks[0]) {
    state.currentBatchId = state.roadmap.phases[0].milestones[0].tasks[0].id;
    state.executionStatus = "running";
    await engine.saveState(state);
    
    console.log("Starting batch executor...");
    await runBatchExecutor(slugId);
    
    const finalState = await engine.getState();
    console.log("Finished execution. Status:", finalState?.executionStatus);
    console.log("Report:", finalState?.lastExecutionReport);
  } else {
    console.log("Failed to initialize state");
  }
}

main().catch(console.error);
