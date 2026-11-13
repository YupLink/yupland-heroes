// «Продажа рыбы»: рыба, что была у игрока до журнала (аудит 14.10.2026). Улов
// (строки 'fish'/take) журнал пишет с 12.10.2026 08:24 UTC, урожай в личные
// ячейки ('field'/take) — с 12:21, а рыбалка и грядки работали и раньше. Такая
// рыба на счёте была, а штучный учёт её не знал: продажа старого запаса
// уходила «сверх журнала» (pieceFlow: rest — для рыбы не своё) и очков не
// давала, хотя она своя — поймана или выращена (своё — когда бы ни пришло,
// владелец 14.10.2026). Сваренная в зелье, та же рыба засчитывалась.
//
// Поэтому на миг STOCK_AT подтяжка «Продажи рыбы» кладёт на счёт игрока
// недостающее своим уловом — строкой 'fish'/take (flowAct: улов на счёт).
// Сколько — посчитано один раз (14.10.2026 ~17:20 UTC, только чтение) и
// заморожено, чтобы гонка «рюкзак уже изменился, строки журнала ещё нет» не
// сдвигала очки, которые пишутся раз:
//   реальный запас на STOCK_AT = рюкзаки + личные ячейки склада сейчас минус
//   всё, что журнал провёл через счёт после STOCK_AT;
//   недостающее = реальный запас − что знал учёт на STOCK_AT (с отсечкой нуля).
// После STOCK_AT журнал с инвентарём сходится (провалов ниже нуля нет). Чужая
// рыба так не попадёт: подарков рыбы от игроков, кроме аукциона (он учтён —
// tour-own-auction.ts), нет. Сверх журнала после STOCK_AT по-прежнему не своё.
// Только «Продажа рыбы»: у «Зелий скорости» сверх журнала и так своё.
import type { Hist } from "@/server/api/tournament/tour-profit";

/** Миг, на который досчитан запас: с него улов и урожай на счёт журнал пишет. */
export const STOCK_AT = Date.UTC(2026, 9, 12, 12, 30);

/**
 * Аккаунт, вид рыбы (имя канона), сколько штук недоставало учёту на STOCK_AT.
 * Данные игроков в коде не держим (открытие кода, 11.11.2026): список лежит в
 * базе — settings 'tour_fish_stock' (JSON [[аккаунт, вид, штук], …]), тот же,
 * что был здесь константой. Читается раз в 10 минут.
 */
type StockRow = readonly [string, string, number];
let cache: { at: number; rows: StockRow[] } | null = null;

export async function loadFishStock(): Promise<ReadonlyArray<StockRow>> {
  if (cache && Date.now() - cache.at < 600_000) return cache.rows;
  const { mcpExec } = await import("@/server/db/mcpClient");
  const got = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = 'tour_fish_stock' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: string }> | null;
  let raw: unknown = [];
  try {
    raw = JSON.parse(got?.[0]?.value ?? "[]");
  } catch {
    raw = [];
  }
  const rows = (Array.isArray(raw) ? raw : []).filter(
    (r): r is StockRow =>
      Array.isArray(r) &&
      typeof r[0] === "string" &&
      typeof r[1] === "string" &&
      Number.isInteger(r[2]),
  );
  cache = { at: Date.now(), rows };
  return rows;
}

/** Строки «своё на счёте до журнала» для товаров items (ключи журнала), если STOCK_AT < till. */
export async function stockHist(items: ReadonlySet<string>, till: number): Promise<Hist[]> {
  if (!(STOCK_AT < till)) return [];
  const out: Hist[] = [];
  for (const [account, name, qty] of await loadFishStock()) {
    const key = `custom:name:${name}`;
    if (!items.has(key) || !(qty > 0)) continue;
    out.push({
      id: `stock:${account}:${name}`,
      account_id: account,
      item_key: key,
      at_ms: STOCK_AT,
      source: "fish",
      side: "take",
      qty,
      total: 0,
      price_cur: null,
      place: null,
      counterparty: null,
      ref: null,
    });
  }
  return out;
}
