// Раздел «Боссы»: сколько новых выставить, каких уровней и с чем внутри.
//
// Уровень задаётся ДИАПАЗОНОМ, а не числом: карта живёт разношёрстной, и
// раздача «двадцать боссов с 3 по 7» — обычный запрос. Границы сервер выбирает
// сам для каждого босса.
import { ScatterLandPicker } from "./ScatterLandPicker";
import { ScatterSection } from "./ScatterSection";
import { ScatterFundList } from "./ScatterFundList";
import { ScatterPackList } from "./ScatterPackList";
import { ScatterArtList } from "./ScatterArtList";
import { FieldLabel, NumBox } from "./ScatterFields";
import { fmtNum } from "./scatterFormat";
import { intOf, MAX_PER_GROUP, overCap, type BossDraft } from "./scatterDraft";

function summary(d: BossDraft): string {
  const n = intOf(d.count, 0, 100_000);
  const from = intOf(d.levelMin, 1, 100);
  const to = intOf(d.levelMax, 1, 100);
  const range = from === to ? `${from} ур.` : `${Math.min(from, to)}–${Math.max(from, to)} ур.`;
  const extra = [
    d.funds.length > 0 ? `фонды: ${d.funds.length}` : null,
    d.packs.length > 0 ? `паки: ${d.packs.length}` : null,
    d.arts.length > 0 ? `арты: ${d.arts.length}` : null,
  ].filter(Boolean);
  return [`${n} шт`, range, ...extra].join(" · ");
}

export function ScatterBossSection({
  value,
  onChange,
  tokens,
}: {
  value: BossDraft;
  onChange: (next: BossDraft) => void;
  tokens: string[];
}) {
  const patch = (next: Partial<BossDraft>) => onChange({ ...value, ...next });

  return (
    <ScatterSection
      title="Боссы"
      summary={summary(value)}
      enabled={value.enabled}
      onEnabled={(enabled) => patch({ enabled })}
      removeKilled={value.removeKilled}
      onRemoveKilled={(removeKilled) => patch({ removeKilled })}
      removeHint="Убитые уйдут с карты. Живые и недобитые останутся на местах"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <FieldLabel>Сколько</FieldLabel>
          <NumBox value={value.count} onChange={(count) => patch({ count })} placeholder="0" />
        </label>
        {/* Потолок называем вслух: сервер всё равно срежет, и молчаливая
            подмена «200000 → 5000» выглядела бы как потерянная настройка. */}
        {overCap(value.count) && (
          <span className="text-[10px] font-semibold text-amber-400">
            максимум {fmtNum(MAX_PER_GROUP)} за раз
          </span>
        )}
        <label className="flex flex-col gap-1">
          <FieldLabel>Уровень от</FieldLabel>
          <NumBox
            value={value.levelMin}
            onChange={(levelMin) => patch({ levelMin })}
            placeholder="1"
            className="w-14"
          />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>до</FieldLabel>
          <NumBox
            value={value.levelMax}
            onChange={(levelMax) => patch({ levelMax })}
            placeholder="100"
            className="w-14"
          />
        </label>
        {/* Уровни МЕСТНОСТИ (не боссов): «5» или «1-10», пусто — любая. */}
        <label className="flex flex-col gap-1">
          <FieldLabel>Ур. местности</FieldLabel>
          <input
            type="text"
            value={value.terrainLevel ?? ""}
            onChange={(e) => patch({ terrainLevel: e.target.value })}
            placeholder="1-10"
            className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] tabular-nums outline-none focus:border-gold/50"
          />
        </label>
      </div>

      <ScatterFundList funds={value.funds} onChange={(funds) => patch({ funds })} tokens={tokens} />
      <ScatterPackList packs={value.packs} onChange={(packs) => patch({ packs })} />
      <ScatterArtList arts={value.arts} onChange={(arts) => patch({ arts })} />

      <ScatterLandPicker lands={value.lands} onLands={(lands) => patch({ lands })} />
    </ScatterSection>
  );
}
