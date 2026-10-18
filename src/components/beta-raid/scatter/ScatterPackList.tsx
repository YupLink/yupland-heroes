// Паки в награду боссам: какой пак и сколько штук раздать НА ВСЮ группу.
//
// Количество здесь общее, не «каждому»: паков всегда меньше, чем боссов, и
// раскладывает их сервер сам. Подпись под полем говорит это прямо — иначе
// «10» читается как «по десять на каждого» и раздача уходит в десять раз
// щедрее задуманного.
import { Plus, Trash2 } from "lucide-react";
import { PackPicker } from "@/components/admin/RewardConfigEditor";
import { FieldLabel, NumBox } from "./ScatterFields";
import type { PackDraft } from "./scatterDraft";

export function ScatterPackList({
  packs,
  onChange,
}: {
  packs: PackDraft[];
  onChange: (next: PackDraft[]) => void;
}) {
  const patch = (i: number, next: Partial<PackDraft>) =>
    onChange(packs.map((p, j) => (j === i ? { ...p, ...next } : p)));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <FieldLabel>Паки · всего штук</FieldLabel>
        <button
          type="button"
          onClick={() => onChange([...packs, { packId: "", count: "" }])}
          className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-[11px] font-semibold text-gold"
        >
          <Plus className="h-3 w-3" /> Добавить
        </button>
      </div>

      {packs.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {/* Паки карты — только чип-паки: NFT-паки на объекты не кладут
              (тот же выбор, что в редакторе объекта, FullObjectEditor). */}
          <PackPicker
            packId={p.packId === "" ? null : p.packId}
            onPack={(id) => patch(i, { packId: id ?? "" })}
            chipPacksOnly
          />
          <NumBox
            value={p.count}
            onChange={(v) => patch(i, { count: v })}
            placeholder="шт"
            className="w-14"
          />
          <button
            type="button"
            onClick={() => onChange(packs.filter((_, j) => j !== i))}
            aria-label="Убрать пак"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
