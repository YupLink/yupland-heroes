// Анонс аукциона АДМИНА в Telegram (владелец, 14.10.2026): картинка приза
// и коротко — что это, (у артефакта) что даёт, стартовая цена, сколько идёт.
// 21.10 владелец: «коротко и внятно» — 4–5 строк, без длинных пояснений.
// Лоты игроков не анонсируются. Рассылка всем — только когда включена
// настройка ANNOUNCE_SETTING ('on'): сначала владелец смотрит тест (только ему).
// С 20.10 шлёт игровой бот @yupland_heroes_bot, кнопка ведёт в игру: кошельковый
// бот в игру больше не пускает. Дойдёт тем, кто запустил игрового бота.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { WEBAPP_URL } from "../../tg";
import { GAME_URL, gameBotSend, gameBotSendPhoto, type GameButton } from "../../tgGameBot";
import { AUCTION_LINK_PARAM } from "@/lib/auctionBus";
import { pg } from "../../db/pg";
import { currencyLabel } from "@/lib/auctionCurrency";
import { metaLabel } from "@/components/heroMeta";
import { rarityLabel } from "@/components/chips/auctions/auctionFormat";
import { resolvePrizeMeta, type PrizeInfo } from "./prize-meta";
import { teamOwnerTg } from "../../team";

/** yuplink.settings: 'on' — анонс новых лотов админа всем игрокам. */
export const ANNOUNCE_SETTING = "auction:announce";

const KIND: Record<string, string> = {
  box: "Бокс",
  pack: "Пак",
  hero: "Герой",
  artifact: "Артефакт",
  resource: "Ресурс",
};
/** Что даёт характеристика — коротко (по справочнику параметров, guideStats). */
const STAT_SHORT: Record<string, string> = {
  attack: "урон отряда",
  damage: "урон отряда",
  strength: "урон отряда",
  health: "здоровье фишек",
  hp: "здоровье фишек",
  armor: "шанс промаха врага",
  luck: "шанс доп. урона",
  speed: "шаг дешевле по энергии",
  intellect: "энергия и заклинания",
  trade: "ячейки рюкзака",
  alchemy: "ячейки сумки зелий",
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

/** Артефакт: «Артефакт · Легендарный · Карманы», «+10 Броня — шанс промаха врага»,
 *  «Бонус: Ассасин +10, Кабан +10», «Иммунитет: Оглушение». */
function artifactLines(info: PrizeInfo): string[] {
  const out: string[] = [];
  const head = [rarityLabel(info.rarity, false), info.slot ? metaLabel(info.slot, "ru") : null]
    .filter(Boolean)
    .join(" · ");
  out.push(`Артефакт${head ? ` · ${esc(head)}` : ""}`);
  if (info.statType) {
    const what = STAT_SHORT[info.statType.trim().toLowerCase()];
    out.push(
      `<b>+${info.statAmount ?? 0} ${esc(metaLabel(info.statType, "ru"))}</b>${what ? ` — ${what}` : ""}`,
    );
    const bonus = (
      [
        [info.spec, info.specAmount],
        [info.race, info.raceAmount],
        [info.land, info.landAmount],
      ] as Array<[string | null | undefined, number | null | undefined]>
    )
      .filter(([v]) => v)
      .map(([v, n]) => `${esc(metaLabel(v!, "ru"))} +${n ?? 0}`);
    if (bonus.length) out.push(`Бонус: ${bonus.join(", ")}`);
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
  const lines = [`🔨 <b>Аукцион: ${esc(name)}</b>`];
  if (lot.prize_kind === "artifact" && meta?.info) lines.push(...artifactLines(meta.info));
  else if (lot.prize_kind === "hero" && meta?.info) {
    const i = meta.info;
    // «Уровень» шаблона героя — это его звёзды, поэтому пишем редкость.
    lines.push(
      `Герой · ${esc([rarityLabel(i.rarity, false), i.race, i.spec].filter(Boolean).join(" · "))}`,
    );
  } else lines.push(KIND[lot.prize_kind] ?? lot.prize_kind);
  const price = `${Number(lot.start_price).toLocaleString("ru-RU")} ${esc(currencyLabel(lot.currency, false))}`;
  const lots = (lot.series_total ?? 1) > 1 ? ` · лотов <b>${lot.series_total}</b>` : "";
  lines.push(
    "",
    `💰 Старт <b>${price}</b> · ⏳ <b>${duration(lot.start_at, lot.end_at)}</b>${lots}`,
  );
  const img = meta?.image ?? null;
  const photo = img
    ? img.startsWith("http")
      ? img
      : `${WEBAPP_URL}${img.startsWith("/") ? "" : "/"}${img}`
    : null;
  return { photo, caption: lines.join("\n") };
}

const button: GameButton = {
  // Сразу в окно аукционов (AuctionOverlay ловит метку в адресе).
  inline_keyboard: [
    [{ text: "🔨 К аукциону", web_app: { url: `${GAME_URL}?${AUCTION_LINK_PARAM}=1` } }],
  ],
};

/** Одному получателю: фото с подписью, не вышло — текстом. */
async function sendOne(
  chatId: number,
  a: { photo: string | null; caption: string },
): Promise<boolean> {
  if (a.photo && (await gameBotSendPhoto(chatId, a.photo, a.caption, button))) return true;
  return gameBotSend(chatId, a.caption, button);
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
  // Тест — только владельцу (TG id из env, server/team); не задан — не шлём.
  const testTg = teamOwnerTg();
  if (testTg == null) return { sent: false, id };
  return { sent: await sendOne(testTg, await buildAnnounce(lot)), id };
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
    let ok = !!photo && (await gameBotSendPhoto(chatId, photo, a.caption, button));
    if (!ok) {
      ok = await gameBotSend(chatId, a.caption, button);
      if (ok && photo) photo = null;
    }
    if (ok) sent++;
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`[auction] анонс ${auctionId}: ${sent}/${ids.length}`);
}
