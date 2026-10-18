// Раздел «Артефакты»: сколько предметов положить прямо на карту.
//
// Редкости выбираются мультивыбором — это фильтр «из чего брать», а не одна
// редкость на всю раздачу: обычно нужно «редкие и эпические, а легендарки не
// сыпать». Список шаблонов сужает выбор ещё сильнее и по умолчанию пуст.
import { Chip, FieldLabel, NumBox } from "./ScatterFields";
import { fmtNum } from "./scatterFormat";
import { ScatterLandPicker } from "./ScatterLandPicker";
import { ScatterSection } from "./ScatterSection";
import { ScatterTemplatePicker } from "./ScatterTemplatePicker";
import { RARITY, rarityColor, rarityLabel } from "./scatterRarity";
import { intOf, MAX_PER_GROUP, overCap, type ArtifactDraft } from "./scatterDraft";

function summary(d: ArtifactDraft): string {
  const parts = [`${fmtNum(intOf(d.count, 0, 100_000))} шт`];
  parts.push(
    d.rarities.length === 0 ? "любые редкости" : d.rarities.map((r) => rarityLabel(r)).join(", "),
  );
  if (d.templateIds.length > 0) parts.push(`шаблоны: ${d.templateIds.length}`);
  return parts.join(" · ");
}

export function ScatterArtifactSection({
  value,
  onChange,
}: {
  value: ArtifactDraft;
  onChange: (next: ArtifactDraft) => void;
}) {
  const patch = (next: Partial<ArtifactDraft>) => onChange({ ...value, ...next });
  const toggleRarity = (r: string) =>
    patch({
      rarities: value.rarities.includes(r)
        ? value.rarities.filter((x) => x !== r)
        : [...value.rarities, r],
      // Шаблоны привязаны к редкостям: сузив фильтр, легко оставить в списке
      // предмет, которого он больше не пускает. Чистим, чтобы план не спорил
      // сам с собой.
      templateIds: [],
    });

  return (
    <ScatterSection
      title="Артефакты"
      summary={summary(value)}
      enabled={value.enabled}
      onEnabled={(enabled) => patch({ enabled })}
      removeKilled={value.removeKilled}
      onRemoveKilled={(removeKilled) => patch({ removeKilled })}
      removeHint="Подобранные уйдут с карты. Нетронутые останутся на местах"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <FieldLabel>Сколько</FieldLabel>
          <NumBox value={value.count} onChange={(count) => patch({ count })} placeholder="0" />
        </label>
        {/* Тот же честный потолок, что у боссов: сервер режет, форма говорит. */}
        {overCap(value.count) && (
          <span className="text-[10px] font-semibold text-amber-400">
            максимум {fmtNum(MAX_PER_GROUP)} за раз
          </span>
        )}
      </div>

      <div className="space-y-1">
        <FieldLabel>Редкости · пусто = любые</FieldLabel>
        <div className="flex flex-wrap gap-1">
          {RARITY.map((r) => (
            <Chip
              key={r}
              on={value.rarities.includes(r)}
              color={rarityColor(r)}
              onClick={() => toggleRarity(r)}
            >
              {rarityLabel(r)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <FieldLabel>Какие именно</FieldLabel>
        <ScatterTemplatePicker
          kind="artifact"
          title="Какие артефакты класть"
          value={value.templateIds}
          onChange={(templateIds) => patch({ templateIds })}
          rarities={value.rarities}
        />
      </div>

      <ScatterLandPicker lands={value.lands} onLands={(lands) => patch({ lands })} />
    </ScatterSection>
  );
}
