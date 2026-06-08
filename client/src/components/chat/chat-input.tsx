import type { ChatStatus } from "ai";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "../ai-elements/prompt-input";
import { GitBranch, GitPullRequest, FolderOpen, Target, Paperclip, CheckCircle2, Circle, PlayCircle, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import githubLogo from "@/assets/github.svg";
import { connectGithub, pickLocalFolder } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

export type WorkspaceMode = "github" | "local";

type ChatInputProps = {
  status: ChatStatus;
  repo: SelectedRepo | null;
  setRepo: (value: string) => void;
  branchName: string | null;
  prReady: PullRequestReady | null;
  createdPrUrl: string | null;
  hasMessages: boolean;
  isGithubConnected: boolean;
  isFetchingRepos: boolean;
  repoOptions: Array<{ value: string; label: string; defaultBranch: string }>;
  sandboxOptions: Array<{ value: string; label: string }>;
  onSubmit: (message: PromptInputMessage, options?: any) => void;
  onGoalSubmit: (message: PromptInputMessage) => void;
  goalModeEnabled: boolean;
  onGoalModeToggle: () => void;
  onOpenGoalPanel: () => void;
  onStop: () => void;
  onCreatePr: () => void;
  isCreatingPr: boolean;
  workspaceMode: WorkspaceMode;
  localPath: string;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onLocalPathChange: (path: string) => void;
  goalState?: any;
  isGoalPending?: boolean;
};

const ChatInput = ({
  repo,
  setRepo,
  branchName,
  prReady,
  createdPrUrl,
  hasMessages,
  isGithubConnected,
  isFetchingRepos,
  status,
  onSubmit,
  onGoalSubmit,
  goalModeEnabled,
  onGoalModeToggle,
  onOpenGoalPanel,
  onStop,
  onCreatePr,
  repoOptions,
  isCreatingPr,
  workspaceMode,
  localPath,
  onWorkspaceModeChange,
  onLocalPathChange,
  goalState,
  isGoalPending,
}: ChatInputProps) => {
  const isRepoSelectLocked = isFetchingRepos || hasMessages;
  const repoLabel = repoOptions?.find(
    (option) => option.value === repo?.value,
  )?.label;

  const [localPathInput, setLocalPathInput] = useState(localPath);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    try {
      const result = await pickLocalFolder();
      if (result && result.path) {
        setLocalPathInput(result.path);
        onLocalPathChange(result.path);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || "Unsupported or canceled.";
      if (msg !== "User canceled folder selection") {
         alert(msg);
      }
    } finally {
      setIsPickingFolder(false);
    }
  };

  useEffect(() => {
    setLocalPathInput(localPath);
  }, [localPath]);

  const handlePromptSubmit = (message: PromptInputMessage) => {
    if (goalModeEnabled) {
      return onGoalSubmit(message);
    }
    return onSubmit(message);
  };

  const handleConnect = async () => {
    const { url } = await connectGithub();
    window.location.href = url;
  };

  const handleLocalPathBlur = () => {
    onLocalPathChange(localPathInput.trim());
  };

  const handleLocalPathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onLocalPathChange(localPathInput.trim());
      pathInputRef.current?.blur();
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 shrink-0">
      <div className={cn("w-full mx-auto px-0 pb-4 backdrop-blur-sm",
        hasMessages ? "max-w-212" : "max-w-3xl"
      )}>
        
        {/* ── Context Strip (Top Row) ── */}
        <div className="w-full mb-2 flex items-center gap-2 px-2 text-xs overflow-x-auto no-scrollbar">
          
          {/* Status Chip */}
          <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-border bg-background/80 shadow-sm shrink-0">
             <div className={cn("size-2 rounded-full", 
               status === "submitted" || isGoalPending ? "bg-amber-500 animate-pulse" :
               goalState?.executionStatus && ["running", "verifying", "self_healing"].includes(goalState.executionStatus) ? "bg-amber-500 animate-pulse" : 
               goalState?.executionStatus === "blocked" ? "bg-red-500" :
               "bg-green-500" // Awaiting input
             )} />
             <span className="text-muted-foreground font-medium text-[11px] uppercase tracking-wider">
               {status === "submitted" || isGoalPending ? "Thinking" :
                goalState?.executionStatus && ["running", "verifying", "self_healing"].includes(goalState.executionStatus) ? goalState.executionStatus :
                goalState?.executionStatus === "blocked" ? "Blocked" :
                "Awaiting Input"}
             </span>
          </div>

          {/* Workspace Chip */}
          <Popover>
            <PopoverTrigger asChild>
               <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full border-border bg-background/80 shadow-sm shrink-0 hover:bg-muted/50 px-2.5">
                  {workspaceMode === "local" ? <FolderOpen className="size-3 text-muted-foreground" /> : <GitBranch className="size-3 text-muted-foreground" />}
                  <span className="truncate max-w-[150px] text-[12px] font-medium text-muted-foreground">
                    {workspaceMode === "local" ? "Local" : "GitHub"}: {workspaceMode === "local" 
                      ? (localPath.split('/').pop() || "Folder") 
                      : (repoLabel?.split('/')?.pop() || "Repo")}
                  </span>
               </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] text-sm p-4" align="start" sideOffset={8}>
              <div className="space-y-4">
                <div>
                  <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-3">Workspace Type</div>
                  <div className="flex bg-muted/50 p-1 rounded-lg border border-border mb-4">
                    <button type="button" onClick={() => onWorkspaceModeChange("github")} className={cn("flex-1 text-xs font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-2", workspaceMode === "github" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      <img src={githubLogo} alt="" className="size-3.5" /> GitHub
                    </button>
                    <button type="button" onClick={() => onWorkspaceModeChange("local")} className={cn("flex-1 text-xs font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-2", workspaceMode === "local" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                      <FolderOpen className="size-3.5" /> Local
                    </button>
                  </div>
                </div>

                {workspaceMode === "github" ? (
                  <div className="space-y-2">
                    <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Repository</div>
                    {!isGithubConnected ? (
                      <Button variant="outline" className="w-full" onClick={handleConnect}>
                        <img src={githubLogo} alt="" className="size-4 mr-2" />
                        Connect GitHub
                      </Button>
                    ) : (
                      <PromptInputSelect value={repo?.value ?? ""} onValueChange={setRepo}>
                        <PromptInputSelectTrigger aria-disabled={isRepoSelectLocked} data-disabled={isRepoSelectLocked ? "" : undefined} className={cn("w-full h-9", isRepoSelectLocked ? "opacity-60 cursor-not-allowed" : "")}>
                          <span className="flex items-center gap-2">
                            {isFetchingRepos ? <Spinner /> : <img src={githubLogo} alt="" className="size-4" />}
                            <PromptInputSelectValue placeholder="Select repository" />
                          </span>
                        </PromptInputSelectTrigger>
                        <PromptInputSelectContent>
                          {repoOptions?.map((option) => (
                            <PromptInputSelectItem key={option.value} value={option.value}>
                              {option.label}
                            </PromptInputSelectItem>
                          ))}
                        </PromptInputSelectContent>
                      </PromptInputSelect>
                    )}
                    {branchName && (
                      <div className="text-xs text-muted-foreground pt-1">
                        Active Branch: <span className="font-medium text-foreground">{prReady?.branch || branchName}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Local Directory</div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 h-9 rounded-md border border-border px-3 bg-muted/30">
                        <FolderOpen className="size-4 text-muted-foreground shrink-0" />
                        <input
                          ref={pathInputRef}
                          type="text"
                          value={localPathInput}
                          onChange={(e) => setLocalPathInput(e.target.value)}
                          onBlur={handleLocalPathBlur}
                          onKeyDown={handleLocalPathKeyDown}
                          placeholder="/path/to/project"
                          className="flex-1 bg-transparent text-xs outline-none"
                          disabled={hasMessages}
                        />
                      </div>
                      {!hasMessages && (
                        <Button type="button" variant="secondary" size="sm" className="w-full h-8 text-xs" onClick={handlePickFolder} disabled={isPickingFolder}>
                          {isPickingFolder ? <Spinner className="mr-2 h-3 w-3" /> : null}
                          Choose Folder...
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Goal Progress Chip */}
          {goalState?.goal && (
             <Popover>
               <PopoverTrigger asChild>
                 <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full border-border bg-background/80 shadow-sm shrink-0 hover:bg-muted/50 px-2.5">
                    <Target className="size-3 text-primary shrink-0" />
                    <span className="truncate max-w-[200px] text-[12px] font-medium">
                      Goal: {goalState.goal.length > 25 ? goalState.goal.substring(0, 25) + '...' : goalState.goal}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {goalState.completedCount || 0}/{Number(goalState.pendingCount || 0) + Number(goalState.completedCount || 0) + Number(goalState.blockedCount || 0)}
                    </span>
                 </Button>
               </PopoverTrigger>
               <PopoverContent className="w-80 p-0" align="start" sideOffset={8}>
                 <div className="p-3 border-b font-medium text-sm bg-muted/30 flex justify-between items-center">
                   <span>Goal Progress</span>
                   <span className="text-xs text-muted-foreground font-normal">{goalState.completedCount || 0}/{Number(goalState.pendingCount || 0) + Number(goalState.completedCount || 0) + Number(goalState.blockedCount || 0)}</span>
                 </div>
                 <div className="max-h-64 overflow-y-auto p-2 space-y-3">
                    {goalState.roadmap?.phases?.map((p: any, pIdx: number) => (
                      <div key={pIdx} className="space-y-1.5">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-1 border-b border-border/50 pb-1">{p.name}</div>
                        {p.milestones.map((m: any) => m.tasks.map((t: any) => (
                           <div key={t.id} className={cn("text-xs px-2 py-1.5 rounded-md flex items-start gap-2", goalState.currentBatchId === t.id ? "bg-primary/10 text-primary font-medium" : t.status === "completed" ? "text-muted-foreground opacity-70" : t.status === "blocked" ? "text-red-500 bg-red-500/10" : "text-foreground hover:bg-muted/50")}>
                             {t.status === "completed" ? <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-green-500" /> : goalState.currentBatchId === t.id ? <PlayCircle className="size-3.5 mt-0.5 shrink-0 text-primary" /> : t.status === "blocked" ? <AlertCircle className="size-3.5 mt-0.5 shrink-0 text-red-500" /> : <Circle className="size-3.5 mt-0.5 shrink-0 text-muted-foreground/50" />}
                             <span className={cn(t.status === "completed" && "line-through")}>{t.title}</span>
                           </div>
                        )))}
                      </div>
                    ))}
                    {!goalState.roadmap?.phases?.length && (
                      <div className="text-center text-xs text-muted-foreground p-4">Analyzing goal roadmap...</div>
                    )}
                 </div>
                 <div className="p-2 border-t bg-muted/30">
                   <Button variant="secondary" size="sm" className="w-full text-xs" onClick={onOpenGoalPanel}>Open Goal Panel</Button>
                 </div>
               </PopoverContent>
             </Popover>
          )}

          {/* PR Buttons */}
          {(workspaceMode === "github" ? createdPrUrl || prReady : prReady) && (
            <div className="shrink-0 ml-auto">
              {createdPrUrl ? (
                <Button className="bg-black/70! text-white h-7 text-xs rounded-full px-3 border-0" size="sm" asChild>
                  <a href={createdPrUrl} target="_blank" rel="noreferrer">
                    <GitPullRequest className="size-3 mr-1.5" /> View PR
                  </a>
                </Button>
              ) : (
                <Button
                  className="bg-black/70! text-white h-7 text-xs rounded-full px-3 border-0" size="sm"
                  onClick={onCreatePr}
                  disabled={isCreatingPr}
                >
                  {isCreatingPr ? (
                    <><Spinner className="size-3 mr-1.5" /> Pushing...</>
                  ) : (
                    <><GitPullRequest className="size-3 mr-1.5" /> {workspaceMode === "github" ? "Create PR" : "Push"}</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <PromptInput
          className="border px-0 bg-background py-0 shadow-md rounded-2xl ring-1 ring-border/50"
          onSubmit={handlePromptSubmit}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder={goalModeEnabled ? "Describe a goal for XAgent to plan and execute step by step..." : "Ask XAgent anything, / for commands, @ to mention files"} />
          </PromptInputBody>
          <PromptInputFooter className="mt-2 flex items-center justify-between gap-2 px-1">
            <PromptInputTools className="flex items-center gap-2 flex-wrap">
              
              <Button type="button" variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:bg-muted shrink-0">
                <Paperclip className="size-4" />
              </Button>

              {/* Mode Switcher inside input */}
              <div className="flex bg-muted/50 border border-border/50 p-0.5 rounded-full shadow-sm">
                <button type="button" onClick={() => goalModeEnabled && onGoalModeToggle()} className={cn("px-3 py-1 text-[12px] font-medium rounded-full transition-all flex items-center gap-1.5", !goalModeEnabled ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  Chat
                </button>
                <button type="button" onClick={() => !goalModeEnabled && onGoalModeToggle()} className={cn("px-3 py-1 text-[12px] font-medium rounded-full transition-all flex items-center gap-1.5", goalModeEnabled ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Target className="size-3" /> Goal
                </button>
              </div>

            </PromptInputTools>

            <div className="ml-auto">
              <PromptInputSubmit
                className="size-8 rounded-full"
                onStop={onStop}
                status={status}
              />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
};

export default ChatInput;
