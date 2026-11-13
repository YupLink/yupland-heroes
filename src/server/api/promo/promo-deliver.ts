// Выдача выпавшего «куда надо» (владелец, 29.10.2026): не в «Добычу», а сразу
// на место — счёт, рюкзак героя, инвентарь. «Добыча» — только когда героя или
// места в рюкзаке нет, по её обычным правилам (promo-harvest).
//
// Кто куда:
//   • токен, ресурс, лайки, энергия — на счёт; боксы, герои, артефакты — в
//     инвентарь: тем же deliverGift, что подарок админа (его ключи повтора —
//     like_grant_log, леджеры, gift_deliver_op, у пака — на каждую штуку);
//   • свой товар и босс — стопкой в рюкзак выбранного героя (stack-deposit),
//     нет героя или места — в «Добычу».
// Любой другой сбой — строка НЕ доставлена (pending): активация остаётся
// открытой, и повторный ввод кода доделывает её ТЕМИ ЖЕ ключами. В «Добычу»
// сбой не уводим: выданное до сбоя (пак за паком, или стопка, чей ответ
// потерялся) легло бы второй раз под другим ключом.
//
// Ключ строки — `promo:<активация>:<номер>`. Куда легла строка, отмечаем в
// активации сразу после выдачи; отметка не легла — заход падает, активация не
// закрывается, повтор найдёт выданное по тем же ключам.
import { mcpExec } from "@/server/db/mcpClient";
import type { PromoGot, PromoWhere } from "@/lib/promo/promoTypes";
import { doneSql, markSql, type RolledLine } from "./promo-sql";
import { harvestHas, queuePromoHarvest } from "./promo-harvest";

export type DeliverCtx = {
  wallet: string;
  account: string;
  /** id активации (promo_redemption). */
  rid: string;
  /** Уже отмеченное прошлыми заходами: idx строкой → куда легло. */
  delivered: Record<string, PromoWhere>;
  /** Заход не первый: строка могла лечь в «Добычу», не успев отметиться. */
  resumed: boolean;
};

const BALANCE: ReadonlySet<string> = new Set(["token", "resource", "likes", "energy"]);

export const lineKey = (rid: string, idx: number): string => `promo:${rid}:${idx}`;

const why = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Стопка (товар, босс): в рюкзак; нет героя или места — в «Добычу»; сбой — pending. */
async function deliverStack(ctx: DeliverCtx, line: RolledLine, key: string): Promise<PromoWhere> {
  // Прошлый заход положил строку в «Добычу», но не отметил — она там.
  if (ctx.resumed && (await harvestHas(key))) return "harvest";
  try {
    const { depositRefStack } = await import("@/server/api/beta-raid/stack-deposit");
    // Ключ проверяется первым: повтор уже положенной стопки — «уже в рюкзаке».
    await depositRefStack({
      wallet: ctx.wallet,
      account: ctx.account,
      kind: line.kind === "boss" ? "boss" : "custom",
      ref: line.ref,
      qty: line.amount,
      nonce: key,
    });
    return "backpack";
  } catch (e) {
    const { isSoftGrantError } = await import("@/server/api/raid-claim-run");
    if (!isSoftGrantError(e)) {
      console.warn("[promo] стопка не легла — ждёт повторного ввода:", key, why(e));
      return "pending";
    }
  }
  try {
    await queuePromoHarvest({ wallet: ctx.wallet, account: ctx.account, line, key });
    return "harvest";
  } catch (e) {
    console.error("[promo] строка не легла и в «Добычу»:", key, why(e));
    return "pending";
  }
}

/** Выдать одну строку; ответ — куда легла (pending — не доставлена). */
async function deliverLine(ctx: DeliverCtx, line: RolledLine): Promise<PromoWhere> {
  const key = lineKey(ctx.rid, line.idx);
  if (line.kind === "custom" || line.kind === "boss") return deliverStack(ctx, line, key);
  // «Ничего» в выпавшее не попадает (promo_redeem, promo-02); строка из чужих рук — не выдаём.
  if (line.kind === "nothing") return "balance";
  try {
    const { deliverGift } = await import("@/server/api/gifts-deliver");
    // Строка кода глазами подарка: id — от активации и номера строки, отсюда
    // ключи повтора подарка (`gift:promo_<активация>_<номер>`, у пака — `:p<i>`).
    await deliverGift(ctx.wallet, {
      id: `promo_${ctx.rid}_${line.idx}`,
      account_id: ctx.account,
      kind: line.kind,
      amount: line.amount,
      ref_id: line.ref,
      title: line.title,
      image: line.image,
      note: null,
      status: "claimed",
      created_at: new Date().toISOString(),
      expires_ms: null,
    });
    return BALANCE.has(line.kind) ? "balance" : "inventory";
  } catch (e) {
    console.warn("[promo] выдача не прошла — ждёт повторного ввода:", key, why(e));
    return "pending";
  }
}

const gotOf = (line: RolledLine, where: PromoWhere): PromoGot => ({
  kind: line.kind,
  ref: line.ref,
  name: line.title,
  image: line.image,
  amount: line.amount,
  where,
});

/** Закрытая активация: карточка по отметкам, без единой выдачи. */
export const replayPromo = (rolled: RolledLine[], delivered: Record<string, PromoWhere>) =>
  rolled.map((l) => gotOf(l, delivered[String(l.idx)] ?? "pending"));

/**
 * Выдать всё выпавшее и вернуть карточку для игрока. Отмеченное прошлыми
 * заходами не трогаем. Активация закрывается, только когда отмечена КАЖДАЯ
 * строка; отметка не легла — бросок (повтор доделает теми же ключами).
 */
export async function deliverPromo(ctx: DeliverCtx, rolled: RolledLine[]): Promise<PromoGot[]> {
  const out: PromoGot[] = [];
  let open = false;
  for (const line of rolled) {
    let where = ctx.delivered[String(line.idx)];
    if (!where) {
      where = await deliverLine(ctx, line);
      if (where === "pending") open = true;
      else await mcpExec(markSql(ctx.rid, line.idx, where));
    }
    out.push(gotOf(line, where));
  }
  if (!open) await mcpExec(doneSql(ctx.rid));
  return out;
}
