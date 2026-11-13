// Попытка зачарования (владелец, 28.10.2026) — порядок шагов держит правила:
//
//   1. повтор ключа (opId) — тот же итог из журнала, без второго списания;
//   2. отказы ДО денег: нет заклинания, артефакт не свой/нет такого, уже
//      зачарован (enchant.already);
//   3. заявка в журнал: ключ + «одна незавершённая попытка на предмет»;
//   4. вся цена (база + шаги) — до броска; не хватает чего-то — уже списанное
//      возвращается, ничего не потеряно (enchant-pay);
//   5. бросок — только здесь, криптослучайно (secureRandom);
//   6. итог одним утверждением (enchant-finish-sql). Предмет за время оплаты
//      увели — цена возвращается. При неудаче и разрушении цена не возвращается.
//
// База, деньги и случайность — через порт: тест гоняет те же шаги без базы.
import {
  enchantOdds,
  enchantSteps,
  enchantTotalCost,
  type EnchantCost,
  type EnchantSpell,
} from "@/lib/enchant/enchant";
import {
  enchantStatRecord,
  enchantStatsOf,
  type EnchantStatSource,
} from "@/lib/enchant/enchantGear";
import { attemptRef, type AttemptClaim } from "./enchant-sql";
import type { FinishInput } from "./enchant-finish-sql";
import { payEnchant, refundEnchant, type PaidLine, type PayPort } from "./enchant-pay";
import type { EnchantInput } from "./enchant-input";

export type EnchantOutcome = "ok" | "none" | "gone";
export type EnchantResult = {
  outcome: EnchantOutcome;
  pct?: number;
  before?: Record<string, number>;
  after?: Record<string, number>;
};

/** Артефакт аккаунта, как его читает лавка (enchant-sql.artifactsSql). */
export type EnchantArtRow = EnchantStatSource & {
  itemId: string;
  templateId: string;
  name: string | null;
  image: string | null;
  rarity: string | null;
  enchantPct: number | null;
  spellName: string | null;
  equipped: boolean;
};

export type AttemptRow = {
  status: string;
  result: unknown;
  error: string | null;
};

export type FlowPort = PayPort & {
  loadSpell: (mapId: string, q: number, r: number, spellId: string) => Promise<EnchantSpell | null>;
  loadArt: (account: string, itemId: string) => Promise<EnchantArtRow | null>;
  readAttempt: (account: string, op: string) => Promise<AttemptRow | null>;
  clearStale: (itemId: string) => Promise<void>;
  claim: (c: AttemptClaim) => Promise<boolean>;
  notePaid: (account: string, op: string, paid: unknown) => Promise<void>;
  markRefunded: (account: string, op: string, error: string) => Promise<void>;
  /** Итог одним утверждением; число — сколько строк предмета затронуто (0 — предмета нет). */
  finish: (outcome: EnchantOutcome, f: FinishInput) => Promise<number>;
  /** Целое в [min, max) — secureRandomInt. */
  rnd: (min: number, max: number) => number;
};

const SCALE = 1_000_000;

/** Бросок: исход по шансам с шагами, усиление — целое в [boostMin, boostMax]. */
export function rollEnchant(
  s: EnchantSpell,
  steps: number,
  rnd: FlowPort["rnd"],
): { outcome: EnchantOutcome; pct?: number } {
  const o = enchantOdds(s, steps);
  const x = (rnd(0, SCALE) * 100) / SCALE;
  if (x < o.success) return { outcome: "ok", pct: rnd(s.boostMin, s.boostMax + 1) };
  if (x < o.success + o.destroy) return { outcome: "gone" };
  return { outcome: "none" };
}

/** Записанная попытка → тот же ответ (или тот же отказ). */
function replay(row: AttemptRow): EnchantResult {
  if (row.status === "done" && row.result && typeof row.result === "object")
    return row.result as EnchantResult;
  if (row.status === "refunded") throw new Error(row.error || "enchant.failed");
  throw new Error("enchant.busy");
}

const paidJournal = (paid: PaidLine[]) =>
  paid.map((p) => ({ ...p.cost, ref: p.ref, receipt: p.receipt }));

export async function enchantAs(
  port: FlowPort,
  wallet: string,
  account: string,
  input: EnchantInput,
): Promise<EnchantResult> {
  const op = input.opId;
  const prev = await port.readAttempt(account, op);
  if (prev) return replay(prev);

  const spell = await port.loadSpell(input.mapId, input.q, input.r, input.spellId);
  if (!spell) throw new Error("enchant.no_spell");
  const art = await port.loadArt(account, input.itemId);
  if (!art) throw new Error("enchant.no_item");
  if (art.enchantPct != null) throw new Error("enchant.already");

  const steps = enchantSteps(spell, input.steps);
  const cost: EnchantCost[] = enchantTotalCost(spell, steps);
  if (!cost.length) throw new Error("enchant.bad_cost");

  await port.clearStale(art.itemId);
  const claimed = await port.claim({
    account,
    op,
    itemId: art.itemId,
    templateId: art.templateId,
    mapId: input.mapId,
    q: input.q,
    r: input.r,
    spell,
    steps,
    cost,
  });
  if (!claimed) {
    const again = await port.readAttempt(account, op);
    if (again) return replay(again);
    throw new Error("enchant.busy");
  }

  let paid: PaidLine[];
  try {
    paid = await payEnchant(port, wallet, account, cost, attemptRef(account, op));
  } catch (e) {
    const key = e instanceof Error ? e.message : "enchant.failed";
    await port.markRefunded(account, op, key).catch(() => undefined);
    throw e;
  }
  await port.notePaid(account, op, paidJournal(paid)).catch((e) => {
    console.warn("[enchant] журнал оплаты не записан:", op, e);
  });

  const roll = rollEnchant(spell, steps, port.rnd);
  const result: EnchantResult =
    roll.outcome === "ok"
      ? {
          outcome: "ok",
          pct: roll.pct,
          before: enchantStatRecord(art),
          after: enchantStatRecord(enchantStatsOf(art, roll.pct)),
        }
      : { outcome: roll.outcome };
  const f: FinishInput = {
    account,
    op,
    itemId: art.itemId,
    result,
    pct: roll.pct,
    spellId: spell.id,
    spellName: spell.name,
  };

  let n: number;
  try {
    n = await port.finish(roll.outcome, f);
  } catch (e) {
    // Итог мог записаться (мост повторяет вслепую) — журнал знает наверняка.
    // Журнал не прочитать — исход неизвестен: цену не трогаем (второй возврат
    // или даровое зачарование хуже), заявка остаётся с записью оплаты.
    const after = await port.readAttempt(account, op).catch(() => undefined);
    if (after === undefined) {
      console.error("[enchant] итог неизвестен, заявка оставлена:", op, e);
      throw new Error("enchant.failed");
    }
    if (after?.status === "done") return replay(after);
    console.error("[enchant] итог не записан, возвращаем цену:", op, e);
    n = 0;
  }
  if (n > 0) return result;

  // Предмет ушёл между проверкой и итогом: бросок не состоялся — цену назад.
  await refundEnchant(port, wallet, account, paid);
  await port.markRefunded(account, op, "enchant.item_changed").catch(() => undefined);
  throw new Error("enchant.item_changed");
}
