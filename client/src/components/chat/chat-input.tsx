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
      <div className={cn("w-full mx-auto px-0 pb-4 backdrop-blur-sm rounded-2xl",
        hasMessages ? "max-w-212" : "max-w-3xl"
      )}>
        {(workspaceMode === "local" ? localPath : repo) && (
          <div className="mb-2 flex items-center justify-between gap-3 px-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-2 rounded-full border-border bg-background/50 backdrop-blur shadow-sm">
                  {workspaceMode === "local" ? (
                    <FolderOpen className="size-3.5 text-muted-foreground" />
                  ) : (
                    <GitBranch className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate max-w-[250px] text-[13px]">
                    {workspaceMode === "local" 
                      ? (localPath.length > 35 ? `...${localPath.slice(-35)}` : localPath || "Local Folder") 
                      : repoLabel || "No Repo"}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground ml-1" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-sm" align="start" sideOffset={8}>
                <div className="space-y-3">
                  <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Workspace Details</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="col-span-2 font-medium capitalize">{workspaceMode} Workspace</span>
                    
                    <span className="text-muted-foreground">{workspaceMode === 'local' ? 'Path:' : 'Repo:'}</span>
                    <span className="col-span-2 font-medium break-all">{workspaceMode === 'local' ? localPath : repo?.value}</span>
                    
                    {workspaceMode === 'github' && (
                      <>
                        <span className="text-muted-foreground">Branch:</span>
                        <span className="col-span-2 font-medium break-all">{prReady?.branch || branchName}</span>
                      </>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* PR buttons — only for GitHub mode */}
            {workspaceMode === "github" && (
              <>
                {createdPrUrl ? (
                  <Button className="bg-black/70! text-white h-8 text-xs rounded-full" size="sm" asChild>
                    <a href={createdPrUrl} target="_blank" rel="noreferrer">
                      <GitPullRequest className="size-3.5 mr-1.5" />
                      View PR
                    </a>
                  </Button>
                ) : (
                  <Button
                    className="bg-black/70! text-white h-8 text-xs rounded-full" size="sm"
                    onClick={onCreatePr}
                    disabled={isCreatingPr || !prReady}
                  >
                    {isCreatingPr ? (
                      <>
                        <Spinner className="size-3.5 mr-1.5" />
                        Creating PR...
                      </>
                    ) : (
                      <>
                        <GitPullRequest className="size-3.5 mr-1.5" />
                        {prReady ? "Create PR" : "PR unavailable"}
                      </>
                    )}
                  </Button>
                )}
              </>
            )}

            {/* For local mode — show commit button or nothing */}
            {workspaceMode === "local" && prReady && (
              <Button
                className="bg-black/70! text-white h-8 text-xs rounded-full" size="sm"
                onClick={onCreatePr}
                disabled={isCreatingPr}
              >
                {isCreatingPr ? (
                  <>
                    <Spinner className="size-3.5 mr-1.5" />
                    Pushing...
                  </>
                ) : (
                  <>
                    <GitPullRequest className="size-3.5 mr-1.5" />
                    Push & PR
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        <PromptInput
          className="border px-0 bg-background py-0 shadow-sm rounded-3xl!"
          onSubmit={handlePromptSubmit}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder={goalModeEnabled ? "Describe the goal you want XAgent to plan..." : "Ask XAgent to write anything..."} />
          </PromptInputBody>
          <PromptInputFooter className="mt-3 flex items-center gap-2">
            <PromptInputTools className="flex items-center gap-2 flex-wrap">

              {/* ── Goal Mode Toggle ── */}
              <button
                type="button"
                onClick={onGoalModeToggle}
                className={cn("flex items-center gap-1.5 px-3 h-10 text-sm font-medium transition-colors rounded-lg border",
                  goalModeEnabled ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <Target className="size-4" />
                {goalModeEnabled ? "Goal ON" : "Goal"}
              </button>
              
              <button
                type="button"
                onClick={onOpenGoalPanel}
                className="flex items-center gap-1.5 px-3 h-10 text-sm font-medium transition-colors rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
              >
                View Goal
              </button>

              {/* ── Workspace Mode Toggle ── */}
              {!hasMessages && (
                <div className="flex items-center rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => onWorkspaceModeChange("github")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 h-10 text-sm font-medium transition-colors",
                      workspaceMode === "github"
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <img src={githubLogo} alt="" className="size-3.5" />
                    GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => onWorkspaceModeChange("local")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 h-10 text-sm font-medium transition-colors border-l border-border",
                      workspaceMode === "local"
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <FolderOpen className="size-3.5" />
                    Local
                  </button>
                </div>
              )}

              {/* ── GitHub Repo Selector ── */}
              {workspaceMode === "github" && (
                <>
                  {!isGithubConnected ? (
                    <Button variant="outline" type="button" onClick={handleConnect}>
                      <span className="flex items-center gap-2">
                        <img src={githubLogo} alt="" className="size-4" />
                        Connect GitHub
                      </span>
                    </Button>
                  ) : hasMessages ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-transparent! cursor-not-allowed! opacity-50!"
                    >
                      {isFetchingRepos ? (
                        <Spinner />
                      ) : (
                        <img src={githubLogo} alt="" className="size-4" />
                      )}
                      <span className="min-w-0 truncate">
                        {repoLabel ?? "Select a repository"}
                      </span>
                    </Button>
                  ) : (
                    <PromptInputSelect
                      value={repo?.value ?? ""}
                      onValueChange={setRepo}
                    >
                      <PromptInputSelectTrigger
                        aria-disabled={isRepoSelectLocked}
                        data-disabled={isRepoSelectLocked ? "" : undefined}
                        className={`h-10 truncate min-w-60 bg-background px-3 ${
                          isRepoSelectLocked
                            ? "cursor-not-allowed opacity-60"
                            : ""
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {isFetchingRepos ? (
                            <Spinner />
                          ) : (
                            <img src={githubLogo} alt="" className="size-4" />
                          )}
                          <PromptInputSelectValue placeholder="Select a repository" />
                        </span>
                      </PromptInputSelectTrigger>
                      <PromptInputSelectContent className="shadow-lg">
                        <div className="font-semibold text-sm p-3">
                          All repositories
                        </div>

                        {repoOptions?.length === 0 ? (
                          <div className="text-center text-sm text-muted-foreground p-3">
                            No repositories found
                          </div>
                        ) : (
                          repoOptions.map((option) => (
                            <PromptInputSelectItem
                              key={option.value}
                              value={option.value}
                              className="block rounded-lg px-3 py-2"
                            >
                              <span className="truncate max-w-[600px]">
                                {option.label}
                              </span>
                            </PromptInputSelectItem>
                          ))
                        )}
                      </PromptInputSelectContent>
                    </PromptInputSelect>
                  )}
                </>
              )}

              {/* ── Local Folder Path Input ── */}
              {workspaceMode === "local" && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 h-10 min-w-72 max-w-xs rounded-lg border border-border bg-background px-3">
                    <FolderOpen className="size-4 text-muted-foreground shrink-0" />
                    {hasMessages ? (
                      <span className="text-sm text-muted-foreground truncate">
                        {localPath || "No folder selected"}
                      </span>
                    ) : (
                      <input
                        ref={pathInputRef}
                        type="text"
                        value={localPathInput}
                        onChange={(e) => setLocalPathInput(e.target.value)}
                        onBlur={handleLocalPathBlur}
                        onKeyDown={handleLocalPathKeyDown}
                        placeholder="/Users/you/my-project"
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        disabled={hasMessages}
                      />
                    )}
                  </div>
                  {!hasMessages && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10"
                      onClick={handlePickFolder}
                      disabled={isPickingFolder}
                    >
                      {isPickingFolder ? <Spinner className="mr-2" /> : <FolderOpen className="size-4 mr-2" />}
                      Select Folder
                    </Button>
                  )}
                </div>
              )}

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
