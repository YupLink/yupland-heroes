// Что написано на табличке: админ пишет — герои читают бесплатно.
//
// Текст живёт в настройках КЛЕТКИ, а не шаблона: табличек много, послание у
// каждой своё. Уходит не отдельным запросом, а в общую очередь правок: вписал
// сразу после того, как поставил кистью, — и выгрузил всё одним махом.
import { useState } from "react";
import { Check, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";

export function AdminSignEditor({
  text,
  queued,
  onSave,
}: {
  /** Текущее послание: невыгруженное, если оно уже в очереди. */
  text: string;
  /** Этот текст уже лежит в очереди правок, а не пришёл с сервера. */
  queued: boolean;
  onSave: (text: string) => void;
}) {
  // Черновик заводится ТОЛЬКО когда админ тронул поле. Окно клетки рисуется
  // мгновенно из кэша, а сохранённый текст приезжает с сервера позже: снимок
  // на первом рендере оставил бы поле пустым, и уход из него затирал бы
  // надпись пустотой.
  const [draft, setDraft] = useState<string | null>(null);
  const t = godText(useLang());
  const value = draft ?? text;
  const dirty = draft !== null && draft !== text;

  const save = () => {
    if (!dirty) return;
    onSave(value);
    toast.success(t.signSaved);
  };

  return (
    <div className="mt-2 space-y-1.5 rounded-xl border border-border/60 bg-secondary/20 p-2">
      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold">
        <ScrollText className="h-3 w-3" />
        {t.signTitle}
      </div>
      <textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        // Забытая кнопка — потерянный текст: записываем и при уходе из поля.
        onBlur={save}
        rows={3}
        placeholder={t.signPlaceholder}
        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
      >
        {/* «В правках» — только про очередь: сохранённый текст с сервера
            выгружать не надо, и обещать этого не будем. */}
        {queued && !dirty ? <Check className="h-3.5 w-3.5 text-gold" /> : null}
        {queued && !dirty ? t.signQueued : t.signSave}
      </button>
    </div>
  );
}
