// Дуэль героев: ход и дальность моба (владелец 08.11.2026: «по всем воинам
// нужно ещё 2 поля — дальность ходьбы и дальность удара»). Ход — на сколько
// клеток уходит за раз; дальность — только у дальнобойного, на сколько клеток
// стреляет. Сохраняется сразу по нажатию, отдельно от остальной формы.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { MAX_MOVE, MAX_RANGE, MOB_MOVE } from "@/lib/duel/rules";
import {
  getMobDuelStats,
  saveMobDuelStats,
  type MobDuelStats as Stats,
} from "@/server/api/duel/duel-api";

const MOVES = Array.from({ length: MAX_MOVE }, (_, i) => i + 1);
/** null — бьёт вплотную. */
const RANGES: Array<number | null> = [
  null,
  ...Array.from({ length: MAX_RANGE - 1 }, (_, i) => i + 2),
];

function Row<T extends number | null>({
  label,
  options,
  value,
  text,
  onPick,
}: {
  label: string;
  options: T[];
  value: T;
  text: (v: T) => string;
  onPick: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            onClick={() => onPick(o)}
            className={cn(
              "min-w-8 rounded-md border px-2 py-1 text-[12px] font-semibold",
              o === value ? "border-gold bg-gold/20 text-gold" : "border-border bg-secondary/40",
            )}
          >
            {text(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MobDuelStats({ templateId }: { templateId: string }) {
  const ru = useLang() !== "en";
  const qc = useQueryClient();
  const key = ["mob-duel-stats", templateId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => getMobDuelStats({ data: { id: templateId } }),
  });
  const save = useMutation({
    mutationFn: (s: Stats) => saveMobDuelStats({ data: { id: templateId, ...s } }),
    onMutate: (s) => qc.setQueryData(key, s),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : ru ? "Не сохранилось" : "Not saved");
      qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["duel-setup"] }),
  });
  if (!q.data) return null;
  const cur = q.data;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="text-[12px] font-semibold">{ru ? "Дуэль" : "Duel"}</p>
      <Row
        label={ru ? "Ход за раз, клеток" : "Move per turn, cells"}
        options={MOVES}
        value={cur.move ?? MOB_MOVE}
        text={String}
        onPick={(move) => save.mutate({ ...cur, move })}
      />
      <Row
        label={ru ? "Дальность удара, клеток" : "Attack range, cells"}
        options={RANGES}
        value={cur.range}
        text={(v) => (v === null ? (ru ? "вплотную" : "melee") : String(v))}
        onPick={(range) => save.mutate({ ...cur, range })}
      />
    </div>
  );
}
