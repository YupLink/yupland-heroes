// Сторож курса DARAI (владелец, 04.11.2026: «да, делай сторож курса»).
//
// С 29.10 по 04.11 индексер Ref отдавал застывшую цену, и всё «за DARAI от $»
// (подписки, золото, наборы, энергия) шло на ~15 % дешевле — заметили по
// жалобе игроков. Теперь раз в 5 минут (часы авторассылок) сверяем и пишем
// админам в бот, если:
//  · два источника Ref — живой обмен и цена токена — расходятся больше 5 %;
//  · курс игры (тот, по которому считаются цены) ушёл от живого обмена больше 5 %;
//  · курс игры не менялся 6 часов — источник мог застыть;
//  · курса нет вовсе — цены за DARAI пропали из игры.
// Одна и та же тревога — не чаще раза в 6 часов на все воркеры (замок в settings).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { daraiPerUsd, feedUsd, routerUsd } from "./rate";

export const DRIFT = 0.05;
export const FROZEN_MS = 6 * 3600_000;
const REPEAT_MS = 6 * 3600_000;
const SEEN_KEY = "rate_watch:seen";
const ALERT_KEY = "rate_watch:alert:";

/** Курс игры и с какого момента он такой. */
export type Seen = { v: number; since: number };
/** Курсы — DARAI за $; null — источник не ответил. */
export type RateFacts = {
  router: number | null;
  feed: number | null;
  game: number | null;
  seen: Seen | null;
  now: number;
};
export type RateAlarm = { key: string; text: string };

/** Расхождение двух курсов — доля от меньшего. */
export const driftOf = (a: number, b: number): number => Math.abs(a - b) / Math.min(a, b);

const fmt = (n: number): string => Math.round(n).toLocaleString("ru-RU");
const pct = (d: number): string => `${Math.round(d * 100)} %`;

/** Тревоги по фактам. */
export function rateAlarms(f: RateFacts): RateAlarm[] {
  const out: RateAlarm[] = [];
  if (f.router && f.feed && driftOf(f.router, f.feed) > DRIFT) {
    out.push({
      key: "sources",
      text: `источники Ref расходятся на ${pct(driftOf(f.router, f.feed))}: обмен ${fmt(f.router)}, цена токена ${fmt(f.feed)} DARAI за $`,
    });
  }
  if (!f.game) {
    out.push({ key: "none", text: "курса нет больше 30 минут — цены за DARAI пропали из игры" });
    return out;
  }
  if (f.router && driftOf(f.game, f.router) > DRIFT) {
    out.push({
      key: "game",
      text: `курс игры ${fmt(f.game)} DARAI за $, на обмене ${fmt(f.router)} — цены за DARAI врут на ${pct(driftOf(f.game, f.router))}`,
    });
  }
  if (f.seen && f.seen.v === f.game && f.now - f.seen.since >= FROZEN_MS) {
    const hours = Math.floor((f.now - f.seen.since) / 3600_000);
    out.push({ key: "frozen", text: `курс игры не меняется ${hours} ч (${fmt(f.game)} DARAI за $) — источник мог застыть` });
  }
  return out;
}

/** Новое состояние «курс игры с момента»: число сменилось — отсчёт заново. */
export function nextSeen(prev: Seen | null, game: number | null, now: number): Seen | null {
  if (!game) return prev;
  return prev && prev.v === game ? prev : { v: game, since: now };
}

async function loadSeen(): Promise<Seen | null> {
  const rows = (await mcpExec(`SELECT value FROM yuplink.settings WHERE key = ${sqlStr(SEEN_KEY)} LIMIT 1;`, {
    wrapJson: true,
  })) as Array<{ value: string }> | null;
  try {
    const v = JSON.parse(rows?.[0]?.value ?? "null") as Seen | null;
    return v && v.v > 0 && Number.isFinite(v.since) ? v : null;
  } catch {
    return null;
  }
}

/** Взять право на тревогу: true — эта тревога не звучала 6 часов (один воркер из всех). */
async function claimAlarm(key: string, now: number): Promise<boolean> {
  const k = sqlStr(ALERT_KEY + key);
  const rows = (await mcpExec(
    `INSERT INTO yuplink.settings (key, value) VALUES (${k}, '${now}')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      WHERE yuplink.settings.value !~ '^[0-9]+$' OR yuplink.settings.value::bigint < ${now - REPEAT_MS}
     RETURNING key`,
    { wrapJsonCte: true },
  )) as Array<{ key: string }> | null;
  return (rows?.length ?? 0) > 0;
}

const perUsd = (usd: number | null): number | null => (usd ? 1 / usd : null);

/** Один проход сторожа. */
export async function watchRate(now = Date.now()): Promise<RateAlarm[]> {
  const [router, feed, game, seen] = await Promise.all([
    routerUsd().catch(() => null),
    feedUsd().catch(() => null),
    daraiPerUsd().catch(() => null),
    loadSeen(),
  ]);
  const facts: RateFacts = { router: perUsd(router), feed: perUsd(feed), game: game?.rate ?? null, seen, now };
  const next = nextSeen(seen, facts.game, now);
  if (next && next !== seen) {
    await mcpExec(
      `INSERT INTO yuplink.settings (key, value) VALUES (${sqlStr(SEEN_KEY)}, ${sqlStr(JSON.stringify(next))})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
    );
  }
  const alarms = rateAlarms(facts);
  const fired: RateAlarm[] = [];
  for (const a of alarms) if (await claimAlarm(a.key, now)) fired.push(a);
  if (fired.length) {
    const { sendTgMessageToAdmins } = await import("../../tg");
    const text = `⚠️ Курс DARAI:\n• ${fired.map((a) => a.text).join("\n• ")}\nОт курса считаются все цены за DARAI от $ (подписки, золото, наборы, энергия).`;
    await sendTgMessageToAdmins(text).catch(() => {});
  }
  return fired;
}
