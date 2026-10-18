import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/server/api/admin-tasks";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Send,
  ListChecks,
  Upload,
  X,
  Pencil,
  Check,
  Link as LinkIcon,
  Ticket,
  Users,
} from "lucide-react";
import { NftImage } from "@/components/NftImage";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/admin/tasks")({
  component: AdminTasks,
});

function AdminTasks() {
  const qc = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  const [kind, setKind] = useState<"tg_channel" | "custom">("tg_channel");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Аккордеон «Новое задание». По умолчанию свёрнут — при входе на
  // первом плане список существующих заданий, а не большая форма.
  const [createOpen, setCreateOpen] = useState(false);

  const list = useQuery({
    queryKey: ["admin", "tasks"],
    queryFn: () => listTasks(),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const j = (await res.json()) as { url: string };
      return j.url;
    },
    onSuccess: (url) => {
      setImage(url);
      toast.success("Картинка загружена");
    },
    onError: (e: Error) => toast.error(`Upload: ${e.message}`),
  });

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      toast.success("Задание создано");
      setTitle("");
      setTarget("");
      setImage("");
      setDescription("");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTask({ data: { id } }),
    onSuccess: () => {
      toast.success("Задание удалено");
      qc.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const canCreate = title.trim().length > 0 && (kind === "custom" || target.trim().length > 0);

  const onCreate = () => {
    if (!canCreate) {
      toast.error(
        kind === "tg_channel"
          ? "Укажи название и канал"
          : "Укажи название"
      );
      return;
    }
    create.mutate({
      data: {
        kind,
        title: title.trim(),
        image: image.trim() || null,
        target: target.trim() || null,
        description: description.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight">
              Задания
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Каждое выполненное = +1 билет
            </p>
          </div>
        </div>
        {/* Главный акцент экрана — открыть форму создания (по умолчанию свёрнута). */}
        <button
          onClick={() => {
            setCreateOpen((v) => {
              const next = !v;
              if (next) {
                setTimeout(() => {
                  formRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 50);
              }
              return next;
            });
          }}
          className="inline-flex items-center gap-2 rounded-full gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Новое задание
        </button>
      </header>

      {/* Create form — аккордеон. По умолчанию свёрнут, на первом плане
          список заданий. Раскрывается кнопкой «Новое задание». */}
      {createOpen && (
      <div
        ref={formRef}
        className="rounded-2xl border border-border/50 bg-card p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4 text-gold" />
            Новое задание
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(false)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Свернуть
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {kind === "tg_channel" ? (
                  <Send className="h-3.5 w-3.5" />
                ) : (
                  <LinkIcon className="h-3.5 w-3.5" />
                )}
                Тип
              </label>
              <select
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as "tg_channel" | "custom")
                }
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
              >
                <option value="tg_channel">Подписка на канал</option>
                <option value="custom">Кастомное</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Название
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Подпишись на канал Golden Darai"
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {kind === "tg_channel" ? "Канал" : "Ссылка (опц.)"}
            </label>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={
                kind === "tg_channel"
                  ? "@golden_darai или t.me/…"
                  : "https://…"
              }
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            />
            {kind === "tg_channel" && (
              <div
                className="mt-1 text-[11px] text-muted-foreground"
                title="Иначе проверка подписки не сработает"
              >
                Добавь <code>@yuplink_bot</code> в админы канала.
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Картинка (опц.)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-3">
              {image ? (
                <div className="relative">
                  <div className="aspect-square h-16 w-16 overflow-hidden rounded-xl border border-border bg-background">
                    <img
                      src={image}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <button
                    onClick={() => setImage("")}
                    title="Убрать картинку"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs text-foreground transition hover:bg-secondary disabled:opacity-50"
                >
                  {upload.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {upload.isPending ? "Загрузка…" : "Загрузить"}
                </button>
              )}
              {image && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending}
                  className="text-xs text-muted-foreground underline transition hover:text-foreground disabled:opacity-50"
                >
                  Заменить
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Описание (опц.)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткий пояснительный текст"
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            />
          </div>

          <button
            onClick={onCreate}
            disabled={!canCreate || create.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Создать задание
          </button>
        </div>
      </div>
      )}

      {/* List */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4 text-gold" />
          Активные задания
        </div>
        {list.isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Загрузка…
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Пока пусто. Жми «Новое задание».
          </div>
        ) : (
          <div className="space-y-2">
            {(list.data ?? []).map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border/50 bg-card p-3 transition hover:border-border/80"
              >
                {editingId === t.id ? (
                  <TaskEditForm
                    task={t}
                    onClose={() => setEditingId(null)}
                  />
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                        {t.image ? (
                          <NftImage
                            src={t.image}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            {t.kind === "tg_channel" ? (
                              <Send className="h-4 w-4" />
                            ) : (
                              <LinkIcon className="h-4 w-4" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {t.title}
                        </div>
                        {t.target ? (
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            <code className="break-all">{t.target}</code>
                          </div>
                        ) : null}
                        {/* Бейджи: тип · награда · выполнений */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {t.kind === "tg_channel" ? (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
                              <Send className="h-3 w-3" />
                              Канал
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-secondary px-2 py-0.5 text-muted-foreground">
                              <LinkIcon className="h-3 w-3" />
                              Кастом
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-gold">
                            <Ticket className="h-3 w-3" />
                            +1 билет
                          </span>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {t.completions}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => setEditingId(t.id)}
                        title="Редактировать задание"
                        aria-label="Редактировать задание"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить «${t.title}»?`))
                            del.mutate(t.id);
                        }}
                        disabled={del.isPending}
                        title="Удалить задание"
                        aria-label="Удалить задание"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type TaskItem = Awaited<ReturnType<typeof listTasks>>[number];

function TaskEditForm({
  task,
  onClose,
}: {
  task: TaskItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(task.title);
  const [target, setTarget] = useState(task.target ?? "");
  const [image, setImage] = useState(task.image ?? "");
  const [description, setDescription] = useState(task.description ?? "");

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const j = (await res.json()) as { url: string };
      return j.url;
    },
    onSuccess: (url) => {
      setImage(url);
      toast.success("Картинка загружена");
    },
    onError: (e: Error) => toast.error(`Upload: ${e.message}`),
  });

  const save = useMutation({
    mutationFn: updateTask,
    onSuccess: () => {
      toast.success("Задание обновлено");
      qc.invalidateQueries({ queryKey: ["admin", "tasks"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const onSave = () => {
    if (!title.trim()) {
      toast.error("Название не может быть пустым");
      return;
    }
    save.mutate({
      data: {
        id: task.id,
        title: title.trim(),
        image: image.trim() || null,
        target: target.trim() || null,
        description: description.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-1.5 text-[11px]"
        title="Тип задания нельзя изменить после создания"
      >
        {task.kind === "tg_channel" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-neon/40 bg-neon/10 px-2 py-0.5 text-neon">
            <Send className="h-3 w-3" />
            Канал
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-muted-foreground">
            <LinkIcon className="h-3 w-3" />
            Кастом
          </span>
        )}
        <span className="text-muted-foreground">тип нельзя менять</span>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
      />
      <input
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder={
          task.kind === "tg_channel" ? "@channel или t.me/..." : "Ссылка"
        }
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание (опц.)"
        rows={2}
        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-3">
        {image ? (
          <div className="relative">
            <div className="aspect-square h-14 w-14 overflow-hidden rounded-xl border border-border bg-background">
              <NftImage
                src={image}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <button
              onClick={() => setImage("")}
              title="Убрать картинку"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-1.5 text-xs text-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            {upload.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {upload.isPending ? "Загружаем…" : "Загрузить картинку"}
          </button>
        )}
        {image && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="text-xs text-muted-foreground underline transition hover:text-foreground disabled:opacity-50"
          >
            Заменить
          </button>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          disabled={save.isPending}
          className={cn(
            "rounded-lg border border-border bg-secondary/40 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
            save.isPending && "opacity-50"
          )}
        >
          Отмена
        </button>
        <button
          onClick={onSave}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Сохранить
        </button>
      </div>
    </div>
  );
}
