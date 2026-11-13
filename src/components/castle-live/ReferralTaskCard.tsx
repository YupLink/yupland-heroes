import { Check, ExternalLink, Send, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMyTasks, verifyTaskCompletion } from "@/server/api/user-tasks";
import { humanError } from "@/lib/humanError";
import { useLang } from "@/lib/i18n";
import "./castle-profile.css";
import type { listMyTasks as TaskListType } from "@/server/api/user-tasks";
import { NftImage } from "@/components/NftImage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TaskItem = Awaited<ReturnType<typeof TaskListType>>[number];

export function TaskCard({
  task,
  onVerify,
  verifying,
}: {
  task: TaskItem;
  onVerify: () => void;
  verifying: boolean;
}) {
  const t = useT();
  // Для tg_channel — превратить target в кликабельную t.me ссылку
  let openUrl: string | null = null;
  if (task.target) {
    const trimmed = task.target.trim();
    if (trimmed.startsWith("http")) openUrl = trimmed;
    else if (trimmed.startsWith("@")) openUrl = `https://t.me/${trimmed.slice(1)}`;
    else if (task.kind === "tg_channel") openUrl = `https://t.me/${trimmed}`;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3",
        task.completed ? "border-success/30 bg-success/5" : "border-border",
      )}
    >
      <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
        {task.image ? (
          <NftImage src={task.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Send className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{task.title}</div>
        {task.description ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{task.description}</div>
        ) : null}
      </div>
      {task.completed ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-[11px] font-medium text-success">
          <Check className="h-3 w-3" />
          {t("ref.plus_one_earned")}
        </span>
      ) : (
        <div className="flex items-center gap-2">
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              {t("ref.open")}
            </a>
          )}
          <button
            data-game-button="primary"
            onClick={onVerify}
            disabled={verifying}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg gradient-gold px-3 py-1.5 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
          >
            {verifying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {task.kind === "tg_channel" ? t("ref.check") : t("ref.done")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Existing tasks, entered from the castle notice board. */
export function CastleTasks() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["my-tasks"], queryFn: () => listMyTasks() });
  const verify = useMutation({
    mutationFn: (taskId: string) => verifyTaskCompletion({ data: { taskId } }),
    onSuccess: (result) => {
      toast.success(
        result.alreadyDone
          ? ru
            ? "Задание уже выполнено"
            : "Task already completed"
          : ru
            ? "Задание выполнено: +100 золота"
            : "Task completed: +100 gold",
      );
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
      void qc.invalidateQueries({ queryKey: ["my-resources"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (tasks.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>{humanError(tasks.error)}</p>
        <button
          data-game-button="secondary"
          className="min-h-11 rounded-xl border px-4"
          onClick={() => void tasks.refetch()}
        >
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  if (tasks.isPending) return <p role="status">{ru ? "Проверяем задания…" : "Checking tasks…"}</p>;
  return (
    <div className="castle-profile space-y-4">
      <h2 className="text-xl">{ru ? "Задания" : "Tasks"}</h2>
      {tasks.data.length ? (
        tasks.data.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onVerify={() => verify.mutate(task.id)}
            verifying={verify.isPending && verify.variables === task.id}
          />
        ))
      ) : (
        <p>{ru ? "Пока нет заданий." : "No tasks yet."}</p>
      )}
    </div>
  );
}
