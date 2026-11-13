// Ввод промокода игроком (профиль → «Промокод»).
//
// Порядок: гейт подбора → аккаунт с Telegram (одна активация на аккаунт и на
// Telegram, как у кодов на лайки: второй аккаунт того же TG — «уже вводил»)
// → promo_redeem в базе (лок кода, бросок, резерв объёма, запись активации —
// migrations/promo-01) → выдача «куда надо» ключами от активации.
//
// Кода среди новых нет — отвечаем not_found, и профиль спрашивает коды на
// лайки (redeemLikePromocode): серверная ручка изнутри другой ручки не
// работает, поэтому этот шаг делает клиент.
//
// Повтор: активация закрыта (отмечена каждая строка) — тот же ключ нажатия
// получает ту же карточку без выдач, другой — «уже вводил». Не закрыта (сбой
// посреди выдачи) — повторный ввод доделывает недоставленное теми же ключами.
import { createServerFn } from "@tanstack/react-start";
import { getCurrentWallet } from "@/server/auth";
import { assertNotMaintenance } from "@/server/maintenance";
import { guessGate } from "@/server/rateGate";
import { mcpExec } from "@/server/db/mcpClient";
import { pg } from "@/server/db/pg";
import { accountIdOf } from "@/server/api/user-shared";
import { normalizePromoCode } from "@/lib/promo/promoCode";
import type { PromoRedeemResult } from "@/lib/promo/promoTypes";
import { redeemInput } from "./promo-input";
import { isMissingSchema, parseRedeem, redeemSql } from "./promo-sql";
import { deliverPromo, replayPromo } from "./promo-deliver";

export async function redeemPromoFor(
  wallet: string,
  input: { code: string; opId: string },
): Promise<PromoRedeemResult> {
  // Свой гейт, не «promocode» кодов на лайки: иначе один ввод старого кода
  // считался бы дважды (сюда и туда).
  await guessGate("promo", wallet);
  const code = normalizePromoCode(input.code);
  if (!code) return { status: "not_found" };
  const user = await pg.users.findOne({ wallet });
  if (!user?.telegram_id) throw new Error("promo.err_need_tg");
  const account = await accountIdOf(wallet);
  if (!account) throw new Error("promo.err_no_account");

  let rows: unknown;
  try {
    const op = `${account}:${input.opId}`;
    rows = await mcpExec(redeemSql({ code, account, wallet, op, tg: Number(user.telegram_id) }));
  } catch (e) {
    if (isMissingSchema(e)) return { status: "not_found" };
    throw e;
  }
  const res = parseRedeem(rows);
  if (!res) throw new Error("promo.err_failed");
  if ("error" in res) {
    if (res.error === "not_found") return { status: "not_found" };
    throw new Error(`promo.err_${res.error}`);
  }
  if (res.was && res.status === "done") {
    // Закрытая активация: тот же ключ нажатия — та же карточка без единой
    // выдачи (закрыта = отмечена каждая строка); другой — «уже вводил».
    if (!res.sameOp) throw new Error("promo.err_used");
    return { status: "ok", code: res.code || code, items: replayPromo(res.rolled, res.delivered) };
  }

  const items = await deliverPromo(
    { wallet, account, rid: res.id, delivered: res.delivered, resumed: res.was },
    res.rolled,
  );
  return { status: "ok", code: res.code || code, items };
}

export const redeemPromo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => redeemInput.parse(d))
  .handler(async ({ data }): Promise<PromoRedeemResult> => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("promo.err_no_wallet");
    assertNotMaintenance(wallet);
    return redeemPromoFor(wallet, data);
  });
