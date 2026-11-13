// Поведение ЭТОЙ постройки — прямо на живой карте.
//
// Раньше эффект задавался только у шаблона и применялся сразу ко всем его
// копиям: одна «Площадка» не могла быть грядкой здесь и складом там. Теперь
// клетка может назначить своё — оно перекрывает шаблон (cellBuildingEffect).
import type { BuildingEffect } from "@/lib/buildingEffect";

const EFFECTS: Array<{ key: string; label: string }> = [
  { key: "field", label: "Грядка" },
  { key: "warehouse", label: "Склад" },
  { key: "mine", label: "Шахта" },
  { key: "market", label: "Маркет" },
  { key: "building_shop", label: "Продажа построек (мир строителей)" },
  { key: "portal", label: "Портал" },
  { key: "tavern", label: "Таверна" },
  { key: "museum", label: "Музей" },
  { key: "tournament", label: "Турнир" },
  { key: "casino", label: "Казино (слот на золото)" },
  { key: "buckwheat", label: "Корона гречневого королевства (мини-игра на золото)" },
  { key: "enchant", label: "Зачарование (заклинания на артефакты)" },
  { key: "hero_enchant", label: "Зачарование героев (N героев в одного сильнее)" },
  { key: "art_gen", label: "Генератор артефактов" },
  { key: "university", label: "Университет" },
  { key: "leveltree", label: "Дерево" },
  { key: "shipyard", label: "Верфь" },
  { key: "watchtower", label: "Вышка" },
  { key: "sign", label: "Табличка" },
  { key: "boost", label: "БУСТ (+ к х-ке героя)" },
  { key: "spellbook", label: "Столб заклинаний" },
  { key: "oblivion", label: "Забвение (эффект за плату)" },
  { key: "chambers", label: "Покои (снять дебаффы)" },
  { key: "town_hall", label: "Ратуша (город)" },
];

/** Человеческое имя эффекта — для строки «сейчас работает». */
const EFFECT_LABEL: Record<string, string> = Object.fromEntries(
  EFFECTS.map((o) => [o.key, o.label]),
);

export function AdminEffectPicker({
  effect,
  ownEffect,
  typeLabel,
  onPick,
}: {
  /** Что работает сейчас (клетка или шаблон). */
  effect: BuildingEffect;
  /** Что назначено ИМЕННО этой клетке; пусто — наследуем шаблон. */
  ownEffect: string | null;
  /** Тип постройки для дефолтной строки: «по умолчанию: Ворота», а не «как в
   *  шаблоне» (жалоба владельца: «пишется не „как в шаблоне“, а ворота»). */
  typeLabel?: string | null;
  onPick: (next: string | null) => void;
}) {
  // Пустой пункт = «взять поведение шаблона». Подписываем его КОНКРЕТНЫМ типом:
  // категория постройки, иначе имя её эффекта, иначе прежнее «как в шаблоне».
  const inherit = typeLabel || (effect ? (EFFECT_LABEL[effect] ?? null) : null);
  const nowLabel = effect ? (EFFECT_LABEL[effect] ?? effect) : "только облик";
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Поведение этой постройки
      </span>
      <select
        value={ownEffect ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        <option value="">{inherit ? `по умолчанию: ${inherit}` : "как в шаблоне"}</option>
        {EFFECTS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[10px] text-muted-foreground">
        Сейчас работает: {nowLabel}. Выбор здесь меняет ТОЛЬКО эту клетку.
      </span>
    </label>
  );
}
