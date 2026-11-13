// Способности целей (босс/сундук/шахта — единый стиль).
//
// Конфиг живёт там же, где maxHp и rewardConfig: у босса в raid_boss_template,
// у объектов карты в mystic_item_template.meta. Значения задаются как награды
// дропов — фиксом «5» или диапазоном «5-10».
//
// Модуль импортируется и в админ-редактор (клиент), поэтому без node:crypto —
// randomInt там не бандлится. Игровой баланс, не крипто-контекст, Math.random ок.
const randomInt = (min: number, maxExclusive: number): number =>
  min + Math.floor(Math.random() * (maxExclusive - min));

export type AbilityKind =
  | "poison" // отрава: у фишки срезано % макс HP, N минут
  | "stun" // оглушение: фишка отдыхает и не выходит в бой N минут
  | "cleave" // удар по всем фишкам на передовой (их максимум 5)
  | "slow" // замедление: шаг по карте дороже на N энергии, N минут
  | "burn_energy" // выжигание: −N энергии игрока (с основного счёта) за удар
  // Ослабление героя: −N к одной характеристике на N минут. Каждая
  // характеристика — отдельная способность: босс, который сбивает броню, и
  // босс, который глушит интеллект, настраиваются порознь.
  | "weak_atk"
  | "weak_arm"
  | "weak_luck"
  | "weak_int"
  // Снятие иммунитетов: на N минут у героя не действует НИ ОДИН иммунитет —
  // ни от надетых артефактов, ни временный (зелья/еда/заклинания). Иммунитета
  // к самому снятию нет (владелец, 22.10.2026; модуль encounter-strip.ts).
  | "strip_immune";

/** Вид способности «Снятие иммунитетов» — он же вид строки эффекта на аккаунте. */
export const STRIP_IMMUNE_KIND = "strip_immune" as const;

/** Виды, которые бьют по характеристикам героя. */
export const WEAKEN_KINDS = ["weak_atk", "weak_arm", "weak_luck", "weak_int"] as const;
export type WeakenKind = (typeof WEAKEN_KINDS)[number];

/** Какую характеристику героя гасит вид способности. */
export const WEAKEN_STAT: Record<WeakenKind, "atk" | "arm" | "luck" | "int"> = {
  weak_atk: "atk",
  weak_arm: "arm",
  weak_luck: "luck",
  weak_int: "int",
};

export const isWeakenKind = (k: AbilityKind): k is WeakenKind =>
  (WEAKEN_KINDS as readonly string[]).includes(k);

export type AbilityCfg = {
  kind: AbilityKind;
  /** Шанс срабатывания за раунд, 0..100. */
  chance: number;
  /** «5» или «5-10». Смысл зависит от вида (см. ABILITY_META). */
  value: string | number;
  /**
   * Длительность в МИНУТАХ реального времени — для яда, оглушения и
   * замедления. «2» / «1-3». Эффект переживает бой и отпускает сам.
   */
  duration?: string | number;
};

export const ABILITY_META: Record<
  AbilityKind,
  {
    label: string;
    valueLabel: string;
    durationLabel: string | null;
    defaults: Omit<AbilityCfg, "kind">;
  }
