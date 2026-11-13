// Оплата картой через Xsolla (владелец, 11.11.2026, ПРАВИЛА §8.127): только аккаунту,
// у которого единственный вход — Google; товары — пакеты золота и подписки. Сервер
// создаёт заказ и отдаёт адрес окна оплаты; выдаёт товар вебхук order_paid
// (xsollaWebhook.ts). Тестовый режим — только аккаунтам из settings.xsolla_test_accounts.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCurrentWallet, getSessionTgId } from "../../auth";
import { actionGate } from "../../rateGate";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { googleOnly } from "@/lib/auth/entryRules";
import { cardKind, payStationUrl, safeReturnPath, type CardKind } from "@/lib/xsollaCatalog";
import { cardOpenFor, xsollaConfig } from "./xsollaConfig";

const SITE = "https://service.yupland.io";

async function googleAccount(): Promise<{ wallet: string; account: string } | null> {
  const wallet = getCurrentWallet();
  if (!wallet || !googleOnly(getSessionTgId())) return null;
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(wallet);
  return account ? { wallet, account } : null;
}

/** Окнам: показывать ли «Оплатить картой». */
export const getCardPay = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = xsollaConfig();
  const me = cfg ? await googleAccount() : null;
  return { on: !!cfg && !!me && (await cardOpenFor(cfg, me.account)), sandbox: !!cfg?.sandbox };
});

/** Цена товара в $ из нашей витрины; товар закрыт — отказ до окна оплаты. */
async function itemUsd(
  kind: CardKind,
  sku: string,
  account: string,
  wallet: string,
): Promise<number> {
  if (kind === "gold") {
    const rows = (await mcpExec(
      `SELECT price_usd::text AS usd FROM yuplink.gold_shop_offer WHERE id = ${sqlStr(sku)} AND active`,
      { wrapJson: true },
    )) as Array<{ usd: string }>;
    const usd = Number(rows?.[0]?.usd);
    if (!(usd > 0)) throw new Error("card.badItem");
    return usd;
  }
  const { canUseSubs, loadTier } = await import("../energy-sub/tiers");
  if (!(await canUseSubs(wallet))) throw new Error("esub.unavailable");
  const tier = await loadTier(sku);
  if (!tier || !tier.active) throw new Error("esub.no_tier");
  const { tierLocks } = await import("../energy-sub/buy-sql");
  if ((await tierLocks(account))[tier.id]) throw new Error("esub.one_active");
  return tier.priceUsd;
}

const header = (name: string): string | null => {
  try {
    return getRequestHeader(name) ?? null;
  } catch {
    return null;
  }
};

export const startCardPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        sku: z.string().regex(/^[a-z0-9_]{3,40}$/),
        returnPath: z.string().max(130).optional(),
        lang: z.enum(["ru", "en"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const cfg = xsollaConfig();
    if (!cfg) throw new Error("card.off");
    const me = await googleAccount();
    if (!me) throw new Error("card.googleOnly");
    if (!(await cardOpenFor(cfg, me.account))) throw new Error("card.off");
    await actionGate("card-pay", me.wallet);
    const kind = cardKind(data.sku);
    if (!kind) throw new Error("card.badItem");
    const usd = await itemUsd(kind, data.sku, me.account, me.wallet);
    const { clientIp } = await import("../google-login/googleLogin");
    const { createPaymentToken } = await import("./xsollaToken");
    const pay = await createPaymentToken(cfg, {
      account: me.account,
      sku: data.sku,
      ip: clientIp(header("x-forwarded-for"), header("x-real-ip")),
      lang: data.lang ?? "ru",
      returnUrl: `${SITE}${safeReturnPath(data.returnPath)}`,
    });
    await mcpExec(
      `INSERT INTO yuplink.xsolla_order (order_id, account_id, sku, kind, usd, sandbox)
       VALUES (${pay.orderId}, ${sqlStr(me.account)}, ${sqlStr(data.sku)}, ${sqlStr(kind)}, ${usd.toFixed(2)}, ${cfg.sandbox})
       ON CONFLICT (order_id) DO NOTHING;`,
    ).catch((e) => console.warn("[xsolla] заказ не записался:", pay.orderId, e));
    console.log(
      `[xsolla] заказ ${pay.orderId} ${data.sku} ${me.account}${cfg.sandbox ? " (тест)" : ""}`,
    );
    return { url: payStationUrl(pay.token, cfg.sandbox) };
  });
