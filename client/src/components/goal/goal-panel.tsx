import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGoalState, executeGoalAction } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function GoalPanel({ slugId, isOpen, onClose }: { slugId: string; isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [goalInput, setGoalInput] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [resetInput, setResetInput] = useState("");
  const [activeDialog, setActiveDialog] = useState<"complete" | "block" | "reset" | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ["goal", slugId],
    queryFn: () => getGoalState(slugId),
    enabled: isOpen && !!slugId,
    refetchInterval: (query) => {
      const execStatus = query.state?.data?.state?.executionStatus;
      return ["running", "verifying", "self_healing"].includes(execStatus) ? 3000 : false;
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: any) => executeGoalAction(slugId, payload),
    onSuccess: (res) => {
      queryClient.setQueryData(["goal", slugId], { state: res.state });
      setActiveDialog(null);
      setVerificationNotes("");
      setBlockReason("");
      setResetInput("");
    },
  });

  const state = data?.state;

  const [executionFeed, setExecutionFeed] = useState<{time: number, message: string}[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const prevExecStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const currentStatus = state.executionStatus;
    const prevStatus = prevExecStatusRef.current;
    
    // Execution start check
    if (["running", "verifying", "self_healing"].includes(currentStatus)) {
      if (!prevStatus || !["running", "verifying", "self_healing"].includes(prevStatus)) {
        setExecutionFeed([]);
        setElapsedSeconds(0);
      }
    }
    
    if (state.lastReport) {
      setExecutionFeed(prev => {
        if (prev.length === 0 || prev[prev.length - 1].message !== state.lastReport) {
          return [...prev, { time: Date.now(), message: state.lastReport! }];
        }
        return prev;
      });
    }

    if (prevStatus && ["running", "verifying", "self_healing"].includes(prevStatus)) {
      if (currentStatus === "completed") {
        setExecutionFeed(prev => [...prev, { time: Date.now(), message: "Status: Success" }]);
        toast.success("Batch execution completed");
      } else if (currentStatus === "failed") {
        setExecutionFeed(prev => [...prev, { time: Date.now(), message: "Status: Failed" }]);
        toast.error("Batch execution failed");
      } else if (currentStatus === "blocked") {
        setExecutionFeed(prev => [...prev, { time: Date.now(), message: "Status: Blocked" }]);
        toast.error("Execution blocked. Approval required.");
      }
    }
    prevExecStatusRef.current = currentStatus;
  }, [state?.executionStatus, state?.lastReport]);

  useEffect(() => {
    let interval: any;
    if (state && ["running", "verifying", "self_healing"].includes(state.executionStatus)) {
       interval = setInterval(() => {
          setElapsedSeconds(prev => prev + 1);
       }, 1000);
    }
    return () => clearInterval(interval);
  }, [state?.executionStatus]);

  if (!isOpen) return null;

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "running": return "Executing batch...";
      case "verifying": return "Running verification...";
      case "self_healing": return "Fixing detected errors...";
      case "completed": return "Execution completed";
      case "failed": return "Execution failed";
      case "blocked": return "Approval required / blocked";
      default: return status.toUpperCase();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-[400px] sm:w-[540px] flex flex-col p-0">
        <SheetHeader className="p-6 border-b">
          <SheetTitle>Goal Mode</SheetTitle>
          <SheetDescription>Plan and execute tasks structurally.</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          {isPending && <div className="flex justify-center p-4"><Spinner /></div>}
          
          {error && (
            <div className="p-4 bg-destructive/10 text-destructive rounded-md mb-4">
              Error loading goal state.
            </div>
          )}

          {!isPending && !state && (
            <div className="space-y-4">
              <h3 className="font-medium text-sm">Define a new Goal</h3>
              <Textarea 
                placeholder="E.g. Build a landing page..." 
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                rows={4}
              />
              <Button 
                onClick={() => mutation.mutate({ action: "analyze", goal: goalInput })}
                disabled={mutation.isPending || !goalInput.trim()}
                className="w-full"
              >
                {mutation.isPending ? <Spinner className="mr-2" /> : null}
                Analyze Goal
              </Button>
            </div>
          )}

          {state && (
            <div className="space-y-6">
              <div className="p-4 bg-muted/30 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{state.goal}</h3>
                  <Badge variant={state.status === 'completed' ? 'default' : state.status === 'blocked' ? 'destructive' : 'secondary'}>
                    {state.status.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
                  <div className="p-2 bg-secondary/50 rounded flex flex-col">
                    <span className="text-2xl font-bold">{state.pendingCount}</span>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Pending</span>
                  </div>
                  <div className="p-2 bg-secondary/50 rounded flex flex-col">
                    <span className="text-2xl font-bold">{state.completedCount}</span>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Done</span>
                  </div>
                  <div className="p-2 bg-secondary/50 rounded flex flex-col">
                    <span className="text-2xl font-bold">{state.blockedCount}</span>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Blocked</span>
                  </div>
                </div>
                
                {state.lastReport && (
                  <div className="mt-4 text-xs text-muted-foreground italic border-l-2 pl-2 border-primary/50">
                    Latest: {state.lastReport}
                  </div>
                )}
              </div>

              {state.roadmap?.phases?.map((phase: any, pIdx: number) => (
                <div key={pIdx} className="space-y-4">
                  <h4 className="font-medium border-b pb-1">Phase {pIdx + 1}: {phase.name}</h4>
                  {phase.milestones.map((ms: any, mIdx: number) => (
                    <div key={mIdx} className="pl-4 border-l-2 space-y-3">
                      <h5 className="text-sm font-semibold text-muted-foreground">{ms.name}</h5>
                      <div className="space-y-2">
                        {ms.tasks.map((task: any) => {
                          const isActive = state.currentBatchId === task.id;
                          return (
                            <div key={task.id} className={`p-3 text-sm rounded-md border ${isActive ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background'}`}>
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-medium">{task.id}: {task.title}</span>
                                <Badge variant={task.status === 'completed' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'} className="text-[10px]">
                                  {task.status}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground text-xs mb-3">{task.description}</p>
                              
                              {task.status === 'pending' && !state.currentBatchId && (
                                <Button size="sm" variant="outline" className="w-full h-7 text-xs" 
                                  onClick={() => mutation.mutate({ action: "start_batch", taskId: task.id })}
                                  disabled={mutation.isPending}>
                                  Start Batch
                                </Button>
                              )}
                              
                              {isActive && (
                                <div className="space-y-3 mt-3 pt-3 border-t">
                                  <div className="flex justify-between items-center bg-secondary/30 p-2 rounded text-xs">
                                    <span className="font-medium text-muted-foreground">Execution Status:</span>
                                    <Badge variant={
                                      ["failed", "blocked"].includes(state.executionStatus) ? "destructive" : 
                                      state.executionStatus === "completed" ? "default" : "outline"
                                    }>
                                      {getStatusDisplay(state.executionStatus)}
                                    </Badge>
                                  </div>

                                  <Button 
                                    size="sm" 
                                    className="w-full"
                                    disabled={mutation.isPending || ["running", "verifying", "self_healing"].includes(state.executionStatus)}
                                    onClick={() => {
                                      if (task.riskLevel === "high" && !window.confirm("High risk batch. Are you sure you want to execute?")) return;
                                      mutation.mutate({ action: "execute_batch", confirmedHighRisk: true });
                                    }}
                                  >
                                    {["running", "verifying", "self_healing"].includes(state.executionStatus) ? (
                                      <><Spinner className="mr-2 h-4 w-4" /> Executing...</>
                                    ) : "Execute Current Batch"}
                                  </Button>

                                  {(executionFeed.length > 0 || ["running", "verifying", "self_healing"].includes(state.executionStatus)) && (
                                    <div className="p-2 text-[11px] font-mono bg-black text-green-400 border rounded-md overflow-hidden flex flex-col">
                                      <div className="flex justify-between items-center mb-2 pb-1 border-b border-green-800">
                                        <span className="font-semibold text-green-300">Live Execution Feed</span>
                                        {["running", "verifying", "self_healing"].includes(state.executionStatus) && (
                                          <span className="text-green-500">{Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}</span>
                                        )}
                                      </div>
                                      <div className="space-y-1 max-h-40 overflow-y-auto flex flex-col">
                                        {executionFeed.map((feed, idx) => (
                                          <div key={idx} className={idx === executionFeed.length - 1 ? "text-green-300 font-semibold" : "text-green-500 opacity-80"}>
                                            <span className="opacity-50 mr-2">{new Date(feed.time).toLocaleTimeString([], { hour12: false })}</span>
                                            {feed.message}
                                          </div>
                                        ))}
                                        {["running", "verifying", "self_healing"].includes(state.executionStatus) && (
                                          <div className="text-green-300 animate-pulse mt-1">...</div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {state.lastExecutionReport && !["running", "verifying", "self_healing"].includes(state.executionStatus) && (
                                    <div className="p-2 text-xs bg-muted/50 border rounded-md mt-2">
                                      <p className="font-semibold mb-1">Final Summary:</p>
                                      <p className="text-muted-foreground mb-2">{state.lastExecutionReport.message || (state.lastExecutionReport.success ? "Success" : "Failed")}</p>
                                      {state.lastExecutionReport.agentOutput && (
                                        <pre className="text-[10px] bg-background p-2 rounded overflow-auto max-h-32">
                                          {state.lastExecutionReport.agentOutput}
                                        </pre>
                                      )}
                                    </div>
                                  )}

                                  {activeDialog === "complete" ? (
                                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200 pt-2 border-t mt-2">
                                      <Textarea className="text-xs min-h-[60px]" placeholder="Verification notes (required)" value={verificationNotes} onChange={e => setVerificationNotes(e.target.value)} />
                                      <div className="flex gap-2">
                                        <Button size="sm" className="flex-1 h-7 text-xs" disabled={!verificationNotes.trim() || mutation.isPending} onClick={() => mutation.mutate({ action: "complete_batch", taskId: task.id, notes: verificationNotes })}>Confirm</Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setActiveDialog(null)}>Cancel</Button>
                                      </div>
                                    </div>
                                  ) : activeDialog === "block" ? (
                                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200 pt-2 border-t mt-2">
                                      <Textarea className="text-xs min-h-[60px]" placeholder="Reason for block (required)" value={blockReason} onChange={e => setBlockReason(e.target.value)} />
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" disabled={!blockReason.trim() || mutation.isPending} onClick={() => mutation.mutate({ action: "block_batch", taskId: task.id, notes: blockReason })}>Confirm</Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setActiveDialog(null)}>Cancel</Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2 pt-2 border-t mt-2">
                                      <Button size="sm" variant="secondary" className="flex-1 h-7 text-xs" onClick={() => {
                                        const defaultNotes = state.lastExecutionReport 
                                          ? `${state.lastExecutionReport.message}\n${state.lastExecutionReport.agentOutput ? state.lastExecutionReport.agentOutput.substring(0, 250) + (state.lastExecutionReport.agentOutput.length > 250 ? "..." : "") : ""}`
                                          : "";
                                        setVerificationNotes(defaultNotes.trim());
                                        setActiveDialog("complete");
                                      }}>Mark Complete</Button>
                                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs text-destructive hover:text-destructive" onClick={() => {
                                        setBlockReason(state.lastExecutionReport?.error || "");
                                        setActiveDialog("block");
                                      }}>Block</Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              <div className="pt-8 pb-4 mt-8 border-t border-destructive/20">
                {activeDialog === "reset" ? (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-3">
                    <p className="text-xs text-destructive font-semibold">Type RESET_GOAL_STATE to confirm</p>
                    <Input className="h-8 text-xs" value={resetInput} onChange={e => setResetInput(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs" disabled={resetInput !== "RESET_GOAL_STATE" || mutation.isPending} onClick={() => mutation.mutate({ action: "reset_goal", confirmation: resetInput })}>Confirm Reset</Button>
                      <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" onClick={() => { setActiveDialog(null); setResetInput(""); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground" onClick={() => setActiveDialog("reset")}>
                    Reset Goal State
                  </Button>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
