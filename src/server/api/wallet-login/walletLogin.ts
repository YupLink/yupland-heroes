// Вход по NEAR-кошельку без Telegram (владелец, 06.11.2026: «1 — да», «новых
// кошельков = 100», «вести статистику и возможность мне проверить»).
//
// Только с подписью NEP-413 своего назначения (nep413-login.ts, purpose login):
// кошелёк доказан ключом FullAccess. Дальше:
//  · кошелёк привязан к аккаунту — вход в этот аккаунт, в том числе привязанный
//    без подписи до 18.10 (владелец, 06.11.2026: «если уже привязан куда-то — то
//    привязан и всё, открывается акк»; свободного вывода нет). Ключ доказан
//    подписью входа; implicit-адрес, живущий на блокчейне, — живым ключом;
//  · аккаунт ушёл в архив — кошелёк уже на основном (acc-archive-01), вход туда;
//  · старый кошелёк без Telegram (до 18.10) — свой номер (legacy);
//  · новый кошелёк — отказ: новый аккаунт только через Telegram (или Google), кошелька
//    при первом входе нет вовсе (владелец, 06.11.2026, перед Xsolla). Исключение —
//    ссылка игры «Корона гречневого королевства» (entry crown, 08.11): там новый
//    кошелёк получает свой аккаунт (walletLoginCrown.ts).
// Номер «не Telegram» (≥ 2^52): Bot API не зовётся, вывод наружу закрыт (google-01);
// привяжет настоящий Telegram — номер уступит (wallet-link, releaseWalletTg).
// Админские и платёжные кошельки и аккаунты админов — только через Telegram.
// Каждый вход — в журнал (устройство, слепок, адрес): /admin/wallet-login.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { pg } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import {
  isAdminWallet,
  isAdminWalletLinked,
  isPayoutsAdminWallet,
  isTreasuryWallet,
  setCurrentWallet,
} from "../../auth";
import { isAdminTg } from "../../adminTg";
import { isWalletTg } from "@/lib/auth/googleTg";
import { issueLoginChallenge, verifyConnectOwnership } from "../nep413-login";
import { claimWalletTg, logWalletLogin } from "./walletLoginStore";
import { createCrownAccount, openCrownWithdraw } from "./walletLoginCrown";

const header = (name: string): string | null => {
  try {
    return getRequestHeader(name) ?? null;
  } catch {
    return null; // вне запроса (тест) заголовков нет
  }
};

/** Метки в журнал — без управляющих символов (иначе запись падала бы, а вход проходил). */
export const clean = (v: string | null | undefined, max: number): string | null =>
  (v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max) || null;
const DEVICE_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const FP_RE = /^[0-9a-f]{64}$/;

async function requestIp(): Promise<string | null> {
  const { clientIp } = await import("../google-login/googleLogin");
  return clean(clientIp(header("x-forwarded-for"), header("x-real-ip")), 64);
}

// Вызовы входа с одного адреса — не больше 20 в минуту (сверх общего лимита).
const IP_MAX_PER_MIN = 20;
const perIp = new Map<string, { start: number; count: number }>();
function ipGate(ip: string | null): void {
  if (!ip) return;
  const now = Date.now();
  if (perIp.size > 5000) for (const [k, v] of perIp) if (now - v.start > 60_000) perIp.delete(k);
  const w = perIp.get(ip) ?? { start: now, count: 0 };
  if (now - w.start > 60_000) Object.assign(w, { start: now, count: 0 });
  w.count++;
  perIp.set(ip, w);
  if (w.count > IP_MAX_PER_MIN) throw new Error("Слишком много запросов — подожди минуту");
}

/** Вызов на подпись входа — без Telegram (свой лимит, отдельно от привязки). */
export const createWalletLoginChallenge = createServerFn({ method: "POST" }).handler(async () => {
  ipGate(await requestIp());
  return issueLoginChallenge("login");
});

type Kind = "tg" | "legacy" | "new";
type Device = { device: string | null; fp: string | null; ip: string | null };

