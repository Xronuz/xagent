import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useUser } from "@/hooks/use-user";
import { createSessionPullRequest, getGithubRepos, executeGoalAction, getGoalState } from "@/lib/api";
import { cn, generateSlugId } from "@/lib/utils";
import type { GithubRepo } from "@/types/github.type";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { BASE_API_URL } from "@/lib/env";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "../ai-elements/conversation";
import Logo from "../logo";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import { renderToolPart } from "./tool-parts";
import { Loader } from "../loader";
import ChatInput, { type WorkspaceMode } from "./chat-input";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { GoalPanel } from "@/components/goal/goal-panel";
import { GoalTimeline, type GoalEvent, type ExecutionPolicy } from "@/components/goal/goal-timeline";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatInterfaceProps = {
  className?: string;
  initialMessages?: UIMessage[];
  sessionTitle?: string;
  slugId?: string;
  repoUrl?: string;
  defaultBranch?: string;
  branchName?: string | null;
  isSingleSession?: boolean;
};

type SelectedRepo = {
  value: string;
  defaultBranch: string;
};

type PullRequestReady = {
  slugId: string;
  title: string;
  body: string;
  branch: string;
};

// ─── Scroll Helper ────────────────────────────────────────────────────────────

const ScrollToBottomOnUpdate = ({ dep }: { dep: number }) => {
  const { scrollToBottom } = useStickToBottomContext();
  const previousDep = useRef(dep);
  const scrollRef = useRef(scrollToBottom);
  scrollRef.current = scrollToBottom;

  useEffect(() => {
    if (dep <= previousDep.current) {
      previousDep.current = dep;
      return;
    }
    scrollRef.current();
    previousDep.current = dep;
  }, [dep]);

  return null;
};

// ─── Utility ──────────────────────────────────────────────────────────────────

let _evtCounter = 0;
const nextId = () => `evt-${++_evtCounter}`;

function getFirstPendingTask(state: any): any | null {
  if (!state?.roadmap?.phases) return null;
  for (const ph of state.roadmap.phases) {
    for (const ms of ph.milestones) {
      for (const t of ms.tasks) {
        if (t.status === "pending") return t;
      }
    }
  }
  return null;
}

