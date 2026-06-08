import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, PlayCircle, AlertCircle, XCircle, ChevronRight, Flag, Zap, Shield, SkipForward } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExecutionPolicy = "safe" | "auto" | "yolo";

export type GoalEvent =
  | { type: "goal_submitted"; text: string; id: string; ts: number }
  | { type: "planning"; id: string; ts: number }
  | { type: "roadmap_ready"; state: any; policy: ExecutionPolicy; id: string; ts: number }
  | { type: "batch_starting"; taskId: string; taskTitle: string; id: string; ts: number }
  | { type: "batch_executing"; taskId: string; taskTitle: string; id: string; ts: number }
  | { type: "batch_completed"; taskId: string; taskTitle: string; report: any; id: string; ts: number }
  | { type: "batch_failed"; taskId: string; taskTitle: string; error: string; id: string; ts: number }
  | { type: "batch_blocked"; taskId: string; taskTitle: string; id: string; ts: number }
  | { type: "approval_required"; taskId: string; taskTitle: string; riskLevel: string; id: string; ts: number }
  | { type: "continue_prompt"; nextTaskId: string | null; nextTaskTitle: string | null; goalDone: boolean; id: string; ts: number }
  | { type: "goal_completed"; id: string; ts: number }
  | { type: "goal_error"; message: string; id: string; ts: number };

export interface GoalTimelineProps {
  events: GoalEvent[];
  isExecuting: boolean;
  onContinue: () => void;
  onStop: () => void;
  onApprove: (taskId: string) => void;
  onOpenPanel: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function policyLabel(p: ExecutionPolicy) {
  if (p === "safe") return { label: "Safe Mode", icon: <Shield className="size-3" />, cls: "text-blue-500" };
  if (p === "auto") return { label: "Auto Execute", icon: <Zap className="size-3" />, cls: "text-amber-500" };
  return { label: "YOLO Mode", icon: <SkipForward className="size-3" />, cls: "text-red-500" };
}

function taskStatusIcon(status: string, isActive: boolean) {
  if (isActive) return <PlayCircle className="size-3.5 mt-0.5 shrink-0 text-primary animate-pulse" />;
  if (status === "completed") return <CheckCircle2 className="size-3.5 mt-0.5 shrink-0 text-green-500" />;
  if (status === "blocked") return <AlertCircle className="size-3.5 mt-0.5 shrink-0 text-red-500" />;
  return <Circle className="size-3.5 mt-0.5 shrink-0 text-muted-foreground/40" />;
}

// ─── Sub-Renderers ───────────────────────────────────────────────────────────

function RoadmapCard({ event }: { event: Extract<GoalEvent, { type: "roadmap_ready" }> }) {
  const { state, policy } = event;
  const allTasks: any[] = [];
  state.roadmap?.phases?.forEach((ph: any) =>
    ph.milestones?.forEach((ms: any) =>
      ms.tasks?.forEach((t: any) => allTasks.push(t))
    )
  );
  const pl = policyLabel(policy);

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-primary" />
          <span className="font-semibold text-sm">Roadmap Ready</span>
        </div>
        <div className={cn("flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted border border-border", pl.cls)}>
          {pl.icon}
          {pl.label}
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 py-3 space-y-1.5 max-h-72 overflow-y-auto">
        {allTasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "flex items-start gap-2 text-xs px-2 py-1.5 rounded-md transition-colors",
              task.status === "completed" ? "opacity-60" :
              task.status === "blocked" ? "bg-red-500/8 text-red-500" :
              state.currentBatchId === task.id ? "bg-primary/8 text-primary font-medium" :
              "hover:bg-muted/40"
            )}
          >
            {taskStatusIcon(task.status, state.currentBatchId === task.id)}
            <span className={cn(task.status === "completed" && "line-through")}>{task.title}</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider font-mono text-muted-foreground/60 shrink-0">{task.id}</span>
          </div>
        ))}
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2 border-t border-border/60 bg-muted/10 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span>{state.completedCount ?? 0} done</span>
        <span>{state.pendingCount ?? allTasks.length} pending</span>
        {state.blockedCount > 0 && <span className="text-red-500">{state.blockedCount} blocked</span>}
      </div>
    </div>
  );
}

function BatchCard({ event }: { event: Extract<GoalEvent, { type: "batch_completed" | "batch_failed" | "batch_blocked" }> }) {
  const isOk = event.type === "batch_completed";
  const isFailed = event.type === "batch_failed";

  return (
    <div className={cn(
      "rounded-lg border px-4 py-3 text-sm",
      isOk ? "border-green-500/30 bg-green-500/5" :
      isFailed ? "border-red-500/30 bg-red-500/5" :
      "border-amber-500/30 bg-amber-500/5"
    )}>
      <div className="flex items-center gap-2 font-medium">
        {isOk ? <CheckCircle2 className="size-4 text-green-500" /> :
         isFailed ? <XCircle className="size-4 text-red-500" /> :
         <AlertCircle className="size-4 text-amber-500" />}
        <span>
          {isOk ? "Batch completed" : isFailed ? "Batch failed" : "Batch blocked"}: {event.taskTitle}
        </span>
      </div>
      {event.type === "batch_failed" && event.error && (
        <p className="mt-1.5 text-xs text-muted-foreground pl-6">{event.error}</p>
      )}
      {event.type === "batch_completed" && event.report?.message && (
        <p className="mt-1.5 text-xs text-muted-foreground pl-6">{event.report.message}</p>
      )}
    </div>
  );
}

