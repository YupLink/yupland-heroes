// Шапка редактора интерьера: «Назад», заголовок, «Сохранить» с меткой «•»
// при несохранённых правках.
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Play, Save } from "lucide-react";
import { humanError } from "@/lib/humanError";

/** Глухой экран — только пока карта не загружена: чужая ошибка, отказ доступа. */
export function CastleLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm">{humanError(error)}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl border border-border px-3 py-1.5 text-sm"
        >
          Повторить
        </button>
      </div>
    </div>
  );
}

export function CastleHeader({
  dirty,
  saving,
  canSave,
  onSave,
  onTest,
}: {
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  /** «Тест · игровые окна»: настоящие окна игры по постройкам; undefined — карта не загружена. */
  onTest?: () => void;
}) {
  const router = useRouter();
  const goBack = () => {
    if (dirty && !confirm("Есть несохранённые правки. Уйти без сохранения?")) return;
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else router.navigate({ to: "/" });
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          title="Назад"
          className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Дизайн интерьера
          </div>
          <h1 className="font-display text-xl font-bold">Внутрянка замка</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTest}
          disabled={!onTest}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40"
        >
          <Play className="h-4 w-4" />
          Тест · игровые окна
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-background disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? "Сохранить •" : "Сохранить"}
        </button>
      </div>
    </header>
  );
}
