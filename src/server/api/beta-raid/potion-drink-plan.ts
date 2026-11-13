// План «выпить зелья»: что списать и какие строки эффектов записать — без базы.
//
// Броски (rollBoostQty) раскладываются по видам записи так же, как их писал
// applyBoostRoll по одному (hero-buff.ts), только все сразу — для одного
// оператора potion-drink-sql.ts:
//  - бафф стата (buff_*) — своя строка на бросок, как applyBuff;
//  - иммунитет — одна строка на вид: минуты одного вида складываются (повтор
//    продлевает срок — два продления подряд равны одному на сумму минут);
//  - забвение — по виду (заряды / заряды со сроком / безлимит): заряды и
//    минуты складываются, как в rollBoostQty и как при выдаче подряд;
//  - сытость — сумма прибавок (шкала режется потолком один раз: прибавки
//    неотрицательные, итог тот же, что у moveSatiety подряд).
// Склейка нужна не ради красоты: одна вставка не может задеть одну строку
// (аккаунт, вид) дважды. Сила и минуты — ровно те, что выпали: правила
// эффектов (ПРАВИЛА §8.20, «как задал админ») здесь не меняются.
import { immuneEffectKind } from "@/lib/hero/boostImmune";
import { oblivionRollMode, type OblivionMode } from "@/lib/hero/oblivionRule";
import type { BoostRoll } from "@/lib/hero/boost";

/** Штуки одного вида из рюкзака/сумки героя. */
export type DrinkNeed = { stackKey: string; qty: number };

/** Строка баффа (buff_*): вставка без склейки, сумма — на чтении. */
export type DrinkBuff = { kind: string; value: number; minutes: number };
/** Иммунитет: сила 1, срок продлевается. */
export type DrinkTimed = { kind: string; minutes: number };
/** Забвение одного вида: заряды и минуты (oblivionPutSql). */
export type DrinkOblivion = { mode: OblivionMode; level: number; minutes: number };

export type DrinkEffects = {
  buffs: DrinkBuff[];
  timed: DrinkTimed[];
  oblivion: DrinkOblivion[];
  /** Прибавка сытости (0 — еды в наборе нет). */
  satiety: number;
};

const int = (v: number): number => (Number.isFinite(v) ? Math.round(v) : 0);

/** Разложить броски всех строк набора по видам записи. */
export function drinkEffects(rolls: BoostRoll[]): DrinkEffects {
  const buffs: DrinkBuff[] = [];
  const timed = new Map<string, DrinkTimed>();
  const oblivion = new Map<OblivionMode, DrinkOblivion>();
  let satiety = 0;
  for (const r of rolls) {
    if (r.stat === "oblivion") {
      const level = Math.max(0, Math.floor(Number(r.amount) || 0));
      const minutes = Math.max(0, Math.floor(Number(r.minutes) || 0));
      const mode = oblivionRollMode(level, minutes);
      if (!mode) continue;
      const m = oblivion.get(mode);
      if (m) {
        m.level += level;
        m.minutes += minutes;
      } else oblivion.set(mode, { mode, level, minutes });
      continue;
    }
    if (r.stat === "satiety") {
      satiety += Math.max(0, int(r.amount));
      continue;
    }
    if (r.stat === "immune") {
      const minutes = int(r.minutes);
      if (!r.ability || minutes <= 0) continue;
      const kind = immuneEffectKind(r.ability);
      const m = timed.get(kind);
      if (m) m.minutes += minutes;
      else timed.set(kind, { kind, minutes });
      continue;
    }
    const value = int(r.amount);
    const minutes = int(r.minutes);
    if (value <= 0 || minutes <= 0) continue;
    buffs.push({ kind: `buff_${r.stat}`, value, minutes });
  }
  return { buffs, timed: [...timed.values()], oblivion: [...oblivion.values()], satiety };
}

/** Кол-во для SQL: до тысячных, без хвоста double (как у списания рюкзака). */
const qtyNum = (qty: number): number => Math.max(0, Math.round(qty * 1000) / 1000);

/** Склеить виды: один ключ дважды — сумма штук. Пустые строки отбрасываются. */
export function drinkNeeds(lines: DrinkNeed[]): DrinkNeed[] {
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.stackKey, (merged.get(l.stackKey) ?? 0) + qtyNum(l.qty));
  return [...merged.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([stackKey, qty]) => ({ stackKey, qty: qtyNum(qty) }));
}