async function storedKind(wallet: string): Promise<Kind> {
  const rows = (await mcpExec(
    `SELECT kind FROM yuplink.account_wallet_login WHERE wallet = ${sqlStr(wallet)}`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string }>;
  return rows?.[0]?.kind === "new" ? "new" : "legacy";
}

const ADMIN = "walletLogin.adminWallet";

/** Новый кошелёк со ссылки: доказательство ключа и устройство — для заведения аккаунта.
 *  crown — «Корона» (DARAI введённое + 10 %); near — домен near.service.yupland.io (§8.127, без вывода). */
type NewEntry = {
  proof: { implicit: boolean; publicKey: string };
  dev: Device;
  entry?: "crown" | "near";
};

/** Кто входит этим кошельком: номер и вид входа. Новый аккаунт — только со ссылки (crown / near). */
export async function resolveWalletLogin(
  wallet: string,
  link?: NewEntry,
): Promise<{ tg: number; kind: Kind; created: boolean }> {
  // Поблажки админу — только на ссылке «Короны»; домен near.service — как экран гостя.
  const crown = link && (link.entry ?? "crown") === "crown" ? link : undefined;
  // Админ, владелец «Выплат» и «Казны» (isTreasuryWallet = права на раздел, это и кош владельца).
  const admin =
    isAdminWallet(wallet) ||
    isPayoutsAdminWallet(wallet) ||
    isTreasuryWallet(wallet) ||
    (await isAdminWalletLinked(wallet));
  // Ссылка «Короны» (владелец 08.11: «почему не могу войти просто?»): админ входит
  // своим уже привязанным кошельком — подпись + живой ключ на блокчейне. Нового
  // аккаунта админскому кошельку не заводим; экран гостя игры — по-прежнему через Telegram.
  if (admin && !crown) throw new Error(ADMIN);
  const row = await pg.users.findOne({ wallet });
  if (admin && !row) throw new Error(ADMIN);
  if (row?.disconnected) throw new Error("walletLogin.unlinked");
  if (row) {
    let tg = row.telegram_id ? Number(row.telegram_id) : null;
    if (tg == null && row.account_id) {
      const acc = await pg.accounts.findOne({ id: row.account_id });
      tg = acc?.telegram_id ? Number(acc.telegram_id) : null;
    }
    if (tg != null) {
      if (isAdminTg(tg) && !crown) throw new Error(ADMIN);
      if (!row.telegram_id)
        await pg.users.update(
          { wallet },
          { telegram_id: tg, telegram_linked_at: new Date().toISOString() },
        );
      const kind: Kind = isWalletTg(tg) ? await storedKind(wallet) : "tg";
      // Кошелёк со ссылки «Короны»: правило вывода — на месте (сорвалось при заведении — дольём).
      if (kind === "new") await openCrownWithdraw(wallet);
      return { tg, kind, created: false };
    }
    const legacy = await claimWalletTg(wallet, "legacy", 0);
    if (legacy == null) throw new Error("walletLogin.failed");
    return { tg: legacy, kind: "legacy", created: false };
  }
  // Новый кошелёк: аккаунт заводится только через Telegram (владелец, 06.11.2026) —
  // или со ссылки «Короны гречневого королевства» (08.11.2026).
  // Домен near.service.yupland.io (владелец, 11.11.2026): новый кошелёк — свой аккаунт, вывода нет.
  if (link?.entry === "near") {
    const made = await createCrownAccount(wallet, link.proof, link.dev, "near");
    return { tg: made.tg, kind: "new", created: made.created };
  }
  if (!crown) throw new Error("walletLogin.newClosed");
  const made = await createCrownAccount(wallet, crown.proof, crown.dev);
  return { tg: made.tg, kind: "new", created: made.created };
}

export const loginWithWallet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        accountId: z
          .string()
          .min(2)
          .max(64)
          .regex(/^[a-z0-9_\-.]+$/i),
        publicKey: z.string().min(8).max(120),
        signature: z.string().min(8).max(200),
        nonce: z.string().min(8).max(120),
        device: z.string().max(256).optional(),
        fp: z.string().max(128).optional(),
        // Откуда вход: crown — ссылка игры, near — домен near.service.yupland.io (там новый
        // кошелёк получает аккаунт).
        entry: z.enum(["game", "crown", "near"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ip = await requestIp();
    ipGate(ip);
    const proof = await verifyConnectOwnership(
      {
        accountId: data.accountId,
        publicKey: data.publicKey,
        signature: data.signature,
        nonce: data.nonce,
      },
      { purpose: "login", onChain: "ifExists" },
    );
    const wallet = data.accountId.toLowerCase();
    const dev: Device = {
      device: data.device && DEVICE_RE.test(data.device) ? data.device : null,
      fp: data.fp && FP_RE.test(data.fp) ? data.fp : null,
      ip,
    };
    // Новый аккаунт по кошельку — только на домене near.service.yupland.io (§8.127).
    const { requestEntry } = await import("../../entryHost");
    const entry = data.entry === "near" && requestEntry() !== "near" ? undefined : data.entry;
    const link =
      entry === "crown" || entry === "near"
        ? { proof: { implicit: proof.implicit, publicKey: data.publicKey }, dev, entry }
        : undefined;
    const who = await resolveWalletLogin(wallet, link);
    const after = await pg.users.findOne({ wallet }).catch(() => null);
    // Журнал до сессии: не записалось — не входим (статистика владельца без дыр).
    await logWalletLogin({
      wallet,
      tgId: who.tg,
      accountId: after?.account_id ?? null,
      kind: who.kind,
      created: who.created,
      ...dev,
      ua: clean(header("user-agent"), 200),
    });
    // Кошелёк без подписи — сессия с меткой: вывод, новые кошельки и код входа закрыты.
    setCurrentWallet(wallet, who.tg, {
      walletOnly: who.kind === "tg" && !after?.ownership_verified,
    });
    console.log(`[walletLogin] ${who.kind}${who.created ? " NEW" : ""} wallet=${wallet}`);
    return { ok: true as const, wallet, created: who.created, kind: who.kind };
  });
