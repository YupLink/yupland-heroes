// Попытка обряда зачарования героев (владелец, 29.10.2026) — порядок шагов
// держит правила, как у лавки артефактов (enchant-flow):
//
//   1. повтор ключа (opId) — тот же итог из журнала, без второго списания;
//   2. отказы ДО денег: нет обряда, героев не столько, какой-то не свой / не
//      свободен / не той редкости, выйти некем (шаблонов яруса нет);
//   3. заявка в журнал: ключ + «одна незавершённая на набор героев»;
//   4. герои снимаются снимками ломбарда (всё или ничего) — пока идёт попытка,
//      их не продать, не выбрать основным и не положить в другой обряд;
//   5. вся цена — до броска; не хватает — уже списанное и герои возвращаются;
//   6. бросок — только здесь, криптослучайно; уцелевшие возвращаются из снимков
//      под прежними id (уровень, навыки, заклинания — как были);
//   7. успех — новая копия героя следующей редкости, а у «легендарный →
//      уникальный» — сам герой первой ячейки становится уником (уровень и
//      прокачка при нём); у ушедших рюкзак и надетое — мешочком, как у
//      ломбарда; итог — в журнал.
//
// База, деньги и случайность — через порт: тест гоняет те же шаги без базы.
import {
  HERO_RITE_NEXT,
  riteKeepsFirst,
  rollRite,
  type HeroRite,
  type HeroRiteResult,
  type HeroRiteTarget,
  type RiteHero,
  type Rnd,
} from "@/lib/enchant/heroRite";
import { mergeEnchantCost } from "@/lib/enchant/enchant";
import {
  payEnchant,
  refundEnchant,
  type PaidLine,
  type PayPort,
} from "@/server/api/beta-raid/enchant/enchant-pay";
import type { AttemptRow } from "@/server/api/beta-raid/enchant/enchant-flow";
import type { PawnHeroRef } from "@/server/api/beta-raid/hero-any";
import { riteItemKey, riteRef, type RiteClaim } from "./rite-sql";
import type { RiteRunInput } from "./rite-input";

type Template = { id: string; name: string; imageUrl: string | null };

export type RitePort = PayPort & {
  loadRite: (mapId: string, q: number, r: number, riteId: string) => Promise<HeroRite | null>;
  /** Свободные герои аккаунта этой редкости (как пикер ломбарда). */
  freeHeroes: (account: string, rarity: HeroRite["rarity"]) => Promise<RiteHero[]>;
  templates: (target: HeroRiteTarget) => Promise<Template[]>;
  readAttempt: (account: string, op: string) => Promise<AttemptRow | null>;
  clearStale: (itemKey: string) => Promise<void>;
  claim: (c: RiteClaim) => Promise<boolean>;
  notePaid: (account: string, op: string, paid: unknown) => Promise<void>;
  markRefunded: (account: string, op: string, error: string) => Promise<void>;
  /** Снять героев снимками (всё или ничего); отказ — ключ market.* / herorite.*. */
  takeHeroes: (
    rarity: HeroRite["rarity"],
    heroIds: string[],
    ref: string,
  ) => Promise<PawnHeroRef[]>;
  restoreHeroes: (refs: PawnHeroRef[]) => Promise<void>;
  grantHero: (itemId: string, templateId: string) => Promise<void>;
  /** Герой первой ячейки (уже возвращённый) — уником; не вышло — бросает. */
  makeUnique: (itemId: string) => Promise<void>;
  /** Ушедшие: снимки закрыты, рюкзак и надетое — мешочком (payPawnHeroes). */
  dropGone: (refs: PawnHeroRef[]) => Promise<void>;
  done: (account: string, op: string, res: HeroRiteResult) => Promise<void>;
  rnd: Rnd;
};

/** Записанная попытка → тот же ответ (или тот же отказ). */
function replay(row: AttemptRow): HeroRiteResult {
  if (row.status === "done" && row.result && typeof row.result === "object")
    return row.result as HeroRiteResult;
  if (row.status === "refunded") throw new Error(row.error || "enchant.failed");
  throw new Error("enchant.busy");
}

const paidJournal = (paid: PaidLine[]) =>
  paid.map((p) => ({ ...p.cost, ref: p.ref, receipt: p.receipt }));

/** Отказ снятия героев → ключ окна: занят, не свой, другая редкость — одним текстом. */
const takeKey = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /^market\.hero_/.test(msg) ? "herorite.hero_busy" : msg || "enchant.failed";
};

/** id новой копии — от ключа попытки: повтор второй копии не создаст. */
export const riteHeroItemId = (account: string, op: string): string => `ugi_rite_${account}_${op}`;

