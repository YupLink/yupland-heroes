// Google к аккаунту Telegram или кошелька (владелец, 11.11.2026, ПРАВИЛА §8.127):
// «может подключить Google — и тогда, заходя через Google, на него не распространяются
// Google-ограничения; они только если вход у аккаунта ЕДИНСТВЕННЫЙ — Google».
//
// Привязка — из своей сессии (Telegram или кошелёк с подписью) в браузере: в Telegram
// WebView окно Google не открывается. Один Google — один аккаунт, у аккаунта — один
// Google. Google, у которого уже свой Google-аккаунт, не привязывается: два аккаунта
// не склеиваем (владелец, 12.11.2026: «не должно быть привязок и слития аккаунтов одного
// с другим — такое только через ТП»).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet, getSessionTgId } from "../../auth";
import { mcpExec } from "../../db/mcpClient";
import { pg } from "../../db/pg";
import { sqlStr } from "../raid-shared";
import { isGoogleOnlyTg } from "@/lib/auth/googleTg";
import { isWalletOnlySession } from "../../walletOnlySession";
import { googleAccountExists, readGoogleSettings } from "./googleStore";
import { verifyGoogleAccessToken } from "./verifyGoogleAccess";
import { consumeGoogleToken } from "./googleOnce";

/** Аккаунт, к которому привязан этот Google (архивный — его основной). */
async function linkedAccount(sub: string): Promise<{ account: string; tg: number } | null> {
  const rows = (await mcpExec(
    `SELECT a.id AS account, a.telegram_id::text AS tg
       FROM yuplink.account_google_link l
       JOIN yuplink.accounts x ON x.id = l.account_id
       JOIN yuplink.accounts a ON a.id = coalesce(x.archived_into, x.id)
      WHERE l.sub = ${sqlStr(sub)}`,
    { wrapJson: true },
  )) as Array<{ account: string; tg: string | null }>;
  const r = rows?.[0];
  const tg = Number(r?.tg);
  return r && Number.isSafeInteger(tg) && tg > 0 ? { account: r.account, tg } : null;
}

/** Вход привязанным Google: кошелёк сессии — как у входа через Telegram. */
export async function linkedSession(sub: string): Promise<{ wallet: string; tg: number } | null> {
  const acc = await linkedAccount(sub);
  if (!acc) return null;
  const rows = (await pg.users.findMany({ telegram_id: acc.tg })) as Array<{
    wallet: string;
    disconnected?: boolean | null;
  }>;
  const pool = rows.filter((r) => !r.disconnected);
  if (pool.length === 0) return null;
  const { preferredActiveWallet } = await import("../user-drops-hallway");
  const wallet = await preferredActiveWallet(
    acc.tg,
    pool.map((r) => r.wallet),
    pool[0].wallet,
  );
  return { wallet, tg: acc.tg };
}

/** Профиль: привязан ли Google к аккаунту сессии и можно ли привязать. */
export const getGoogleLink = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  const tg = getSessionTgId();
  if (!wallet || isGoogleOnlyTg(tg)) return { email: null, linked: false, clientId: null };
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(wallet);
  const rows = account
    ? ((await mcpExec(
        `SELECT coalesce(email, '') AS email FROM yuplink.account_google_link
          WHERE account_id = ${sqlStr(account)}`,
        { wrapJson: true },
      )) as Array<{ email: string }>)
    : [];
  const cfg = await readGoogleSettings();
  return {
    email: rows[0]?.email || null,
    linked: rows.length > 0,
    clientId: cfg.open ? cfg.clientId : null,
  };
});

export const linkGoogle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ accessToken: z.string().min(20).max(4096) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    const tg = getSessionTgId();
    if (!wallet || !tg) throw new Error("google.linkLogin");
    if (isGoogleOnlyTg(tg)) throw new Error("google.linkOwn");
    if (isWalletOnlySession()) throw new Error("walletLogin.needTelegram");
    const cfg = await readGoogleSettings();
    if (!cfg.clientId || !cfg.open) throw new Error("google.closed");
    const who = await verifyGoogleAccessToken(data.accessToken, cfg.clientId);
    if (!(await consumeGoogleToken(data.accessToken, who.exp))) throw new Error("google.badToken");
    if (await googleAccountExists(who.sub)) throw new Error("google.linkTaken");
    const { accAccountId } = await import("../currency/move");
    const account = await accAccountId(wallet);
    if (!account) throw new Error("google.linkLogin");
    const rows = (await mcpExec(
      `INSERT INTO yuplink.account_google_link (sub, account_id, email, linked_by)
       VALUES (${sqlStr(who.sub)}, ${sqlStr(account)}, ${who.email ? sqlStr(who.email) : "NULL"},
               ${sqlStr(wallet)})
       ON CONFLICT DO NOTHING
       RETURNING sub`,
      { wrapJsonCte: true },
    )) as Array<{ sub: string }>;
    if (!rows?.[0]) throw new Error("google.linkTaken");
    console.log(`[google-link] ${account} ← google`);
    return { ok: true as const, email: who.email };
  });
