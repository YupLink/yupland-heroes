// Подтверждение «Снять с работы · отдых 3 ч» для героя, который батрачит.
//
// Раньше тап по такому герою в замке и в выборе героя упирался в «сначала сними
// его с поля», а к грядке основной мог и не дойти (ворота с порогом уровня).
// Теперь снять можно прямо отсюда — даром, но герой потом отдыхает (правило
// владельца 29.09.2026). Вид — как у соседнего подтверждения «сделать основным».
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { FIELD_RECALL_REST_H } from "@/lib/fieldRecall";
import { useFieldRecall } from "./useFieldRecall";

export function FieldRecallConfirm({
  heroId,
  at,
  onClose,
}: {
  heroId: string;
  /** «q,r» грядки, где герой работает. */
  at: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const recall = useFieldRecall(onClose);
  const [q, r] = (at ?? "").split(",");
  const box = useRef<HTMLDivElement>(null);
  // Подтверждение стоит под сеткой героев: на телефоне при длинном списке оно за
  // краем экрана, и тап выглядел бы как «ничего не случилось». Подводим к нему.
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [heroId]);

  return (
    <div ref={box} className="space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
      <p className="text-xs">
        {t("braid.field_recall_q", { h: FIELD_RECALL_REST_H })}
        {q && r ? ` · ${t("braid.field_recall_at", { q, r })}` : ""}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => recall.mutate({ heroId, at })}
          disabled={recall.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
        >
          {recall.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("braid.field_remove")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
