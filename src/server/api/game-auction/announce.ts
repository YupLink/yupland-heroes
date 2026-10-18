// Анонс аукциона АДМИНА в Telegram-боте (владелец, 14.10.2026): картинка приза
// и коротко — что это, (у артефакта) что даёт, стартовая цена, сколько идёт.
// Лоты игроков не анонсируются. Рассылка всем — только когда включена
// настройка ANNOUNCE_SETTING ('on'): сначала владелец смотрит тест (только ему).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { WEBAPP_URL, tgSendMessage, tgSendPhoto } from "../../tg";
import { pg } from "../../db/pg";
import { currencyLabel } from "@/lib/auctionCurrency";
import { STATS_SECTION } from "@/components/params-guide/data/guideStats";
import { metaLabel } from "@/components/heroMeta";
import { rarityLabel } from "@/components/chips/auctions/auctionFormat";
import { resolvePrizeMeta, type PrizeInfo } from "./prize-meta";

/** Владелец (owner.example.tg) — получатель тестового анонса. */
export const ANNOUNCE_TEST_TG = 100000001;
/** yuplink.settings: 'on' — анонс новых лотов админа всем игрокам. */
export const ANNOUNCE_SETTING = "auction:announce";

const KIND: Record<string, string> = {
  box: "Бокс",
  pack: "Пак",
  hero: "Герой",
  artifact: "Артефакт",
  resource: "Ресурс",
};
const GUIDE_ID: Record<string, string> = {
  attack: "atk",
  damage: "atk",
  strength: "atk",
  health: "hp",
  hp: "hp",
  armor: "arm",
  luck: "luck",
  speed: "spd",
  intellect: "int",
  trade: "trade",
  alchemy: "alchemy",
};

type Lot = {
  id: string;
  title: string | null;
  prize_kind: string;
  prize_ref: string;
  prize_qty: number;
  currency: string;
  start_price: number;
  start_at: string;
  end_at: string;
  series_total: number | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** «12 ч», «1 день», «3 дня», «7 дней». */
function duration(startAt: string, endAt: string): string {
  const h = Math.round((Date.parse(endAt) - Date.parse(startAt)) / 3_600_000);
  if (h < 24) return `${Math.max(1, h)} ч`;
  const d = Math.round(h / 24);
  const one = d % 10 === 1 && d % 100 !== 11;
  const few = d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 12 || d % 100 > 14);
  return `${d} ${one ? "день" : few ? "дня" : "дней"}`;
}

/** Первая фраза справочника «что делает характеристика». */
function statWhat(statType: string | null): string | null {
  const id = GUIDE_ID[(statType ?? "").trim().toLowerCase()];
  const text = STATS_SECTION.entries.find((e) => e.id === id)?.what[0];
  return text ? (text.match(/^[^.]*\./)?.[0] ?? text) : null;
}

function artifactLines(info: PrizeInfo): string[] {
  const out: string[] = [];
  const head = [rarityLabel(info.rarity, false), info.slot ? metaLabel(info.slot, "ru") : null]
    .filter(Boolean)
    .join(" · ");
  if (head) out.push(`Артефакт · ${esc(head)}`);
  if (info.statType) {
    const stat = metaLabel(info.statType, "ru");
    out.push(`✨ <b>+${info.statAmount ?? 0} ${esc(stat)}</b>`);
    const what = statWhat(info.statType);
    if (what) out.push(`<i>${esc(what)}</i>`);
    const extra: Array<[string, string | null | undefined, number | null | undefined]> = [
      ["Класс", info.spec, info.specAmount],
      ["Раса", info.race, info.raceAmount],
      ["Земля", info.land, info.landAmount],
    ];
    for (const [t, v, n] of extra) {
      if (v) out.push(`${t} ${esc(metaLabel(v, "ru"))}: +${n ?? 0} ${esc(stat)}`);
    }
  }
  if (info.immunities?.length) {
    out.push(`Иммунитет: ${esc(info.immunities.map((i) => metaLabel(i, "ru")).join(", "))}`);
  }
  return out;
}

