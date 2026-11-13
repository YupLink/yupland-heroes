// Откат платы resource-pay: вернуть одну строку цены. Вынесено из
// resource-pay.ts ради лимита ≤250 строк.
//
// Невозвращённая плата — не мелочь: игрок остался и без прохода, и без денег.
// Любой сбой возврата (исключение, ответ базы {error}, нет счёта или героя)
// кричит в лог — без этого жалобу не по чему разобрать.
import { sb } from "../../db/pg";
import { accMove } from "../currency/move";
import { grantRaidReward } from "../raid-helpers";
import { creditEnergy } from "../energy-credit";
import type { BackpackTakeSnapshot } from "@/server/api/beta-raid/market-backpack-take";
import type { MarketPriceResource } from "@/lib/marketItem";
import type { PortalPrice as ResourcePrice } from "@/lib/portal";
import { ticketRowAsGold } from "@/lib/ticketPriceGold";

const RES = ["gold", "stone", "wood", "diamonds"] as const;
export const isRes = (r: string): boolean => (RES as readonly string[]).includes(r);

/**
 * Что забрали из рюкзака в этом платеже и каким КАНОНИЧЕСКИМ ключом: снимок
 * нужен возврату (вид — если ячейка опустела и удалилась; метки происхождения —
 * чтобы добыча не стала покупкой, ПРАВИЛА §8.18), ключ — чтобы вернуть в тот же
 * стек. Запись — по op-ключу строки цены: общий на процесс ключ «вид товара»
 * отдавал откату снимок ЧУЖОГО платежа, и метки двух игроков, плативших одним
 * товаром, менялись местами. Платёж и откат идут в одном запросе — хватает
 * последних TAKEN_MAX записей. heroId — с кого списали: откат вернёт ему.
 */
type Taken = { key: string; snap: BackpackTakeSnapshot; heroId: string };
const taken = new Map<string, Taken>();
const TAKEN_MAX = 1000;

export function rememberTaken(ref: string, t: Taken): void {
  taken.delete(ref);
  taken.set(ref, t);
  while (taken.size > TAKEN_MAX) taken.delete(taken.keys().next().value as string);
}

/**
 * Ключ стека товара цены — к канону: цена, выставленная на «Помидоры»,
 * обязана приниматься «Помидором» — это один товар (item-alias).
 */
export async function canonItemKey(p: ResourcePrice): Promise<string> {
  const { canonStackKey } = await import("./item-alias");
  const [kind, ...rest] = String(p.itemKey).split(":");
  return canonStackKey(kind, rest.join(":"), p.itemName ?? null);
}

export function warnRefund(wallet: string, p: ResourcePrice, e: unknown): void {
  console.error(
    `[portal] НЕ вернули ${p.amount} ${p.token ?? p.resource} игроку ${wallet}:`,
    e instanceof Error ? e.message : e,
  );
}

/** Товар — в тот же стек рюкзака, из которого брали; keyed — один раз на ключ. */
async function refundItem(
  wallet: string,
  account: string | null,
  p: ResourcePrice,
  ref: string,
  keyed: boolean,
): Promise<void> {
  const amount = Number(p.amount) || 0;
  const { resolveBackpack, returnToBackpackStack } = await import("./market-backpack");
  const t = taken.get(ref);
  // Промах — возврат с чужим ref или другой процесс: штуки вернутся без меток.
  if (!t) console.warn(`[resource-pay] снимка платы ${ref} нет — возврат без меток`);
  // Тому, с кого списали: сменил основного — зелья не лягут в чужую сумку.
  const hero = t?.heroId ?? (await resolveBackpack(wallet))?.heroId;
  if (!hero) throw new Error("нет героя — товар вернуть некуда");
  if (!keyed)
    return returnToBackpackStack(hero, t?.key ?? String(p.itemKey), amount, t?.snap, account);
  const { returnItemOnce } = await import("./pay-once-item");
  const key = t?.key ?? (await canonItemKey(p));
  await returnItemOnce(hero, key, amount, t?.snap, account, ref);
}

/** Вернуть списанное: проход не состоялся. keyed — энергия и товар по ключу (pay-once). */
export async function refundOne(
  wallet: string,
  account: string | null,
  row: ResourcePrice,
  ref: string,
  kind = "portal_refund",
  keyed = false,
): Promise<void> {
  // Цену «в билетах» брали золотом ×500 (§8.61) — тем же золотом и возвращаем.
  const p = ticketRowAsGold(row);
  const amount = Number(p.amount) || 0;
  if (amount <= 0) return;

  if (p.resource === "item") {
    if (!p.itemKey) return;
    await refundItem(wallet, account, p, ref, keyed).catch((e) => warnRefund(wallet, p, e));
    return;
  }
  if (isRes(p.resource as string)) {
    if (!account) return warnRefund(wallet, p, "ресурсный счёт не найден");
    try {
      // Шим кладёт отказ базы в {error}, а не бросает: без этой проверки
      // несостоявшийся возврат молча считался сделанным.
      const { error } = await sb.rpc("res_move", {
        p_account: account,
        p_resource: p.resource as MarketPriceResource,
        p_delta: amount,
        p_kind: kind,
        p_ref: `${ref}:back`,
      });
      if (error) warnRefund(wallet, p, error.message);
    } catch (e) {
      warnRefund(wallet, p, e);
    }
    return;
  }
  if (p.resource === "token" && p.token) {
    // Звездочник заплатил за DARAI звёздами — их и возвращаем, пул не трогаем.
    if (p.token === "Darai") {
      const { starsPaidFor } = await import("../currency/darai-stars-pay");
      const stars = await starsPaidFor(wallet, ref).catch(() => null);
      if (stars != null) {
        await accMove({ wallet, token: "STARS", delta: stars, kind: "acc_reward", ref: `${ref}:back` }).catch(
          (e) => warnRefund(wallet, p, e),
        );
        return;
      }
    }
    await accMove({
      wallet,
      token: p.token,
      delta: amount,
      kind: "acc_reward",
      ref: `${ref}:back`,
    }).catch((e) => warnRefund(wallet, p, e));
    // Пул карты симметричен: если платёж прибавил player_spend, откат
    // должен вычесть ту же сумму. Иначе счётчик распухает при каждом
    // отказе прохода, а игрок деньги получил назад.
    if (p.token === "Darai") {
      const { insertPoolMove } = await import("../darai-pools-move");
      await insertPoolMove({
        pool: "map",
        kind: "player_spend",
        amount: -amount,
        ref: `${ref}:back`,
        note: `откат карта ${ref}`,
      }).catch((e) => console.warn("[pool] откат map player_spend не записан:", ref, e));
    }
    return;
  }
  // Энергия — возврат, а не награда: восстанавливает купленный запас (acc-45).
  const back = `${ref}:back`;
  if (p.resource === "energy" && keyed) {
    const { refundEnergyOnce } = await import("./pay-once");
    return void (await refundEnergyOnce(wallet, amount, ref).catch((e) =>
      warnRefund(wallet, p, e),
    ));
  }
  await (
    p.resource === "energy"
      ? creditEnergy(wallet, amount, "energy_refund", back)
      : grantRaidReward(wallet, p.resource, amount, null, back)
  ).catch((e) => warnRefund(wallet, p, e));
}