export async function heroRiteAs(
  port: RitePort,
  wallet: string,
  account: string,
  input: RiteRunInput,
): Promise<HeroRiteResult> {
  const op = input.opId;
  const prev = await port.readAttempt(account, op);
  if (prev) return replay(prev);

  const rite = await port.loadRite(input.mapId, input.q, input.r, input.riteId);
  if (!rite) throw new Error("herorite.no_rite");
  const ids = [...new Set(input.heroIds)];
  if (ids.length !== rite.need) throw new Error("herorite.need_count");
  const free = new Map(
    (await port.freeHeroes(account, rite.rarity)).map((h) => [h.itemId, h] as const),
  );
  if (ids.some((id) => !free.has(id))) throw new Error("herorite.hero_busy");
  const target = HERO_RITE_NEXT[rite.rarity];
  const keepsFirst = riteKeepsFirst(rite.rarity);
  const pool = keepsFirst ? [] : await port.templates(target);
  if (!keepsFirst && !pool.length) throw new Error("herorite.no_target");
  const cost = mergeEnchantCost(rite.cost);
  if (!cost.length) throw new Error("enchant.bad_cost");

  await port.clearStale(riteItemKey(ids));
  const claimed = await port.claim({ ...input, account, op, heroIds: ids, rite, cost });
  if (!claimed) {
    const again = await port.readAttempt(account, op);
    if (again) return replay(again);
    throw new Error("enchant.busy");
  }

  const ref = riteRef(account, op);
  const refuse = async (key: string): Promise<never> => {
    await port.markRefunded(account, op, key).catch(() => undefined);
    throw new Error(key);
  };
  let taken: PawnHeroRef[];
  try {
    taken = await port.takeHeroes(rite.rarity, ids, ref);
  } catch (e) {
    return refuse(takeKey(e));
  }
  let paid: PaidLine[];
  try {
    paid = await payEnchant(port, wallet, account, cost, ref);
  } catch (e) {
    await port.restoreHeroes(taken).catch((err) => {
      console.error("[hero-rite] герои не вернулись после отказа оплаты:", op, err);
    });
    return refuse(e instanceof Error ? e.message : "enchant.failed");
  }
  await port.notePaid(account, op, paidJournal(paid)).catch((e) => {
    console.warn("[hero-rite] журнал оплаты не записан:", op, e);
  });

  const roll = rollRite(rite, taken.length, port.rnd);
  // Уник: при успехе первый герой не уходит — он и становится уником.
  const goneIdx = new Set(roll.ok && keepsFirst ? roll.lost.filter((i) => i > 0) : roll.lost);
  const gone = taken.filter((_, i) => goneIdx.has(i));
  const keep = taken.filter((_, i) => !goneIdx.has(i));
  const undo = async (why: string, e: unknown): Promise<never> => {
    // Итога обряда нет — его и не было: герои и цена назад.
    console.error(`[hero-rite] ${why}, откат:`, op, e);
    await port.restoreHeroes(taken).catch(() => undefined);
    await refundEnchant(port, wallet, account, paid);
    return refuse("enchant.failed");
  };
  let hero: HeroRiteResult["hero"];
  if (roll.ok && keepsFirst) {
    const first = taken[0];
    try {
      await port.restoreHeroes([first]);
      await port.makeUnique(first.itemId);
    } catch (e) {
      return undo("герой не стал уником", e);
    }
    const h = free.get(first.itemId);
    hero = {
      itemId: first.itemId,
      templateId: first.templateId,
      name: h?.name ?? "",
      imageUrl: h?.imageUrl ?? null,
      rarity: "unique",
    };
  } else if (roll.ok) {
    const t = pool[port.rnd(0, pool.length)];
    const itemId = riteHeroItemId(account, op);
    try {
      await port.grantHero(itemId, t.id);
    } catch (e) {
      return undo("новый герой не выдан", e);
    }
    hero = { itemId, templateId: t.id, name: t.name, imageUrl: t.imageUrl, rarity: target };
  }
  // Уцелевших — назад сразу; сбой возврата не отменяет итог (снимок цел, алерт).
  if (keep.length)
    await port.restoreHeroes(keep).catch((e) => {
      console.error("[hero-rite] уцелевшие не вернулись, снимки целы:", op, e);
    });
  if (gone.length)
    await port.dropGone(gone).catch((e) => {
      console.error("[hero-rite] рюкзак ушедших не высыпан, снимки целы:", op, e);
    });

  const lost = gone.map((g) => {
    const h = free.get(g.itemId);
    return { itemId: g.itemId, name: h?.name ?? "", imageUrl: h?.imageUrl ?? null };
  });
  const res: HeroRiteResult = {
    outcome: roll.ok ? "ok" : gone.length ? "gone" : "none",
    ...(hero ? { hero } : {}),
    lost,
  };
  await port.done(account, op, res).catch((e) => {
    console.error("[hero-rite] итог не записан в журнал:", op, e);
  });
  return res;
}
