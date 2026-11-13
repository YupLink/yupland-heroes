// Что перечитать после удара или подбора (useBetaEncounter).
//
// Правило (владелец, 23.10.2026): перечитываем только то, что удар МОГ
// изменить. Остальное, что меняется в каждом ударе (HP цели, энергия), окно
// берёт прямо из ответа удара — fightCachePatch.
//
// Инвентарь фишек (у крупных аккаунтов ~460 КБ) — только когда бой изменил
// фишки: оглушение (его инвентарь показывает). Яд и прочие эффекты живут в
// состоянии рейда, разгром отряда фишки не меняет. Раньше он уходил после
// КАЖДОГО удара — 10 раз в минуту серии «Атаковать снова», 4,6 МБ разбора на
// телефоне (замер 23.10.2026).
//
// Снаряжение и предметы — как и было, только у открытых экранов: износ
// артефактов ложится за бой.
import type { AttackResult } from "./useBetaEncounter";

/** Награды, которые ложатся в инвентарь предметов (артефакты, герои, свой товар). */
const ITEM_KINDS = new Set(["item", "artifact", "hero", "custom"]);

type Hit = Pick<
  AttackResult,
  "pickup" | "kind" | "rewards" | "chipEffects" | "chipsChanged" | "wiped"
> &
  StateHit;

/** Награда ждёт в «Добыче» (не свой товар, легший в рюкзак). */
const inHarvest = (x: Hit["rewards"][number]) => x.kind !== "custom" || !!x.queued;

/** Бой изменил фишки так, что это видно в инвентаре: оглушение. */
export function chipsChanged(r: {
  /** Признак сервера (encounter-attack, охрана шахты) — главный источник. */
  chipsChanged?: boolean;
  chipEffects?: ReadonlyArray<{ kind: string }> | null;
}): boolean {
  if (typeof r.chipsChanged === "boolean") return r.chipsChanged;
  // Старый сервер или подбор без признака — по оглушению в ответе.
  return (r.chipEffects ?? []).some((e) => e.kind === "stun");
}

/** Поля ответа удара, по которым видно, менял ли бой состояние рейда (энкаунтер и охрана). */
type StateHit = {
  killed?: boolean;
  slowed?: unknown;
  burnedEnergy?: number;
  chipEffects?: ReadonlyArray<unknown> | null;
  abilityLog?: ReadonlyArray<unknown> | unknown;
  abilityTotals?: Record<string, number> | unknown;
  artBroken?: ReadonlyArray<unknown> | null;
};

/**
 * Способности, след которых живёт в состоянии рейда (effects): ослабление и
 * снятие иммунитетов героя, замедление, яд и оглушение фишек. Выжигание
 * энергии сюда не входит — списанное (spentEnergy) окно правит само;
 * «рассечение» живёт только внутри боя.
 */
const STATE_ABILITIES = new Set([
  "slow",
  "poison",
  "poison_applied",
  "stun",
  "weak_atk",
  "weak_arm",
  "weak_luck",
  "weak_int",
  "strip_immune",
]);

function firedStateAbility(r: StateHit): boolean {
  const log = Array.isArray(r.abilityLog) ? (r.abilityLog as Array<{ kind?: unknown }>) : [];
  if (log.some((e) => typeof e?.kind === "string" && STATE_ABILITIES.has(e.kind))) return true;
  // Лог длинного боя обрезан — итоги по видам считает сервер целиком.
  const totals = (r.abilityTotals ?? {}) as Record<string, unknown>;
  return Object.entries(totals).some(([k, v]) => STATE_ABILITIES.has(k) && Number(v) > 0);
}

/**
 * Бой изменил состояние рейда сверх энергии: эффекты на игроке и фишках,
 * поломка артефакта (облик героя), добитая цель.
 */
export function stateChanged(r: StateHit): boolean {
  return (
    !!r.killed ||
    !!r.slowed ||
    (r.chipEffects?.length ?? 0) > 0 ||
    firedStateAbility(r) ||
    (r.artBroken?.length ?? 0) > 0
  );
}

export function attackRefreshKeys(r: Hit): { all: string[][]; active: string[][] } {
  const all: string[][] = [];
  const active: string[][] = [];
  // Подбор — без окна боя: энергию и позицию перечитываем как раньше.
  // Бой — энергию окно спишет из ответа удара, состояние — только по поводу.
  if (r.pickup) all.push(["beta-raid-state"], ["my-energy"]);
  else if (stateChanged(r)) all.push(["beta-raid-state"]);
  // Награда не начисляется молча — она встаёт в очередь над картой; пак,
  // артефакт, токены — кружок «Добычи» сразу (владелец, 16.10).
  const rewards = r.rewards ?? [];
  if (rewards.length > 0) all.push(["raid-pending-rewards"]);
  if (rewards.some(inHarvest)) all.push(["beta-raid-harvest"]);
  // Профиль (энергия в шапке профиля) — только открытый; закрытый помечен
  // устаревшим и перечитается при открытии.
  active.push(["yupland-status"]);
  // Открытие сундука на острове засчитывает сервер. Обновим видимый шаг
  // сразу после успешного подбора, не дожидаясь очередного опроса и «Показать».
  if (r.kind === "chest" && r.killed) active.push(["beta-raid-island"]);
  if (chipsChanged(r)) active.push(["my-chip-inventory"]);
  // Предметы и снаряжение — когда взяли артефакт, героя или товар, или был бой (износ).
  const items = r.kind === "artifact" || rewards.some((x) => ITEM_KINDS.has(x.kind));
  if (!r.pickup || items) active.push(["my-game-items"], ["my-hero-gear"]);
  return { all, active };
}
