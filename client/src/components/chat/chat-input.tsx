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
import { GitBranch, GitPullRequest, FolderOpen, Target, ChevronDown } from "lucide-react";
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
        
        {/* ── Mode Switcher ── */}
        <div className="flex justify-center w-full mb-1">
          <div className="flex bg-background/90 backdrop-blur border border-border p-1 rounded-t-xl shadow-sm relative top-px z-10">
            <button type="button" onClick={() => goalModeEnabled && onGoalModeToggle()} className={cn("px-5 py-1.5 text-[13px] font-semibold rounded-md transition-all flex items-center gap-2", !goalModeEnabled ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              Chat
            </button>
            <button type="button" onClick={() => !goalModeEnabled && onGoalModeToggle()} className={cn("px-5 py-1.5 text-[13px] font-semibold rounded-md transition-all flex items-center gap-2", goalModeEnabled ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Target className="size-3.5" /> Goal
            </button>
          </div>
        </div>

        {/* ── Context Strip ── */}
        <div className="w-full mb-2 flex flex-col sm:flex-row items-center gap-2 px-2 text-xs">
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 rounded-full border-border bg-background/80 backdrop-blur shadow-sm shrink-0">
                {workspaceMode === "local" ? (
                  <FolderOpen className="size-3.5 text-muted-foreground" />
                ) : (
                  <GitBranch className="size-3.5 text-muted-foreground" />
                )}
                <span className="truncate max-w-[200px] text-[13px] font-medium">
                  {workspaceMode === "local" 
                    ? (localPath.length > 25 ? `...${localPath.slice(-25)}` : localPath || "Local Folder") 
                    : repoLabel || "No Repo"}
                </span>
                <ChevronDown className="size-3 text-muted-foreground ml-1" />
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

          {/* Goal & Status Pill */}
          <div 
            className="flex-1 min-w-0 flex items-center gap-2 px-3 h-8 rounded-full border border-border bg-background/80 hover:bg-muted/50 cursor-pointer transition-colors shadow-sm"
            onClick={onOpenGoalPanel}
          >
            <Target className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate text-[13px]">
              {!goalState?.goal ? (
                <span className="text-muted-foreground">No active goal</span>
              ) : (
                <>
                  <span className="font-medium mr-2 text-foreground">
                    {goalState.goal.length > 50 ? goalState.goal.substring(0, 50) + '...' : goalState.goal}
                  </span>
                  {goalState.currentBatchId && (
                    <span className="text-muted-foreground">({goalState.currentBatchId})</span>
                  )}
                </>
              )}
            </span>
            
            {goalState?.executionStatus && (
              <span className="ml-auto flex items-center gap-1.5 shrink-0 pl-2 border-l border-border/50">
                <div className={cn("size-2 rounded-full", 
                  ["running", "verifying", "self_healing"].includes(goalState.executionStatus) ? "bg-amber-500 animate-pulse" : 
                  goalState.executionStatus === "completed" ? "bg-green-500" : 
                  goalState.executionStatus === "failed" || goalState.executionStatus === "blocked" ? "bg-red-500" : 
                  "bg-muted-foreground"
                )} />
                <span className="text-muted-foreground font-medium text-[11px] uppercase tracking-wider">{goalState.executionStatus}</span>
              </span>
            )}
          </div>

          {/* PR Buttons */}
          {(workspaceMode === "github" ? createdPrUrl || prReady : prReady) && (
            <div className="shrink-0">
              {createdPrUrl ? (
                <Button className="bg-black/70! text-white h-8 text-xs rounded-full" size="sm" asChild>
                  <a href={createdPrUrl} target="_blank" rel="noreferrer">
                    <GitPullRequest className="size-3.5 mr-1.5" /> View PR
                  </a>
                </Button>
              ) : (
                <Button
                  className="bg-black/70! text-white h-8 text-xs rounded-full" size="sm"
                  onClick={onCreatePr}
                  disabled={isCreatingPr}
                >
                  {isCreatingPr ? (
                    <><Spinner className="size-3.5 mr-1.5" /> Pushing...</>
                  ) : (
                    <><GitPullRequest className="size-3.5 mr-1.5" /> {workspaceMode === "github" ? "Create PR" : "Push & PR"}</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <PromptInput
          className={cn("border px-0 bg-background py-0 shadow-md", goalModeEnabled ? "rounded-b-2xl rounded-t-lg ring-1 ring-primary/20" : "rounded-b-2xl rounded-t-lg")}
          onSubmit={handlePromptSubmit}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder={goalModeEnabled ? "Describe the goal you want XAgent to plan..." : "Ask XAgent to write anything..."} />
          </PromptInputBody>
          <PromptInputFooter className="mt-3 flex items-center justify-between gap-2">
            <PromptInputTools className="flex items-center gap-2 flex-wrap">
              {/* Removed duplicate workspace controls and view goal buttons */}
            </PromptInputTools>

            <div className="ml-auto">
              <PromptInputSubmit
                className="size-10 rounded-xl"
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