function findTaskById(state: any, taskId: string): any | null {
  if (!state?.roadmap?.phases) return null;
  for (const ph of state.roadmap.phases) {
    for (const ms of ph.milestones) {
      for (const t of ms.tasks) {
        if (t.id === taskId) return t;
      }
    }
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ChatInterface = ({
  className,
  initialMessages,
  sessionTitle: sessionTitleProp,
  slugId: slugIdProp,
  repoUrl,
  defaultBranch,
  branchName: branchNameProp,
  isSingleSession = false,
}: ChatInterfaceProps) => {
  const [repo, setRepo] = useState<SelectedRepo | null>(
    repoUrl
      ? { value: repoUrl, defaultBranch: defaultBranch ?? "main" }
      : null,
  );
  const [sessionTitle, setSessionTitle] = useState<string | null>(sessionTitleProp ?? null);
  const [branchName, setBranchName] = useState<string | null>(branchNameProp ?? null);
  const [prReady, setPrReady] = useState<PullRequestReady | null>(null);
  const [createdPrUrl, setCreatedPrUrl] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(repoUrl ? "github" : "github");
  const [localPath, setLocalPath] = useState<string>("");
  const [isGoalPanelOpen, setIsGoalPanelOpen] = useState(false);
  const [goalModeEnabled, setGoalModeEnabled] = useState(false);
  const [executionPolicy, setExecutionPolicy] = useState<ExecutionPolicy>("safe");

  // ─ Goal timeline events (separate from chat messages) ─
  const [goalEvents, setGoalEvents] = useState<GoalEvent[]>([]);
  // Tracks whether the auto-executor loop should keep running
  const autoRunRef = useRef(false);

  const [slugId] = useState(() => slugIdProp || generateSlugId());

  const queryClient = useQueryClient();
  const { data: currentUser } = useUser();
  const isGithubConnected = Boolean(currentUser?.user?.githubConnected);

  const { data: githubRepos, isPending: isGithubRepoPending } = useQuery({
    queryKey: ["github-repos"],
    queryFn: getGithubRepos,
    enabled: isGithubConnected,
    retry: false,
  });
  const repoOptions =
    githubRepos?.repos?.map((repoItem: GithubRepo) => ({
      label: repoItem.fullName,
      value: repoItem.cloneUrl,
      defaultBranch: repoItem.defaultBranch,
    })) ?? [];

  // ─ PR mutation ───────────────────────────────────────
  const createPrMutation = useMutation({
    mutationFn: (payload: PullRequestReady) =>
      createSessionPullRequest(payload.slugId, { title: payload.title, body: payload.body }),
    onSuccess: (data) => {
      setPrReady(null);
      setCreatedPrUrl(data.url);
      toast.success("Pull request created");
    },
    onError: () => {
      toast.error("Failed to create pull request");
    },
  });

  // ─ Goal state polling ─────────────────────────────────
  const goalAnalyzeIsPending = useRef(false);
  const executeBatchIsPending = useRef(false);

  const { data: goalData, refetch: refetchGoal } = useQuery({
    queryKey: ["goal", slugId],
    queryFn: () => getGoalState(slugId),
    enabled: !!slugId,
    refetchInterval: (query) => {
      const execStatus = query.state?.data?.state?.executionStatus;
      return ["running", "verifying", "self_healing"].includes(execStatus) ? 2000 : false;
    },
  });
  const goalState = goalData?.state;

  // ─ Helpers ───────────────────────────────────────────
  const addEvent = useCallback((ev: GoalEvent) => {
    setGoalEvents((prev) => [...prev, ev]);
  }, []);

  const getWorkspaceParams = useCallback(() => ({
    repoUrl: workspaceMode === "github" ? repo?.value : undefined,
    repoName: workspaceMode === "github" ? repo?.value?.split("/").pop() : undefined,
    branchName: branchName ?? undefined,
  }), [workspaceMode, repo, branchName]);

  // ─ start_batch ───────────────────────────────────────
  const startBatchMutation = useMutation({
    mutationFn: (taskId: string) =>
      executeGoalAction(slugId, { action: "start_batch", taskId }),
    onSuccess: (res) => {
      queryClient.setQueryData(["goal", slugId], { state: res.state });
    },
  });

  // ─ execute_batch ─────────────────────────────────────
  const executeBatchMutation = useMutation({
    mutationFn: (params: { confirmedHighRisk: boolean }) =>
      executeGoalAction(slugId, {
        action: "execute_batch",
        confirmedHighRisk: params.confirmedHighRisk,
        ...getWorkspaceParams(),
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(["goal", slugId], { state: res.state });
    },
  });

  // ─ analyze mutation ───────────────────────────────────
  const goalAnalyzeMutation = useMutation({
    mutationFn: (goal: string) =>
      executeGoalAction(slugId, { action: "analyze", goal }),
    onSuccess: () => {},
    onError: () => {},
  });

  // ─── Core: execute one batch ──────────────────────────
  const executeOneBatch = useCallback(async (taskId: string, taskTitle: string, confirmedHighRisk: boolean) => {
    executeBatchIsPending.current = true;

    addEvent({ type: "batch_executing", taskId, taskTitle, id: nextId(), ts: Date.now() });

    try {
      await executeBatchMutation.mutateAsync({ confirmedHighRisk });

      // Poll until execution finishes
      let attempts = 0;
      while (attempts < 120) {
        await new Promise((r) => setTimeout(r, 2500));
        const freshData = await refetchGoal();
        const st = freshData.data?.state;
        if (!st) break;

        const status = st.executionStatus;
        if (["running", "verifying", "self_healing"].includes(status)) {
          attempts++;
          continue;
        }

        // Execution finished
        const latestState = st;
        queryClient.setQueryData(["goal", slugId], { state: latestState });

        if (status === "completed") {
          const report = latestState.lastExecutionReport;
          addEvent({ type: "batch_completed", taskId, taskTitle, report, id: nextId(), ts: Date.now() });

          // Auto-complete: mark batch as done with verification notes
          const notes = report?.message || report?.agentOutput?.substring(0, 250) || "Completed successfully";
          try {
            await executeGoalAction(slugId, { action: "complete_batch", taskId, notes });
          } catch { /* best effort */ }

          const fresh2 = await refetchGoal();
          const st2 = fresh2.data?.state;
          const nextTask = getFirstPendingTask(st2);

          executeBatchIsPending.current = false;
          return { success: true, nextTask, finalState: st2 };
        }

        if (status === "failed") {
          const err = latestState.lastExecutionReport?.error || "Execution failed.";
          addEvent({ type: "batch_failed", taskId, taskTitle, error: err, id: nextId(), ts: Date.now() });
          executeBatchIsPending.current = false;
          return { success: false, nextTask: null, finalState: latestState };
        }

        if (status === "blocked") {
          addEvent({ type: "batch_blocked", taskId, taskTitle, id: nextId(), ts: Date.now() });
          executeBatchIsPending.current = false;
          return { success: false, nextTask: null, finalState: latestState };
        }

        break;
      }

      executeBatchIsPending.current = false;
      return { success: false, nextTask: null, finalState: null };
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err.message || "Execution error";
      addEvent({ type: "batch_failed", taskId, taskTitle, error: errMsg, id: nextId(), ts: Date.now() });
      executeBatchIsPending.current = false;
      return { success: false, nextTask: null, finalState: null };
    }
  }, [addEvent, executeBatchMutation, refetchGoal, queryClient, slugId]);

  // ─── Core: start + execute one batch ────────────────
  const startAndExecuteOneBatch = useCallback(async (task: any, isHighRiskApproved: boolean = false) => {
    const taskId = task.id as string;
    const taskTitle = task.title as string;
    const riskLevel = task.riskLevel as string;

    // High-risk check (only for safe/auto modes)
    if (riskLevel === "high" && !isHighRiskApproved && executionPolicy !== "yolo") {
      addEvent({ type: "approval_required", taskId, taskTitle, riskLevel, id: nextId(), ts: Date.now() });
      autoRunRef.current = false;
      return;
    }

    addEvent({ type: "batch_starting", taskId, taskTitle, id: nextId(), ts: Date.now() });
    await startBatchMutation.mutateAsync(taskId);

    const result = await executeOneBatch(taskId, taskTitle, executionPolicy === "yolo");

    if (!result.success) {
      autoRunRef.current = false;
      return;
    }

    const nextTask = result.nextTask;
    const goalDone = !nextTask;

    if (goalDone) {
      addEvent({ type: "goal_completed", id: nextId(), ts: Date.now() });
      autoRunRef.current = false;
      return;
    }

    // Decide what to do next based on policy
    if (executionPolicy === "safe") {
      // Always pause after one batch
      addEvent({
        type: "continue_prompt",
        nextTaskId: nextTask?.id ?? null,
        nextTaskTitle: nextTask?.title ?? null,
        goalDone: false,
        id: nextId(),
        ts: Date.now(),
      });
      autoRunRef.current = false;
    } else if (executionPolicy === "auto" || executionPolicy === "yolo") {
      // Auto-continue if still running
      if (autoRunRef.current && nextTask) {
        await startAndExecuteOneBatch(nextTask, executionPolicy === "yolo");
      } else {
        addEvent({
          type: "continue_prompt",
          nextTaskId: nextTask?.id ?? null,
          nextTaskTitle: nextTask?.title ?? null,
          goalDone: false,
          id: nextId(),
          ts: Date.now(),
        });
      }
    }
  }, [addEvent, startBatchMutation, executeOneBatch, executionPolicy]);

  // ─ handleGoalSubmit ──────────────────────────────────
  const handleGoalSubmit = async (message: any) => {
    if (!message.text.trim()) {
      toast.error("Please enter a message");
      return Promise.reject(new Error("Empty message"));
    }
    if (workspaceMode === "github" && (!isGithubConnected || !repo)) {
      toast.error("Please select a repository first");
      return Promise.reject(new Error("No repo"));
    }
    if (workspaceMode === "local" && !localPath.trim()) {
      toast.error("Please enter a local folder path");
      return Promise.reject(new Error("No local path"));
    }

    // Reset
    setGoalEvents([]);
    autoRunRef.current = executionPolicy === "auto" || executionPolicy === "yolo";
    queryClient.setQueryData(["goal", slugId], null);

    addEvent({ type: "goal_submitted", text: message.text, id: nextId(), ts: Date.now() });
    addEvent({ type: "planning", id: nextId(), ts: Date.now() });

    goalAnalyzeIsPending.current = true;

    try {
      const res = await goalAnalyzeMutation.mutateAsync(message.text);
      const state = res.state;
      queryClient.setQueryData(["goal", slugId], { state });
      goalAnalyzeIsPending.current = false;

      addEvent({ type: "roadmap_ready", state, policy: executionPolicy, id: nextId(), ts: Date.now() });

      // Auto-start first batch
      const firstTask = getFirstPendingTask(state);
      if (firstTask) {
        await startAndExecuteOneBatch(firstTask);
      }
    } catch (err: any) {
      goalAnalyzeIsPending.current = false;
      const errorMsg =
        err?.response?.data?.error ||
        err.message ||
        "Goal analysis failed. Please check your API key and try again.";
      addEvent({ type: "goal_error", message: errorMsg, id: nextId(), ts: Date.now() });
      throw err;
    }
  };

  // ─ continueNextBatch ─────────────────────────────────
  const continueNextBatch = useCallback(async () => {
    const fresh = await refetchGoal();
    const st = fresh.data?.state;
    const nextTask = getFirstPendingTask(st);
    if (!nextTask) {
      addEvent({ type: "goal_completed", id: nextId(), ts: Date.now() });
      return;
    }
    // Remove old continue_prompt (keep it immutable; just add new events)
    autoRunRef.current = executionPolicy === "auto" || executionPolicy === "yolo";
    await startAndExecuteOneBatch(nextTask);
  }, [refetchGoal, addEvent, startAndExecuteOneBatch, executionPolicy]);

  // ─ approveAndExecute ─────────────────────────────────
  const approveAndExecute = useCallback(async (taskId: string) => {
    const fresh = await refetchGoal();
    const st = fresh.data?.state;
    const task = findTaskById(st, taskId);
    if (!task) return;
    await startAndExecuteOneBatch(task, true);
  }, [refetchGoal, startAndExecuteOneBatch]);

  // ─ stopExecution ─────────────────────────────────────
  const stopExecution = useCallback(() => {
    autoRunRef.current = false;
  }, []);

  // ─ Chat transport ─────────────────────────────────────
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${BASE_API_URL}session/chat`,
        credentials: "include",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, messages },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    // @ts-expect-error type mismatch in this SDK version
    initialMessages: initialMessages ?? [],
    transport,
    onData: (part) => {
      const data = part.data as any;
      switch (part.type) {
        case "data-session-title": {
          if (data.title) {
            setSessionTitle(data.title);
            queryClient.invalidateQueries({ queryKey: ["user-sessions"] });
          }
          break;
        }
        case "data-repo-info": {
          if (data.repoUrl) setRepo({ value: data.repoUrl, defaultBranch: data.defaultBranch });
          if (data.branchName) setBranchName(data.branchName);
          break;
        }
        case "data-pr-ready": {
          if (data.slugId) {
            setPrReady({ slugId: data.slugId, title: data.title, body: data.body, branch: data.branch ?? branchName });
            setCreatedPrUrl(null);
          }
          break;
        }
        default:
          break;
      }
    },
    onError: (err) => {
      console.log(err);
      toast.error("Failed to generate response");
    },
  });

  const handleSubmit = async (message: any) => {
    if (workspaceMode === "github") {
      if (!isGithubConnected) { toast.error("Please connect to GitHub first"); return; }
      if (!repo) { toast.error("Please select a repository first"); return; }
    } else {
      if (!localPath.trim()) { toast.error("Please enter a local folder path"); return; }
    }
    if (!message.text.trim()) { toast.error("Please enter a message"); return; }

    setPrReady(null);
    setCreatedPrUrl(null);
    if (!isSingleSession) window.history.pushState(null, "", `/session/${slugId}`);
    if (!sessionTitle) setSessionTitle("Untitled Session");

    sendMessage(
      { text: message.text },
      {
        body: {
          slugId,
          repoUrl: workspaceMode === "github" ? repo?.value : "",
          defaultBranch: workspaceMode === "github" ? repo?.defaultBranch : "main",
          workspaceType: workspaceMode,
          localPath: workspaceMode === "local" ? localPath.trim() : undefined,
        },
      },
    );
  };

  const handleCreatePr = () => {
    if (!prReady || createPrMutation.isPending) return;
    createPrMutation.mutate(prReady);
  };

  const handleBack = () => stop();

  const handleRepoChange = (value: string) => {
    const selectedRepo = repoOptions.find((o) => o.value === value);
    setRepo(selectedRepo ?? { value, defaultBranch: "main" });
  };

  const isLoading = status === "submitted" || status === "streaming";
  const isGoalExecuting = executeBatchMutation.isPending || goalAnalyzeMutation.isPending || startBatchMutation.isPending;

  return (
    <div
      className={cn(
        "flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden",
        className,
        messages.length === 0 && goalEvents.length === 0 && !isSingleSession && "chat--interface",
      )}
    >
      {sessionTitle && (
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <h5 className="text-base font-medium">{sessionTitle}</h5>
        </div>
      )}
      <GoalPanel slugId={slugId} isOpen={isGoalPanelOpen} onClose={() => setIsGoalPanelOpen(false)} />

      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <Conversation className="overflow-hidden!">
          <ConversationContent className={cn("max-w-212 min-h-full mx-auto px-2 py-6")}>
            <ScrollToBottomOnUpdate dep={messages.length + goalEvents.length} />
            <div
              className={cn(
                "flex min-h-full w-full flex-1 flex-col gap-2",
                messages.length === 0 && goalEvents.length === 0 && !isSingleSession &&
                  "items-center justify-center gap-3 text-center",
              )}
            >
              {messages.length === 0 && goalEvents.length === 0 && !isSingleSession ? (
                <ConversationEmptyState className="px-6">
                  <div className="flex flex-col items-center gap-6">
                    <Logo className="size-35" showText={false} />
                    <div className="max-w-2xl space-y-4 text-center">
                      <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                        XAgent
                      </h2>
                      <p className="text-lg font-medium text-muted-foreground">
                        Build. Test. Observe. Improve.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6 text-sm font-medium text-muted-foreground text-left">
                      <div className="flex items-center gap-2"><Check className="size-4 text-primary" /> Local Workspace</div>
                      <div className="flex items-center gap-2"><Check className="size-4 text-primary" /> GitHub Repositories</div>
                      <div className="flex items-center gap-2"><Check className="size-4 text-primary" /> Browser Observation</div>
                      <div className="flex items-center gap-2"><Check className="size-4 text-primary" /> Goal Mode</div>
                      <div className="flex items-center gap-2 col-span-2 justify-center"><Check className="size-4 text-primary" /> Autonomous Execution</div>
                    </div>
                  </div>
                </ConversationEmptyState>
              ) : (
                <>
                  {/* Regular chat messages */}
                  {messages.map((message, msgIndex) => {
                    const isLastMessage = msgIndex === messages.length - 1;
                    return (
                      <Message
                        from={message.role}
                        key={message.id}
                        className="max-w-full gap-0"
                      >
                        <MessageContent className="w-full text-[14.5px] group-[.is-user]:mb-1">
                          {message.parts.map((part, partIndex) => {
                            switch (part.type) {
                              case "reasoning": {
                                const messageText = part.text;
                                const isStreaming = isLastMessage && status === "streaming";
                                return (
                                  <Reasoning
                                    key={`${message.id}-reason-${partIndex}`}
                                    isStreaming={isStreaming}
                                    defaultOpen={false}
                                  >
                                    <ReasoningTrigger />
                                    <ReasoningContent>{messageText}</ReasoningContent>
                                  </Reasoning>
                                );
                              }
                              case "text": {
                                return (
                                  <MessageResponse
                                    key={`${message.id}-text-${partIndex}`}
                                    shikiTheme={["dracula", "dracula"]}
                                  >
                                    {part.text}
                                  </MessageResponse>
                                );
                              }
                              case "tool-list":
                              case "tool-grep":
                              case "tool-read":
                              case "tool-edit":
                              case "tool-write":
                              case "tool-bash":
                              case "tool-git_status":
                              case "tool-commit":
                              case "tool-git_push":
                              case "tool-create_pr":
                              case "tool-web_search": {
                                return renderToolPart(message.id, part as any, partIndex);
                              }
                              default:
                                return null;
                            }
                          })}
                        </MessageContent>
                      </Message>
                    );
                  })}

                  {/* Goal Mode timeline */}
                  {goalEvents.length > 0 && (
                    <div className="w-full max-w-full py-2">
                      <GoalTimeline
                        events={goalEvents}
                        isExecuting={isGoalExecuting}
                        onContinue={continueNextBatch}
                        onStop={stopExecution}
                        onApprove={approveAndExecute}
                        onOpenPanel={() => setIsGoalPanelOpen(true)}
                      />
                    </div>
                  )}
                </>
              )}

              {isLoading && messages.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                  <Loader />
                  <span className="text-sm font-semibold text-muted-foreground">
                    Working...
                  </span>
                </div>
              )}

              {status === "error" && error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Chat Error. Something went wrong.
                </div>
              ) : null}

              <div aria-hidden="true" className="h-96 shrink-0" />
            </div>
          </ConversationContent>
          <ConversationScrollButton className="bottom-56!" />
        </Conversation>

        <ChatInput
          status={status}
          branchName={branchName}
          prReady={prReady}
          createdPrUrl={createdPrUrl}
          hasMessages={messages.length > 0}
          isGithubConnected={isGithubConnected}
          isFetchingRepos={isGithubRepoPending}
          repo={repo}
          onStop={handleBack}
          onSubmit={handleSubmit}
          onGoalSubmit={handleGoalSubmit}
          goalModeEnabled={goalModeEnabled}
          onGoalModeToggle={() => setGoalModeEnabled(!goalModeEnabled)}
          onOpenGoalPanel={() => setIsGoalPanelOpen(true)}
          repoOptions={repoOptions}
          sandboxOptions={[{ value: "sandbox", label: "Sandbox" }]}
          setRepo={handleRepoChange}
          isCreatingPr={createPrMutation.isPending}
          onCreatePr={handleCreatePr}
          workspaceMode={workspaceMode}
          localPath={localPath}
          onWorkspaceModeChange={setWorkspaceMode}
          onLocalPathChange={setLocalPath}
          goalState={goalState}
          isGoalPending={goalAnalyzeMutation.isPending || startBatchMutation.isPending || executeBatchMutation.isPending}
          executionPolicy={executionPolicy}
          onExecutionPolicyChange={setExecutionPolicy}
        />
      </div>
    </div>
  );
};

export default ChatInterface;
