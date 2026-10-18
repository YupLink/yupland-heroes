// Артефакты в награду боссам: строка — редкость, сколько штук всего и, если
// нужно, конкретные шаблоны.
//
// Редкость и шаблоны — не дубль друг друга: «легендарный, любой» отдаёт выбор
// серверу, а список шаблонов сужает его до своих. Пустая редкость («любая»)
// со списком шаблонов — тоже рабочий случай: важны сами предметы.
import { Plus, Trash2 } from "lucide-react";
import { Chip, FieldLabel, NumBox } from "./ScatterFields";
import { ScatterTemplatePicker } from "./ScatterTemplatePicker";
import { RARITY, rarityColor, rarityLabel } from "./scatterRarity";
import type { ArtDraft } from "./scatterDraft";

export function ScatterArtList({
  arts,
  onChange,
}: {
  arts: ArtDraft[];
  onChange: (next: ArtDraft[]) => void;
}) {
  const patch = (i: number, next: Partial<ArtDraft>) =>
    onChange(arts.map((a, j) => (j === i ? { ...a, ...next } : a)));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <FieldLabel>Артефакты в награду · всего штук</FieldLabel>
        <button
          type="button"
          onClick={() => onChange([...arts, { rarity: null, templateIds: [], count: "" }])}
          className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2 py-1 text-[11px] font-semibold text-gold"
        >
          <Plus className="h-3 w-3" /> Добавить
        </button>
      </div>

      {arts.map((a, i) => (
        <div
          key={i}
          className="space-y-1 rounded-lg border border-border/60 bg-background/40 p-1.5"
        >
          <div className="flex flex-wrap items-center gap-1">
            <Chip
              on={a.rarity === null}
              onClick={() => patch(i, { rarity: null, templateIds: [] })}
            >
              {rarityLabel(null)}
            </Chip>
            {RARITY.map((r) => (
              <Chip
                key={r}
                on={a.rarity === r}
                color={rarityColor(r)}
                // Смена редкости обнуляет шаблоны: оставленный эпический шаблон
                // при выбранной «легендарной» — это молчаливое противоречие,
                // разбирать которое пришлось бы серверу.
                onClick={() => patch(i, { rarity: r, templateIds: [] })}
              >
                {rarityLabel(r)}
              </Chip>
            ))}
          </div>
          {/* Количество, шаблоны и корзина — одной строкой без переноса: в
              общей обёртке с чипами редкости их растаскивало по разным
              строкам, и «шт» оказывалось под соседней редкостью. */}
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <ScatterTemplatePicker
                kind="artifact"
                title="Какие артефакты"
                value={a.templateIds}
                onChange={(ids) => patch(i, { templateIds: ids })}
                rarities={a.rarity ? [a.rarity] : []}
              />
            </div>
            <NumBox
              value={a.count}
              onChange={(v) => patch(i, { count: v })}
              placeholder="шт"
              className="w-14 shrink-0"
            />
            <button
              type="button"
              onClick={() => onChange(arts.filter((_, j) => j !== i))}
              aria-label="Убрать строку"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