function ContinuePrompt({
  event,
  isExecuting,
  onContinue,
  onStop,
  onOpenPanel,
}: {
  event: Extract<GoalEvent, { type: "continue_prompt" }>;
  isExecuting: boolean;
  onContinue: () => void;
  onStop: () => void;
  onOpenPanel: () => void;
}) {
  if (event.goalDone) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
        <div className="flex items-center gap-2 font-semibold text-green-600 dark:text-green-400">
          <CheckCircle2 className="size-5" />
          Goal completed ✓
        </div>
        <p className="text-xs text-muted-foreground mt-1">All batches have been executed successfully.</p>
        <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={onOpenPanel}>
          View Full Report
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-sm font-medium mb-1">
        {event.nextTaskTitle
          ? <>Next: <span className="text-primary">{event.nextTaskTitle}</span></>
          : "No more batches remaining."}
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        {event.nextTaskId ? "Continue to execute the next batch?" : "All tasks are done."}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {event.nextTaskId && (
          <Button size="sm" className="text-xs h-7 gap-1.5" onClick={onContinue} disabled={isExecuting}>
            {isExecuting ? <Spinner className="size-3" /> : <ChevronRight className="size-3" />}
            Continue
          </Button>
        )}
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={onStop}>
          Stop
        </Button>
        <Button size="sm" variant="ghost" className="text-xs h-7" onClick={onOpenPanel}>
          View Details
        </Button>
      </div>
    </div>
  );
}

function ApprovalCard({
  event,
  isExecuting,
  onApprove,
  onStop,
}: {
  event: Extract<GoalEvent, { type: "approval_required" }>;
  isExecuting: boolean;
  onApprove: (taskId: string) => void;
  onStop: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <div className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400 mb-1">
        <AlertCircle className="size-4" />
        Approval Required — High Risk
      </div>
      <p className="text-xs text-muted-foreground mb-1">
        Batch: <span className="font-medium text-foreground">{event.taskTitle}</span>
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Risk level: <span className="font-medium text-amber-500 uppercase">{event.riskLevel}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" className="text-xs h-7 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0" onClick={() => onApprove(event.taskId)} disabled={isExecuting}>
          {isExecuting ? <Spinner className="size-3" /> : null}
          Approve & Execute
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7" onClick={onStop}>
          Skip
        </Button>
      </div>
    </div>
  );
}

// ─── Main Timeline Renderer ───────────────────────────────────────────────────

export function GoalTimeline({ events, isExecuting, onContinue, onStop, onApprove, onOpenPanel }: GoalTimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 py-2 max-w-full">
      {events.map((ev) => {
        switch (ev.type) {
          case "goal_submitted":
            return null; // rendered as a user message bubble, skip here

          case "planning":
            return (
              <div key={ev.id} className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <Spinner className="size-4 text-primary" />
                <span>Planning goal...</span>
              </div>
            );

          case "roadmap_ready":
            return <RoadmapCard key={ev.id} event={ev} />;

          case "batch_starting":
            return (
              <div key={ev.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1 border-l-2 border-primary/40 pl-3">
                <ChevronRight className="size-3 text-primary shrink-0" />
                Starting batch: <span className="font-medium text-foreground ml-1">{ev.taskTitle}</span>
              </div>
            );

          case "batch_executing":
            return (
              <div key={ev.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1.5 border-l-2 border-amber-500/40 pl-3">
                <Spinner className="size-3.5 text-amber-500 shrink-0" />
                <span>Executing <span className="font-medium text-foreground">{ev.taskTitle}</span>...</span>
              </div>
            );

          case "batch_completed":
          case "batch_failed":
          case "batch_blocked":
            return <BatchCard key={ev.id} event={ev} />;

          case "approval_required":
            return <ApprovalCard key={ev.id} event={ev} isExecuting={isExecuting} onApprove={onApprove} onStop={onStop} />;

          case "continue_prompt":
            return (
              <ContinuePrompt
                key={ev.id}
                event={ev}
                isExecuting={isExecuting}
                onContinue={onContinue}
                onStop={onStop}
                onOpenPanel={onOpenPanel}
              />
            );

          case "goal_completed":
            return (
              <div key={ev.id} className="flex items-center gap-2 font-semibold text-green-600 dark:text-green-400 py-2">
                <CheckCircle2 className="size-5" />
                Goal completed ✓
              </div>
            );

          case "goal_error":
            return (
              <div key={ev.id} className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 flex items-start gap-2">
                <XCircle className="size-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium text-red-600 dark:text-red-400 mb-0.5">Goal analysis failed</div>
                  <div className="text-xs text-muted-foreground">{ev.message}</div>
                </div>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