/** Картинка и подпись анонса (HTML для Telegram). */
export async function buildAnnounce(lot: Lot): Promise<{ photo: string | null; caption: string }> {
  const meta = (await resolvePrizeMeta([lot]).catch(() => new Map())).get(lot.prize_ref);
  const name = `${meta?.name || lot.title || lot.prize_ref}${lot.prize_qty > 1 ? ` ×${Number(lot.prize_qty).toLocaleString("ru-RU")}` : ""}`;
  const lines = [`🔨 <b>Аукцион открыт!</b>`, "", `<b>${esc(name)}</b>`];
  if (lot.prize_kind === "artifact" && meta?.info) lines.push(...artifactLines(meta.info));
  else if (lot.prize_kind === "hero" && meta?.info) {
    const i = meta.info;
    // «Уровень» шаблона героя — это его звёзды, поэтому пишем редкость.
    lines.push(
      `Герой · ${esc([rarityLabel(i.rarity, false), i.race, i.spec].filter(Boolean).join(" · "))}`,
    );
  } else lines.push(KIND[lot.prize_kind] ?? lot.prize_kind);
  lines.push("");
  lines.push(
    `💰 Старт: <b>${Number(lot.start_price).toLocaleString("ru-RU")} ${esc(currencyLabel(lot.currency, false))}</b>`,
  );
  lines.push(`⏳ Идёт: <b>${duration(lot.start_at, lot.end_at)}</b>`);
  if ((lot.series_total ?? 1) > 1) lines.push(`📦 Лотов: <b>${lot.series_total}</b>`);
  const img = meta?.image ?? null;
  const photo = img
    ? img.startsWith("http")
      ? img
      : `${WEBAPP_URL}${img.startsWith("/") ? "" : "/"}${img}`
    : null;
  return { photo, caption: lines.join("\n") };
}

const button = {
  inline_keyboard: [[{ text: "🔨 К аукциону", web_app: { url: WEBAPP_URL } }]],
};

/** Одному получателю: фото с подписью, не вышло — текстом. */
async function sendOne(
  chatId: number,
  a: { photo: string | null; caption: string },
): Promise<boolean> {
  if (a.photo && (await tgSendPhoto(chatId, a.photo, a.caption, { replyMarkup: button })))
    return true;
  return tgSendMessage(chatId, a.caption, { replyMarkup: button });
}

async function loadLot(auctionId: string): Promise<Lot | null> {
  const rows = (await mcpExec(
    `SELECT id, title, prize_kind, prize_ref, prize_qty, currency, start_price, start_at, end_at,
            series_total
       FROM yuplink.auction WHERE id = ${sqlStr(auctionId)} AND source = 'game';`,
    { wrapJson: true },
  )) as Lot[];
  return rows?.[0] ?? null;
}

/** Тест: последний живой лот админа (или указанный) — только владельцу. */
export async function announceTest(
  auctionId?: string | null,
): Promise<{ sent: boolean; id: string | null }> {
  const id =
    auctionId ||
    (
      (await mcpExec(
        `SELECT id FROM yuplink.auction WHERE source = 'game' AND status = 'live'
        ORDER BY created_at DESC LIMIT 1;`,
        { wrapJson: true },
      )) as Array<{ id: string }>
    )?.[0]?.id;
  if (!id) return { sent: false, id: null };
  const lot = await loadLot(id);
  if (!lot) return { sent: false, id };
  return { sent: await sendOne(ANNOUNCE_TEST_TG, await buildAnnounce(lot)), id };
}

/** Новый лот админа — всем с уведомлениями, если рассылка включена. Фоном. */
export async function announceNewLot(auctionId: string): Promise<void> {
  const on = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(ANNOUNCE_SETTING)};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: string }>;
  if (on?.[0]?.value !== "on") return;
  const lot = await loadLot(auctionId);
  if (!lot) return;
  const a = await buildAnnounce(lot);
  const users = await pg.users.findMany({ notifications_enabled: true });
  const ids = [
    ...new Set(users.map((u) => u.telegram_id).filter((t): t is number => typeof t === "number")),
  ];
  let sent = 0;
  // Картинку Telegram не взял, а текст прошёл — дальше шлём текстом, без двойных запросов.
  let photo = a.photo;
  for (const chatId of ids) {
    let ok = !!photo && (await tgSendPhoto(chatId, photo, a.caption, { replyMarkup: button }));
    if (!ok) {
      ok = await tgSendMessage(chatId, a.caption, { replyMarkup: button });
      if (ok && photo) photo = null;
    }
    if (ok) sent++;
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`[auction] анонс ${auctionId}: ${sent}/${ids.length}`);
}
