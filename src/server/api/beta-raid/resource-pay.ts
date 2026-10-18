// Плата НЕСКОЛЬКИМИ ресурсами разом — общая для портала, стройки и записи на турнир.
//
// Ресурсы те же, что в маркете (золото, камень, дерево, кристаллы, лайки,
// билеты, энергия, любой токен) — списываются теми же проверенными путями.
// Строки цены берутся ВСЕ разом: «100 золота и 5 кристаллов» это одна цена, а
// не выбор из двух.
//
// Возврат при сбое обязателен: если вторая строка цены не прошла, первая уже
// списана — без отката игрок платил бы за проход, которого не было.
import { sb } from "../../db/pg";
import { spendLikes } from "../heroes-shared";
import { moveTickets, ticketMoveApplied } from "../tickets-ledger";
import { payFromAccount } from "../currency/spend";
import { accAccountId } from "../currency/move";
import type { PortalPrice as ResourcePrice } from "@/lib/portal";
import { canonItemKey, isRes, refundOne, rememberTaken } from "./resource-refund";

/** Строка цены: ресурс и сколько. Тот же вид, что у портала. */
export type { PortalPrice as ResourcePrice } from "@/lib/portal";
/**
 * Вид строк res_ledger платы и отката; без него — portal/portal_refund (турнир —
 * tour_fee). keyed — энергия и товар тоже по ключу операции (pay-once): повтор
 * моста не спишет второй раз, и по ключу видно, списана ли строка. Пока только
 * у записи на турнир: стройка платит тем же ключом и после сорванной оплаты
 * (build:<клетка>:<тир>:<кошелёк>), и ключ сделал бы повтор бесплатным.
 */
export type PayKinds = { kind?: string; refundKind?: string; keyed?: boolean };

async function spendOne(
  wallet: string,
  account: string | null,
  p: ResourcePrice,
  ref: string,
  kind = "portal",
  keyed = false,
): Promise<void> {
  const res = p.resource;
  const amount = Number(p.amount) || 0;
  if (amount <= 0) return;

  // Товар берём из рюкзака ГЕРОЯ — там же, где он лежит после покупки в
  // маркете. Нет героя или не хватает штук — платить нечем.
  if (res === "item") {
    if (!p.itemKey) throw new Error("Не указан товар для оплаты");
    const { resolveBackpack, takeFromBackpackStack } = await import("./market-backpack");
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("Сначала выбери героя — товар лежит у него в рюкзаке");
    const key = await canonItemKey(p);
    // По ключу ошибка базы летит как есть; без ключа takeFromBackpackStack
    // отвечает на неё «столько нет» (общий путь портала и стройки).
    const took = keyed
      ? await (await import("./pay-once-item")).takeItemOnce(bp.heroId, key, amount, ref)
      : await takeFromBackpackStack(bp.heroId, key, amount);
    if (!took) {
      throw new Error(`Нужно ${amount} × ${p.itemName ?? "товар"} — в рюкзаке столько нет`);
    }
    // Снимок вида запоминаем: если оплата сорвётся на следующей строке, вернуть
    // товар будет некуда — списание могло опустошить и удалить ячейку. Возврат
    // пойдёт в тот же канонический стек, откуда забирали.
    rememberTaken(ref, { key, snap: took, heroId: bp.heroId });
    return;
  }

  if (isRes(res as string)) {
    if (!account) throw new Error("Ресурсный счёт не заведён");
    const { error } = await sb.rpc("res_move", {
      p_account: account,
      p_resource: res,
      p_delta: -amount,
      p_kind: kind,
      p_ref: ref,
    });
    if (error) {
      throw new Error(
        String(error.message).includes("в минус") ? "Не хватает ресурсов" : error.message,
      );
    }
    return;
  }
  if (res === "likes") return void (await spendLikes(wallet, amount, "portal_or_build", ref));
  if (res === "tickets") {
    // Своего вида у прохода нет: для леджера это услуга постройки. applied=false —
    // ключ уже проведён (слепой повтор моста), а не нехватка: её ticket_move бросает.
    const r = await moveTickets({ wallet, delta: -amount, kind: "building", ref });
    if (!r.applied && !(await ticketMoveApplied("building", ref).catch(() => false))) {
      throw new Error("Не хватает билетов");
    }
    return;
  }
  if (res === "energy") {
    if (keyed)
      return void (await (await import("./pay-once")).spendEnergyOnce(wallet, amount, ref));
    const { error } = await sb.rpc("touch_energy_atomic", { p_wallet: wallet, p_spend: amount });
    // «Не хватает» — только на нехватку: сбой базы (таймаут моста, нет счёта)
    // игроку честнее показать как есть, чем «пополни энергию».
    if (error) {
      const msg = String(error.message);
      throw new Error(/not_enough_energy/.test(msg) ? "Не хватает энергии" : msg);
    }
    return;
  }
  if (!p.token) throw new Error("Не указан токен оплаты");
  // applied=false здесь значит «этот ключ уже проведён» (повтор транспорта),
  // и это не отказ: деньги списаны, проход оплачен. Нехватку acc_move не
  // возвращает флагом — она приходит исключением из самого гарда счёта.
  // DARAI на карте (порталы, двери, апгрейды-строек с ценой в токене)
  // пополняет пул карты — так же, как маркет-постройка и payBuildPrice.
  if (p.token === "Darai") {
    const { payDaraiToMapPool } = await import("../currency/pay-darai-map");
    await payDaraiToMapPool({ wallet, amount, ref, note: `карта ${ref}` });
    return;
  }
  await payFromAccount({ wallet, token: p.token, amount, ref });
}

/**
 * Вернуть всю цену обратно: проход оплатили, а сам шаг не состоялся. ref — тот
 * же, что у payResources: по нему находится снимок списанного товара.
 *
 * Нужен снаружи (шлагбаум на шаге): там плата берётся ДО записи позиции, и
 * упавший шаг обязан вернуть деньги — иначе игрок платит за дверь, за которую
 * не прошёл.
 */
export async function refundResources(
  wallet: string,
  prices: ResourcePrice[],
  ref: string,
  opts?: PayKinds,
): Promise<void> {
  const account = await accAccountId(wallet).catch(() => null);
  for (let i = 0; i < prices.length; i++) {
    const key = `${ref}:${i}:${prices[i].resource}`;
    await refundOne(wallet, account, prices[i], key, opts?.refundKind, opts?.keyed);
  }
}

/** Взять всю цену прохода. Сорвалось на середине — возвращаем уплаченное. */
export async function payResources(
  wallet: string,
  prices: ResourcePrice[],
  ref: string,
  opts?: PayKinds,
): Promise<void> {
  const account = await accAccountId(wallet).catch(() => null);
  const paid: Array<{ p: ResourcePrice; key: string }> = [];
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    // Ключ операции — по НОМЕРУ строки: «100 золота» и «50 золота» это две
    // разные строки одной цены, и общий ключ схлопнул бы вторую (недобор).
    const key = `${ref}:${i}:${p.resource}`;
    try {
      await spendOne(wallet, account, p, key, opts?.kind, opts?.keyed);
      paid.push({ p, key });
    } catch (e) {
      for (const b of paid) {
        await refundOne(wallet, account, b.p, b.key, opts?.refundKind, opts?.keyed);
      }
      throw e;
    }
  }
}
