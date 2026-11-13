// Бой на карте без окна: что делает тап по цели рядом и «Атаковать снова».
//
// Владелец (22.10.2026): кнопка «Атаковать» в окне цели была далеко внизу —
// приходилось листать; окно цели (отряд, награды, топ) — по кнопке «i».
// Владелец (23.10.2026): чтобы биться, по боссу/мобу рядом нажимают ДВАЖДЫ —
// первое нажатие только выбирает цель (появляются «i» и «Атаковать»), второе и
// следующие по той же цели бьют запомненным отрядом; «Атаковать» бьёт сразу.
// Если ударить нельзя (нет отряда, мало энергии, все фишки выбиты) — открываем
// окно цели: там видно, почему. Автоповтора нет: один удар — одно нажатие игрока.
//
// Чистая логика без React: хук useRaidFight только подставляет зависимости.
import type { LineChip } from "@/components/game/ChipSquadPicker";
import { DIRS } from "@/components/beta-raid/hexPassable";
import { isVoidCell } from "@/components/beta-raid/hexStepCost";
import { objectAction, objectKind } from "@/components/beta-raid/objectKind";
import type { Cell } from "@/components/beta-raid/unpackMap";
import { scaleEnergy } from "@/lib/raid/island/energy";

export type FightTarget = { objectId: string; q: number; r: number };
export type FightArgs = FightTarget & { lineup: LineChip[] };
type ObjectInfo = { meta: unknown; kind?: string | null };

/** Почему бить сразу нельзя — тогда вместо удара открывается окно цели. */
export type QuickBlock = "squad" | "energy" | null;

/** cost = null — цена неизвестна, решит сервер (его отказ тоже откроет окно). */
export function quickBlock(lineup: number, energy: number, cost: number | null): QuickBlock {
  if (lineup <= 0) return "squad";
  if (cost !== null && energy < cost) return "energy";
  return null;
}

/**
 * Отказ сервера, после которого игроку нужно окно цели, а не только тост:
 * энергии не хватило (encounter-pay) или весь отряд выбит/отдыхает
 * (encounter-lineup). Остальное — «подойди ближе», «опустошён» — тостом.
 */
const REFUSALS = [
  /^нужно [\d.,]+ энергии/,
  /^braid\.need_energy/,
  /^нет фишек для боя/,
  /^отряд героя разбежался/,
  /^весь отряд сейчас недоступен/,
];

export function refusalOpensInfo(message: string): boolean {
  const low = message.trim().toLowerCase();
  return REFUSALS.some((re) => re.test(low));
}

/** Цена удара из шаблона (по умолчанию 10, как useCellTap) с множителем карты. */
export function metaCost(meta: unknown, mult: number): number {
  const raw = (meta as { interactionCost?: unknown } | null)?.interactionCost;
  const n = typeof raw === "number" ? raw : Number(raw);
  return scaleEnergy(Number.isFinite(n) && n > 0 ? n : 10, mult);
}

/** Точная цена прошлого удара: списано минус выжженное боссом. */
export function hitCost(r: { spentEnergy?: number; burnedEnergy?: number } | null): number | null {
  const spent = Number(r?.spentEnergy);
  if (!Number.isFinite(spent)) return null;
  const burned = Number(r?.burnedEnergy) || 0;
  return Math.max(0, Math.round((spent - burned) * 100) / 100);
}

/** Бьётся ли объект в бою (босс, шахта с HP), а не забирается одним нажатием. */
export function opensBattle(obj: ObjectInfo & { id: string }): boolean {
  return objectAction(objectKind(obj.id, obj.meta, obj.kind ?? null), obj.meta).opensBattle;
}

/**
 * Цель боя по соседству — для кнопки «i» над картой. Последнюю цель удара
 * предпочитаем, если она ещё рядом: два босса бок о бок — «i» про того, кого бьём.
 */
