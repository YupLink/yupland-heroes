// Выдача подарка: что именно кладём игроку в руки, когда он нажал «Забрать».
//
// Правило подарка: пока строка в player_gift лежит `pending`, у игрока НЕТ
// ничего — ни лайков, ни энергии, ни пака. Всё добро появляется здесь, ровно
// один раз, и только после того, как клейм захватил строку (см. gifts.ts).
//
// Своего ключа повтора хватает не всем: у лайков он есть (like_grant_log), у
// билетов и токенов — леджер. А `add_energy`, выдача пака и вставка предмета
// дедупа не знают, и слепой ретрай моста выдал бы второй раз. Для них право на
// выдачу занимается меткой в gift_deliver_op (gifts-once.ts).
import { sb, pg } from "../db/pg";
import { nanoid } from "nanoid";
import { accountOf } from "./user-shared";

/** Что бывает подарком. Совпадает с колонкой kind в player_gift. */
export type GiftKind =
  | "likes"
  | "energy"
  | "tickets"
  | "resource"
  | "token"
  | "pack"
  | "hero"
  | "art"
  | "item"
  // Свой товар (cst_…) — в рюкзак выбранного героя, тем же путём, что награды
  // «Добычи»: нет героя или места — подарок ждёт (бросок, строка остаётся).
  | "custom";

export type GiftRow = {
  id: string;
  account_id: string;
  kind: GiftKind;
  amount: number;
  ref_id: string | null;
  title: string | null;
  image: string | null;
  note: string | null;
  status: string;
  created_at: string;
  /** Срок клейма в мс эпохи (extract(epoch)*1000); NULL — бессрочный. */
  expires_ms: number | string | null;
};

const RESOURCES = new Set(["gold", "stone", "wood", "diamonds"]);

/**
 * Отдать подарок игроку. Бросает — значит выдать не удалось, и вызывающий
 * обязан вернуть строку в `pending`: иначе подарок сгорит впустую.
 */
export async function deliverGift(wallet: string, gift: GiftRow): Promise<void> {
  const ref = `gift:${gift.id}`;
  const amount = Number(gift.amount) || 0;

  if (gift.kind === "likes") {
    const { likeAccountId, addLikes } = await import("../likesAccount");
    await addLikes(await likeAccountId(wallet), amount, "lifetime_granted", ref);
    return;
  }

  if (gift.kind === "energy") {
    const { claimDeliverOnce, releaseDeliverOnce } = await import("./gifts-once");
    // Метку ставим ДО начисления: если ответ потеряется, повтор её не получит
    // и энергия не уйдёт вторым разом.
    if (!(await claimDeliverOnce(ref, gift.id))) return;
    // Энергия подписки (ref_id='esub', energy-sub/grant.ts) тает, как любой
    // подарок (владелец, 29.09): тот же вид energy_admin. В журнале энергии
    // её отличает ref «esub:<подарок>».
    const { error } = await sb.rpc("add_energy", {
      p_wallet: wallet,
      p_amount: amount,
      p_kind: "energy_admin",
      ...(gift.ref_id === "esub" ? { p_ref: `esub:${gift.id}` } : {}),
    });
    if (error) {
      await releaseDeliverOnce(ref);
      throw new Error(error.message);
    }
    return;
  }

  if (gift.kind === "tickets") {
    const { moveTickets } = await import("./tickets-ledger");
    await moveTickets({ wallet, delta: amount, kind: "admin_grant", ref });
    return;
  }

  if (gift.kind === "resource") {
    const res = (gift.ref_id ?? "").trim();
    if (!RESOURCES.has(res)) throw new Error("Неизвестный ресурс подарка");
    const { error } = await sb.rpc("res_move", {
      p_account: gift.account_id,
      p_resource: res,
      p_delta: amount,
      p_kind: "gift",
      p_ref: ref,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (gift.kind === "token") {
    const token = (gift.ref_id ?? "").trim();
    if (!token) throw new Error("У подарка не указан токен");
    const { accMove } = await import("./currency/move");
    await accMove({ wallet, token, delta: amount, kind: "acc_reward", ref });
    return;
  }

  if (gift.kind === "custom") {
    const { grantExtraReward } = await import("./raid-reward-extra");
    await grantExtraReward({ kind: "custom", wallet, amount, ref: gift.ref_id, opRef: ref });
    return;
  }

  if (gift.kind === "pack") {
    const packId = (gift.ref_id ?? "").trim();
    if (!packId) throw new Error("У подарка не указан пак");
    const { grantPackToUser } = await import("./packs");
    const { claimDeliverOnce, releaseDeliverOnce } = await import("./gifts-once");
    // Метка на КАЖДУЮ штуку: сотня паков выдаётся сотней отдельных вставок, и
    // падение на середине не имеет права начать всё сначала при новом клейме.
    const qty = Math.max(1, Math.floor(amount) || 1);
    for (let i = 0; i < qty; i++) {
      const op = `${ref}:p${i}`;
      if (!(await claimDeliverOnce(op, gift.id))) continue;
      try {
        await grantPackToUser({ wallet, packId, source: "admin_grant", sourceRef: op });
      } catch (e) {
        await releaseDeliverOnce(op);
        throw e;
      }
    }
    return;
  }

  // hero | art | item — предмет из справочника, кладём в инвентарь аккаунта.
  const templateId = (gift.ref_id ?? "").trim();
  if (!templateId) throw new Error("У подарка не указан предмет");
  const tpl = await pg.mysticItemTemplates.findOne({ id: templateId });
  if (!tpl) throw new Error("Предмет подарка не найден в справочнике");
  const account = await accountOf(wallet);
  const qty = Math.max(1, Math.floor(amount) || 1);
  const now = new Date().toISOString();
  const { claimDeliverOnce, releaseDeliverOnce } = await import("./gifts-once");
  // Одна метка на всю пачку: предметы уходят ОДНОЙ вставкой, значит либо все,
  // либо ни одного — делить по штукам нечего.
  if (!(await claimDeliverOnce(ref, gift.id))) return;
  const rows = Array.from({ length: qty }, () => ({
    id: `ugi_${nanoid(12)}`,
    account_id: account,
    wallet,
    template_id: templateId,
    kind: (tpl as { kind?: string }).kind ?? gift.kind,
    source: "gift",
    obtained_at: now,
  }));
  try {
    await pg.userGameItems.insert(rows);
  } catch (e) {
    await releaseDeliverOnce(ref);
    throw e;
  }
}