> = {
  poison: {
    label: "Яд",
    valueLabel: "−% макс. HP фишки",
    durationLabel: "минут",
    defaults: { chance: 20, value: "3-6", duration: "10-20" },
  },
  stun: {
    label: "Оглушение",
    valueLabel: "— (фишка отдыхает)",
    durationLabel: "минут",
    defaults: { chance: 12, value: 0, duration: "5-10" },
  },
  cleave: {
    label: "Удар по всем",
    valueLabel: "% от обычного урона каждой фишке",
    durationLabel: null,
    defaults: { chance: 15, value: "50-70" },
  },
  slow: {
    label: "Замедление",
    valueLabel: "+энергии за шаг",
    durationLabel: "минут",
    defaults: { chance: 10, value: "1-2", duration: 5 },
  },
  burn_energy: {
    label: "Выжигание энергии",
    valueLabel: "энергии за удар",
    durationLabel: null,
    defaults: { chance: 25, value: "1-3" },
  },
  weak_atk: {
    label: "Ослабление: атака",
    valueLabel: "−атаки героя",
    durationLabel: "минут",
    defaults: { chance: 12, value: "1-2", duration: "10-20" },
  },
  weak_arm: {
    label: "Ослабление: броня",
    valueLabel: "−брони героя",
    durationLabel: "минут",
    defaults: { chance: 12, value: "1-2", duration: "10-20" },
  },
  weak_luck: {
    label: "Ослабление: удача",
    valueLabel: "−удачи героя",
    durationLabel: "минут",
    defaults: { chance: 12, value: "1-2", duration: "10-20" },
  },
  weak_int: {
    label: "Ослабление: интеллект",
    valueLabel: "−интеллекта героя",
    durationLabel: "минут",
    defaults: { chance: 12, value: "1-2", duration: "10-20" },
  },
  strip_immune: {
    label: "Снятие иммунитетов",
    valueLabel: "— (все иммунитеты героя)",
    durationLabel: "минут",
    defaults: { chance: 10, value: 0, duration: "5-10" },
  },
};

export const ABILITY_KINDS = Object.keys(ABILITY_META) as AbilityKind[];

/** «5» → [5,5]; «5-10» → [5,10]; мусор → [0,0]. */
export function parseRange(v: string | number | undefined): [number, number] {
  if (typeof v === "number") {
    const n = Math.max(0, Math.floor(v));
    return [n, n];
  }
  const s = String(v ?? "").trim();
  if (!s) return [0, 0];
  const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return lo <= hi ? [lo, hi] : [hi, lo];
  }
  const fixed = s.match(/^(\d+)$/);
  if (fixed) {
    const n = Number(fixed[1]);
    return [n, n];
  }
  return [0, 0];
}

/** Случайное целое из диапазона конфига. */
export function rollValue(v: string | number | undefined): number {
  const [lo, hi] = parseRange(v);
  if (hi <= 0) return 0;
  return lo === hi ? lo : randomInt(lo, hi + 1);
}

/** Бросок шанса: chance 0..100. */
export function rollChance(chance: number): boolean {
  const c = Math.max(0, Math.min(100, Number(chance) || 0));
  if (c <= 0) return false;
  if (c >= 100) return true;
  return randomInt(0, 100) < c;
}

/** Читает и чистит список способностей из meta/шаблона. */
export function parseAbilities(raw: unknown): AbilityCfg[] {
  if (!Array.isArray(raw)) return [];
  const out: AbilityCfg[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const kind = String(o.kind ?? "") as AbilityKind;
    if (!ABILITY_META[kind]) continue;
    const chance = Math.max(0, Math.min(100, Number(o.chance) || 0));
    if (chance <= 0) continue; // выключенная способность
    out.push({
      kind,
      chance,
      value: (o.value as string | number) ?? ABILITY_META[kind].defaults.value,
      duration: (o.duration as string | number) ?? ABILITY_META[kind].defaults.duration,
    });
  }
  return out;
}

/** Человеческое описание для карточки цели: «Яд · 20% · 3-6 · 10-20 минут». */
export function describeAbility(a: AbilityCfg): string {
  const meta = ABILITY_META[a.kind];
  const parts = [`${meta.label} · ${a.chance}%`];
  const [lo, hi] = parseRange(a.value);
  if (hi > 0) parts.push(lo === hi ? `${lo}` : `${lo}-${hi}`);
  if (meta.durationLabel) {
    const [dlo, dhi] = parseRange(a.duration);
    if (dhi > 0) {
      parts.push(`${dlo === dhi ? dlo : `${dlo}-${dhi}`} ${meta.durationLabel}`);
    }
  }
  return parts.join(" · ");
}
