import { ChevronRight, ChevronDown, Sparkles, KeyRound } from "lucide-react";

export function AddChoice({
  onCreate,
  onImport,
  onCancel,
}: {
  onCreate: () => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onCreate}
        className="group flex w-full items-center gap-3.5 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/[0.1] to-transparent p-4 text-left transition hover:border-gold/50 hover:scale-[1.01]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/25">
          <Sparkles className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">Создать новый</span>
          <span className="block text-xs text-muted-foreground">
            Сгенерируем новый NEAR-аккаунт прямо здесь. Покажем сид-фразу один
            раз — запиши её.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-gold" />
      </button>
      <button
        type="button"
        onClick={onImport}
        className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-gold/40 hover:scale-[1.01]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/25">
          <KeyRound className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">Импортировать существующий</span>
          <span className="block text-xs text-muted-foreground">
            Вставь сид-фразу или приватный ключ — определим аккаунт сами.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-gold" />
      </button>
      <button type="button" onClick={onCancel} className="w-full rounded-full border border-border bg-card px-3 py-2 text-xs">
        Отмена
      </button>
    </div>
  );
}
