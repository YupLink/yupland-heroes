// Автоподбор состава при живом росте: сколько построек, тема и «Другая подборка».
//
// Владелец, 25.09.2026: «нужно, чтобы ты рандомно делал подборки». Список со
// «шт/фон» тут не нужен: службы берутся по канону разблокировки с лимитом
// 1+⌊(N−1)/3⌋ (Civ VI), ратуша с 12 построек, храм с 8, модели внутри роли —
// жребием без повторов (HoMM3); всё от сида (docs/town-generation-algorithm.json,
// шаг 1). Админ задаёт число, заказ (лагерь, хутор, порт…) и тему, а кубик крутит сид.
import { useState } from "react";
import { Dices, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import {
  TOWN_KINDS,
  type SettlementRecipe,
  type TownKind,
} from "@/lib/raid/zonegen/settlement-types";
import {
  BUILDINGS_MAX,
  BUILDINGS_MIN,
  parseBuildings,
  themeChoices,
  themeLabel,
} from "./settlementAuto";
import { useZoneThemes } from "./useZoneThemes";
import { clampNum } from "./zoneGenHelpers";

/** Сколько построек у заказа по умолчанию — как у готовых шаблонов. */
const KIND_BUILDINGS: Partial<Record<TownKind, number>> = {
  camp: 5,
  hamlet: 7,
  village: 12,
  town: 24,
  port: 18,
};

const LABEL = "w-24 shrink-0 text-[10px] text-muted-foreground";
const FIELD =
  "w-12 shrink-0 rounded border border-border bg-secondary/40 px-1.5 py-1 text-right text-[11px] tabular-nums text-foreground";
const SELECT =
  "min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground";

export function SettlementAutoPick({
  buildings,
  theme,
  kind,
  onPatch,
  onReroll,
  rerollDisabled,
}: {
  buildings: number;
  theme: string;
  /** Заказ: что должно быть в поселении (лагерь, хутор, порт…); форму выводит рост. */
  kind: TownKind;
  onPatch: (part: Partial<SettlementRecipe>) => void;
  /** Новый сид и сразу генерация — тот же путь, что «Перегенерировать». */
  onReroll: () => void;
  rerollDisabled: boolean;
}) {
  const t = useT();
  const themes = useZoneThemes();
  const choices = themeChoices(themes.data ?? [], theme);
  // Черновик поля: пока набирают «12», первая «1» вне границ, и зажим сразу
  // превратил бы её в «3», а ввод — в «32». Числом становится только то, что
  // уже в границах; остальное доводится до них на выходе из поля.
  const [draft, setDraft] = useState<string | null>(null);

  const typed = (raw: string) => {
    setDraft(raw);
    const n = parseBuildings(raw);
    if (n !== null) onPatch({ buildings: n });
  };
  const settle = () => {
    if (draft !== null && parseBuildings(draft) === null) {
      onPatch({ buildings: Math.round(clampNum(draft, BUILDINGS_MIN, BUILDINGS_MAX)) });
    }
    setDraft(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={LABEL}>{t("zonegen.set_n_buildings")}</span>
        <input
          type="range"
          min={BUILDINGS_MIN}
          max={BUILDINGS_MAX}
          step={1}
          value={buildings}
          aria-label={t("zonegen.set_n_buildings")}
          onChange={(e) =>
            onPatch({
              buildings: Math.round(clampNum(e.target.value, BUILDINGS_MIN, BUILDINGS_MAX)),
            })
          }
          className="range-gold min-w-0 flex-1"
        />
        <input
          type="number"
          inputMode="numeric"
          min={BUILDINGS_MIN}
          max={BUILDINGS_MAX}
          value={draft ?? String(buildings)}
          aria-label={t("zonegen.set_n_buildings")}
          onChange={(e) => typed(e.target.value)}
          onBlur={settle}
          className={FIELD}
        />
      </div>

      <label className="flex items-center gap-2">
        <span className={LABEL}>{t("zonegen.set_kind")}</span>
        <select
          value={kind}
          onChange={(e) => {
            // Заказ задаёт и масштаб — те же числа, что у готовых шаблонов:
            // «городок» на 12 построек выходил деревней (владелец, 25.09).
            const next = e.target.value as TownKind;
            const n = KIND_BUILDINGS[next];
            onPatch(n === undefined ? { kind: next } : { kind: next, buildings: n });
          }}
          className={SELECT}
        >
          {TOWN_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`zonegen.kind_${k}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className={LABEL}>{t("zonegen.set_theme")}</span>
        <select
          value={theme}
          onChange={(e) => onPatch({ theme: e.target.value })}
          className={SELECT}
        >
          <option value="">{t("zonegen.set_theme_random")}</option>
          {choices.map((c) => (
            <option key={c.theme} value={c.theme}>
              {themeLabel(c)}
            </option>
          ))}
        </select>
        {themes.isFetching && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        )}
      </label>
      {themes.error && <p className="text-[10px] text-rose-300">{humanError(themes.error)}</p>}

      <button
        type="button"
        onClick={onReroll}
        disabled={rerollDisabled}
        title={t("zonegen.set_reroll_title")}
        className="inline-flex items-center gap-1 self-start rounded-lg border border-gold/50 bg-gold/10 px-1.5 py-1 text-[10px] font-semibold text-gold disabled:opacity-40"
      >
        <Dices className="h-3 w-3" />
        {t("zonegen.set_reroll")}
      </button>
    </div>
  );
}
