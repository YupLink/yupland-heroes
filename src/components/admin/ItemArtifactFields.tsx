// Поля, специфичные для артефакта: редкость, слот, земля, характеристика,
// раса/спец с бонусом и иммунитеты. Отдельным файлом, чтобы редактор
// предметов держался в 250 строках (§13 ПРАВИЛА.md).
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import {
  RACES,
  SPECIALIZATIONS,
  ARTIFACT_SLOTS,
  LANDS,
  ARTIFACT_STATS,
  IMMUNITIES,
  metaLabel,
} from "@/components/heroMeta";
import { FieldSel, SelAmt } from "./ItemFieldControls";
import { RARITY } from "./itemsAdminShared";

export type ArtifactFields = {
  rarity: string;
  slot: string;
  land: string;
  landAmount: string;
  statType: string;
  statAmount: string;
  race: string;
  raceAmount: string;
  specialization: string;
  specAmount: string;
  /** Бонус к рыбалке, % к базе шанса (14.10.2026). Пусто — нет. */
  fishBonusPct: string;
  immunities: string[];
};

type Setters = { [K in keyof ArtifactFields]: (v: ArtifactFields[K]) => void };

export function ItemArtifactFields({ v, set }: { v: ArtifactFields; set: Setters }) {
  const lang = useLang();
  const label = (x: string) => metaLabel(x, lang);
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <FieldSel
          label="Редкость"
          value={v.rarity}
          onChange={set.rarity}
          opts={RARITY as unknown as string[]}
          renderOpt={label}
        />
        <FieldSel
          label="Слот"
          value={v.slot}
          onChange={set.slot}
          opts={ARTIFACT_SLOTS as unknown as string[]}
          empty
          renderOpt={label}
        />
        <SelAmt
          label="Земля"
          sel={v.land}
          onSel={set.land}
          opts={LANDS as unknown as string[]}
          amt={v.landAmount}
          onAmt={set.landAmount}
          renderOpt={label}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <SelAmt
          label="Хар-ка"
          sel={v.statType}
          onSel={set.statType}
          opts={ARTIFACT_STATS as unknown as string[]}
          amt={v.statAmount}
          onAmt={set.statAmount}
          renderOpt={label}
        />
        <SelAmt
          label="Раса"
          sel={v.race}
          onSel={set.race}
          opts={RACES as unknown as string[]}
          amt={v.raceAmount}
          onAmt={set.raceAmount}
          renderOpt={label}
        />
        <SelAmt
          label="Спец"
          sel={v.specialization}
          onSel={set.specialization}
          opts={SPECIALIZATIONS as unknown as string[]}
          amt={v.specAmount}
          onAmt={set.specAmount}
          renderOpt={label}
        />
      </div>
      {/* Бонус к рыбалке — в процентах ОТ БАЗЫ шанса, складывается с удачей и
          другими артефактами: +50 при базе 10 % — это 15 %. */}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">Бонус к рыбалке, %</span>
        <input
          inputMode="decimal"
          value={v.fishBonusPct}
          onChange={(e) => set.fishBonusPct(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
          placeholder="0"
          className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Иммунитеты</div>
        <div className="flex flex-wrap gap-1">
          {IMMUNITIES.map((im) => {
            const on = v.immunities.includes(im);
            return (
              <button
                key={im}
                type="button"
                onClick={() =>
                  set.immunities(on ? v.immunities.filter((x) => x !== im) : [...v.immunities, im])
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] transition",
                  on
                    ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {metaLabel(im, lang)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