export function fightTargetNear(
  cells: Record<string, Cell>,
  objects: Record<string, ObjectInfo> | undefined,
  pos: { q: number; r: number } | null,
  prefer: FightTarget | null,
): FightTarget | null {
  if (!pos || !objects) return null;
  let first: FightTarget | null = null;
  for (const d of DIRS) {
    const q = pos.q + d.q;
    const r = pos.r + d.r;
    const cell = cells[`${q},${r}`] as Cell | undefined;
    if (!cell?.objectId || cell.objectDefeated || isVoidCell(cell)) continue;
    const obj = objects[cell.objectId];
    if (!obj || !opensBattle({ id: cell.objectId, ...obj })) continue;
    const hit = { objectId: cell.objectId, q, r };
    if (prefer && prefer.objectId === hit.objectId && prefer.q === q && prefer.r === r) return hit;
    first ??= hit;
  }
  return first;
}

export const sameTarget = (a: FightTarget | null, b: FightTarget | null): boolean =>
  a === b || (!!a && !!b && a.objectId === b.objectId && a.q === b.q && a.r === b.r);

export type FightDeps = {
  /** Удар уже летит — второй не шлём. */
  pending: () => boolean;
  energy: () => number;
  /** Запомненный отряд (тот же, что в окне цели). */
  lineup: () => LineChip[];
  /** Цена удара по цели; null — неизвестна. */
  costOf: (t: FightTarget) => number | null;
  /** Отправить удар; onRefused — сервер отказал по энергии/отряду. */
  hit: (args: FightArgs, onRefused: () => void) => void;
  /** Открыть окно цели (и убрать итог боя, если он открыт). */
  openInfo: (t: FightTarget) => void;
  /** Выбор цели сменился — экрану перерисовать «i» и «Атаковать». */
  onArm?: () => void;
};

/** Состояние одно — последний удар: по нему «Атаковать снова» и «i» в итоге. */
export function createFightControl(d: FightDeps) {
  let last: FightArgs | null = null;
  /** Выбранная первым нажатием цель: следующее нажатие по ней — удар. */
  let armed: FightTarget | null = null;
  const arm = (t: FightTarget | null) => {
    if (sameTarget(armed, t)) return;
    armed = t ? { objectId: t.objectId, q: t.q, r: t.r } : null;
    d.onArm?.();
  };
  const send = (args: FightArgs) => {
    last = args;
    d.hit(args, () => d.openInfo(args));
  };
  const tryHit = (args: FightArgs, cost: number | null) => {
    if (d.pending()) return;
    if (quickBlock(args.lineup.length, d.energy(), cost)) {
      d.openInfo(args);
      return;
    }
    send(args);
  };
  return {
    /** Тап по цели рядом: первый — выбрать (появятся «i» и «Атаковать»), дальше — удар. */
    tap(t: FightTarget) {
      if (!sameTarget(armed, t)) {
        arm(t);
        return;
      }
      tryHit({ objectId: t.objectId, q: t.q, r: t.r, lineup: d.lineup() }, d.costOf(t));
    },
    /** Кнопка «Атаковать» (над картой, в карточке «рядом»): удар сразу. */
    attack(t: FightTarget) {
      arm(t);
      tryHit({ objectId: t.objectId, q: t.q, r: t.r, lineup: d.lineup() }, d.costOf(t));
    },
    /** Цель ушла из соседей или герой отошёл — выбор снимается. */
    disarm() {
      arm(null);
    },
    armed: (): FightTarget | null => armed,
    /** Кнопка в окне цели: отряд и энергию окно уже проверило само. */
    fromWindow(t: FightTarget, lineup: LineChip[]) {
      if (d.pending()) return;
      send({ objectId: t.objectId, q: t.q, r: t.r, lineup });
    },
    /** «Атаковать снова» из итога: та же цель тем же отрядом. Добита — нечего. */
    again(result: { killed: boolean; spentEnergy?: number; burnedEnergy?: number } | null) {
      if (!last || !result || result.killed) return;
      tryHit(last, hitCost(result) ?? d.costOf(last));
    },
    last: (): FightArgs | null => last,
  };
}

export type FightControl = ReturnType<typeof createFightControl>;
