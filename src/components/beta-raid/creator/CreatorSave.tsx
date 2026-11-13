// «Сохранить» в студии мира (владелец, 07.11.2026: «кнопка сохранить — сверху
// справа — по ней сохраняется, чтобы не ломалось ничего»). Правки и так уезжают
// сами (useCreatorAutosave); кнопка отправляет сразу и показывает состояние:
// «Сохранить · N» — есть несохранённое, «Сохраняю…», сохранено — галочка
// (без слова: в узкой шапке оно съедало имя мира).
import { Check, Loader2, Save } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { flushCreatorEdits } from "./useCreatorAutosave";

export function CreatorSave({ brush }: { brush: { pending: number; sending: boolean } }) {
  const t = useT();
  const dirty = brush.pending > 0;
  const Icon = brush.sending ? Loader2 : dirty ? Save : Check;
  return (
    <button
      type="button"
      aria-label={dirty || brush.sending ? undefined : t("creator.saved")}
      title={dirty || brush.sending ? undefined : t("creator.saved")}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold",
        dirty ? "gradient-gold text-gold-foreground" : "border border-border text-emerald-400",
      )}
      disabled={brush.sending}
      onClick={() => void flushCreatorEdits()}
    >
      <Icon className={cn("h-4 w-4", brush.sending && "animate-spin")} aria-hidden="true" />
      {brush.sending
        ? t("creator.saving")
        : dirty
          ? `${t("creator.save_btn")} · ${brush.pending}`
          : null}
    </button>
  );
}
