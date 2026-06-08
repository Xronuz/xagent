async function runTest() {
  const API_BASE = 'http://localhost:8000/api';
  const slugId = 'test-e2e-session';

  const fetchJson = async (url: string, opts?: any) => {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts?.headers }
    });
    return res.json();
  };

  console.log("1. Checking connection...");
  try {
    await fetchJson(`${API_BASE}/session/chat`);
  } catch (e) {
    // Might fail if GET chat isn't supported, that's fine.
  }

  console.log("2. Sending Analyze Goal...");
  let data = await fetchJson(`${API_BASE}/session/${slugId}/goal`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'analyze',
      goal: 'Build a simple landing page application'
    })
  });
  console.log("Analyze result:", data ? "Success" : "Failed");

  console.log("3. Getting Goal State...");
  data = await fetchJson(`${API_BASE}/session/${slugId}/goal`);
  const state = data.state;
  console.log("Roadmap phases:", state.roadmap.phases.length);
  
  const firstTask = state.roadmap.phases[0].milestones[0].tasks[0];
  console.log("First Task:", firstTask.title);

  console.log("4. Starting batch...");
  data = await fetchJson(`${API_BASE}/session/${slugId}/goal`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'start_batch',
      taskId: firstTask.id
    })
  });
  console.log("Start batch result:", data.state.currentBatchId === firstTask.id ? "Success" : "Failed");

  console.log("5. Executing current batch...");
  data = await fetchJson(`${API_BASE}/session/${slugId}/goal`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'execute_batch'
    })
  });
  console.log("Execute returns immediately:", data);

  console.log("6. Polling for execution to finish...");
  let execStatus = 'running';
  while (['running', 'verifying', 'self_healing'].includes(execStatus)) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await fetchJson(`${API_BASE}/session/${slugId}/goal`);
    execStatus = poll.state.executionStatus;
    console.log("Status:", execStatus);
  }

  const finalState = (await fetchJson(`${API_BASE}/session/${slugId}/goal`)).state;
  console.log("7. Final Status:", finalState.executionStatus);
  console.log("Last Report:", finalState.lastExecutionReport);
}

runTest().catch(console.error);
