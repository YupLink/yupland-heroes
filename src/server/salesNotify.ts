// Письмо админам о каждой покупке подписки и лицензии банка (владелец
// 04.11.2026, §8.111): «кто угодно и какую угодно… стоимость и какую именно…
// если звёзды — тоже пиши». Шлёт служебный бот @yuplink_bot (как выплаты и
// алерты). Получатели — админы из ADMIN_TG_IDS (владелец и Ярослав). Кто купил
// (ник в Telegram, кошелёк) — ТОЛЬКО владельцу («только мне такое»); остальным
// — что купили и почём. В фоне: покупка письма не ждёт и от его сбоя не падает.
import { mcpExec } from "./db/mcpClient";
import { sqlStr } from "./api/raid-shared";

export type Sale = {
  what: "sub" | "license";
  /** Тариф или ступень: «Стандарт», «Малая». */
  title: string;
  days: number;
  /** Сколько списано и чем: Darai, USDT, STARS, diamonds. */
  amount: number;
  currency: string;
  /** Цена в долларах (тариф подписки, таблица лицензии); нет — null. */
  usd: number | null;
  /** Строка-пояснение: у лицензии — сколько золота в сутки. */
  note?: string;
  account: string;
  wallet: string;
};

export type Buyer = { username: string | null; telegramId: number | null };

const esc = (s: string): string =>
  s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

const num = (n: number): string =>
  n
    .toLocaleString("ru-RU", { maximumFractionDigits: n < 10 ? 2 : 0 })
    .replace(/[\u00a0\u202f]/g, " ");

const UNIT: Record<string, string> = {
  Darai: "DARAI",
  USDT: "USDT",
  STARS: "звёзд ⭐",
  diamonds: "алмазов 💎",
};

/** Текст письма; buyer — только в письме владельцу. */
export function saleText(s: Sale, buyer?: Buyer | null): string {
  const head =
    s.what === "sub"
      ? `🧾 Подписка «${esc(s.title)}» · ${s.days} дн.`
      : `🏦 Лицензия банка «${esc(s.title)}» · ${s.days} дн.`;
  const usd = s.usd != null && s.usd > 0 ? ` (≈ $${num(s.usd)})` : "";
  const lines = [head, `💰 ${num(s.amount)} ${UNIT[s.currency] ?? esc(s.currency)}${usd}`];
  if (s.note) lines.push(esc(s.note));
  if (buyer !== undefined) {
    const nick = buyer?.username ? `@${esc(buyer.username)}` : "без ника";
    const tg = buyer?.telegramId ? ` · TG ${buyer.telegramId}` : "";
    lines.push(`👤 ${nick}${tg} · ${esc(s.wallet)}`);
  }
  return lines.join("\n");
}

const ids = (raw: string | undefined): number[] =>
  (raw ?? "")
    .split(/[\s,]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);

/** Telegram владельца: OWNER_TG_ID, иначе по кошельку из PAYOUTS_ADMIN_WALLETS. */
async function ownerTg(): Promise<number | null> {
  const env = ids(process.env.OWNER_TG_ID)[0];
  if (env) return env;
  const wallets = (process.env.PAYOUTS_ADMIN_WALLETS ?? "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
  if (wallets.length === 0) return null;
  const rows = (await mcpExec(
    `SELECT telegram_id FROM yuplink.users
      WHERE wallet IN (${wallets.map((w) => sqlStr(w)).join(",")}) AND telegram_id IS NOT NULL
      ORDER BY telegram_id LIMIT 1`,
    { wrapJson: true },
  )) as Array<{ telegram_id: number | string }> | null;
  const id = Number(rows?.[0]?.telegram_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Ник и Telegram покупателя: по кошельку, иначе по аккаунту. */
export const buyerSql = (wallet: string, account: string): string =>
  `SELECT u.telegram_username, COALESCE(u.telegram_id, a.telegram_id) AS telegram_id
     FROM yuplink.accounts a
     LEFT JOIN yuplink.users u ON u.account_id = a.id
    WHERE a.id = ${sqlStr(account)}
    ORDER BY (u.wallet = ${sqlStr(wallet)}) DESC NULLS LAST, (u.telegram_username IS NULL)
    LIMIT 1`;

async function buyerOf(s: Sale): Promise<Buyer> {
  const rows = (await mcpExec(buyerSql(s.wallet, s.account), { wrapJson: true }).catch(
    () => null,
  )) as Array<{ telegram_username: string | null; telegram_id: number | string | null }> | null;
  const r = rows?.[0];
  const tg = Number(r?.telegram_id);
  return {
    username: r?.telegram_username?.trim() || null,
    telegramId: Number.isSafeInteger(tg) && tg > 0 ? tg : null,
  };
}

/** Кому писать админские письма: ADMIN_TG_IDS и владелец. */
export async function adminChats(): Promise<{ to: number[]; owner: number | null }> {
  const owner = await ownerTg().catch(() => null);
  return { to: [...new Set([...ids(process.env.ADMIN_TG_IDS), ...(owner ? [owner] : [])])], owner };
}

/** Разослать админам; не бросает. */
export async function notifySale(s: Sale): Promise<void> {
  try {
    const { to, owner } = await adminChats();
    if (to.length === 0) return console.warn("[sales] некому писать: нет ADMIN_TG_IDS");
    const { tgSendMessage } = await import("./tg");
    const base = saleText(s);
    const full = owner ? saleText(s, await buyerOf(s)) : base;
    for (const id of to) {
      await tgSendMessage(id, id === owner ? full : base, { replyMarkup: null });
    }
  } catch (e) {
    console.warn("[sales] письмо:", e instanceof Error ? e.message : e);
  }
}
