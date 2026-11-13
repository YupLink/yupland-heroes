// Подтяжка штучного учёта своего — турнир рыбаков (владелец, 12.10.2026):
// «Продажа рыбы» (fish_sell) и «Зелья скорости» (potion_drink). Правило —
// lib/tournament/pieceFlow.ts; окно, история и очки — общие с «Золотом»
// (tour-profit.ts): от прошлой отметки (с перекрытием) до min(сейчас, конец).
// Своё — когда бы ни пришло, и до старта (владелец, 14.10.2026: «да,
// засчитывай все»), поэтому история — вся; очко — только событие после
// оплаченной записи (не раньше старта): моменты записи грузятся здесь же.
//
// Какие товары:
//  • рыба — всё, что ловилось удочкой (строки журнала source 'fish', их пишет
//    выдача улова — fishing-note): виды рыбы из настройки рыбалки на момент
//    поимки попадают в список сами, а «рыба» маркета, которую не ловят, — нет;
//  • зелья — список турнира (tournament.items); пусто — все зелья со скоростью
//    в бусте. Ключ товара — по имени канона, как у маркета и рюкзака.
// У рыбы — плюс товары, которыми за неё платили в маркете (lib/tournament/
// pieceLink.ts): рыба, купленная с платой товаром, — обмен (в «только в плюс»
// не идёт). У зелий сваренное самим — своё, из чьих бы рыбы и вёдер ни сварено
// (владелец, 14.10.2026), — чем платили, не грузим. Очки — только у товаров
// категории (столбец hit).
// Историю товара (у всех игроков и хранилищ) грузим, только если в окне есть
// событие категории — продажа или «выпил»: без него очков быть не может.
// Залог и выигрыш аукционного дома журнал не пишет — их строки дописывает
// tour-own-auction.ts (ревью 14.10.2026: зелье твина через аукцион было своим).
// До журнала (аудит 14.10.2026): выпитое до 12.10 дописывает из бустов героя
// tour-own-predrink.ts, рыбу на счёте до 12.10 — tour-own-stock.ts.
// Очки: 'fsale:<id сделки>', 'drink:<id строки «выпил»>' — повтор подтяжки
// то же событие второй раз не засчитает. Записан ли игрок и с какого момента —
// ещё раз проверяет scoreSql (через pointsSql), как у всех категорий.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { marketKeysCanon } from "@/server/api/beta-raid/econ/canon-key";
import { FISH_SALE_RULE, POTION_DRINK_RULE, type PieceRule } from "@/lib/tournament/pieceFlow";
import { linkedPieces } from "@/lib/tournament/pieceLink";
import type { TourMetric } from "@/lib/tournament/types";
import {
  HIST_COLS,
  flowsByItem,
  loadTourWindow,
  pointsSql,
  type Hist,
  type JournalPoint,
  type TourWindow,
} from "@/server/api/tournament/tour-profit";
import { POTION_PICK_SQL } from "@/server/api/tournament/tour-rows";
import { auctionHist } from "@/server/api/tournament/tour-own-auction";
import { preDrinkHist } from "@/server/api/tournament/tour-own-predrink";
import { stockHist } from "@/server/api/tournament/tour-own-stock";

export type OwnMetric = "fish_sell" | "potion_drink";

export const isOwnMetric = (m: TourMetric): m is OwnMetric =>
  m === "fish_sell" || m === "potion_drink";

/** Правило, событие-очко (сторона строки журнала) и префикс ключа очка. */
export const OWN_METRIC: Record<OwnMetric, { rule: PieceRule; side: "sell" | "use"; ref: string }> =
  {
    fish_sell: { rule: FISH_SALE_RULE, side: "sell", ref: "fsale" },
    potion_drink: { rule: POTION_DRINK_RULE, side: "use", ref: "drink" },
  };

const ts = (ms: number): string => `to_timestamp(${ms} / 1000.0)`;

/** Виды рыбы: всё, что ловилось удочкой. */
export const FISH_KEYS_SQL = `SELECT f.item_key FROM yuplink.trade_journal f WHERE f.source = 'fish'`;

/** Зелья турнира: id и имя своих товаров (список турнира или все со скоростью). */
export function potionsSql(id: string): string {
  return `SELECT ci.id, ci.name
  FROM yuplink.tournament t
  JOIN yuplink.raid_custom_item ci ON ${POTION_PICK_SQL}
 WHERE t.id = ${sqlStr(id)}`;
}

/** Оплаченные записи турнира: аккаунт и момент записи, мс. */
export const joinedSql = (id: string): string =>
  `SELECT e.account_id, extract(epoch from e.joined_at) * 1000 AS joined_ms
  FROM yuplink.tournament_entry e
 WHERE e.tournament_id = ${sqlStr(id)} AND e.paid AND e.joined_at IS NOT NULL`;

async function loadJoined(id: string): Promise<Map<string, number>> {
  const rows = ((await mcpExec(joinedSql(id), { wrapJson: true })) ?? []) as Array<{
    account_id: string;
    joined_ms: number | string;
  }>;
  return new Map(rows.map((r) => [String(r.account_id), Number(r.joined_ms)]));
}

/** Зелья турнира: id шаблона → ключ по имени канона (как пишут журнал маркет и «выпил»). */
async function potionKeys(id: string): Promise<Map<string, string>> {
  const rows = ((await mcpExec(potionsSql(id), { wrapJson: true })) ?? []) as Array<{
    id: string;
    name: string | null;
  }>;
  const keys = await marketKeysCanon(
    rows.map((r) => ({
      id: String(r.id),
      kind: "custom",
      refId: String(r.id),
      name: String(r.name ?? ""),
      giveToken: null,
    })),
  );
  const out = new Map<string, string>();
  rows.forEach((r, i) => {
    const k = keys[i];
    if (k) out.set(String(r.id), k);
  });
  return out;
}

/** Строка истории; hit — товар категории (его события — очки), а не только плата за него. */
export type OwnHist = Hist & { hit?: boolean | null };

/**
 * Вся история товаров keys (список ключей или подзапрос), у которых в окне
 * есть строка со стороной side (продажа или «выпил»), и (paid) товаров,
 * которыми за них платили в маркете (строки «заплатил» '<ref покупки>:pay<i>:<k>').
 */
export function ownHistorySql(
  keys: string | readonly string[],
  side: "sell" | "use",
  since: number,
  till: number,
  paid = true,
): string {
  const list = typeof keys === "string" ? keys : keys.map(sqlStr).join(", ");
  const payItems = paid
    ? `
  UNION
  SELECT p.item_key FROM yuplink.trade_journal p
   WHERE p.source = 'market' AND p.side = 'pay' AND p.at < ${ts(till)}
     AND EXISTS (SELECT 1 FROM yuplink.trade_journal b JOIN hit h ON h.item_key = b.item_key
                  WHERE b.source = 'market' AND b.side = 'buy'
                    AND b.ref = regexp_replace(p.ref, ':pay[0-9]+:[0-9]+$', ''))`
    : "";
  return `WITH hit AS (
  SELECT DISTINCT e.item_key FROM yuplink.trade_journal e
   WHERE e.side = '${side}' AND e.at >= ${ts(since)} AND e.at < ${ts(till)}
     AND e.item_key IN (${list})
),
items AS (
  SELECT item_key FROM hit${payItems}
)
SELECT ${HIST_COLS}, j.item_key IN (SELECT item_key FROM hit) AS hit
  FROM yuplink.trade_journal j
  JOIN items i ON i.item_key = j.item_key
 WHERE j.at < ${ts(till)}`;
}

/** Очки категории по истории товаров: события — только у товаров категории (hit). */
export function ownPoints(
  metric: OwnMetric,
  rows: readonly OwnHist[],
  w: TourWindow & { joined: ReadonlyMap<string, number> },
): JournalPoint[] {
  const own = OWN_METRIC[metric];
  const byItem = flowsByItem(rows);
  const hit = new Set(rows.filter((r) => r.hit === true).map((r) => r.item_key));
  const lists = [...hit].map((k) => byItem.get(k) ?? []).filter((l) => l.length > 0);
  const points = linkedPieces(lists, byItem.values(), { ...w, rule: own.rule });
  return points.map((p) => ({
    ref: `${own.ref}:${p.id}`,
    account: p.account,
    qty: p.qty,
    at: p.at,
  }));
}

/** Подтянуть продажу своей рыбы или выпитые свои зелья в окне турнира. */
export async function syncOwnPieces(id: string, metric: OwnMetric): Promise<void> {
  const w = await loadTourWindow(id);
  if (!w || !(w.till > w.since)) return;
  const potions = metric === "potion_drink" ? await potionKeys(id) : null;
  let points: JournalPoint[] = [];
  if (!potions || potions.size > 0) {
    const side = OWN_METRIC[metric].side;
    const keys = potions ? [...new Set(potions.values())] : FISH_KEYS_SQL;
    const sql = ownHistorySql(keys, side, w.since, w.till, !potions);
    const rows = ((await mcpExec(sql, { wrapJson: true })) ?? []) as OwnHist[];
    if (rows.length > 0) {
      const joined = await loadJoined(id);
      const items = new Set(rows.map((r) => r.item_key));
      const lots = await auctionHist(w.till, items);
      const pre = potions ? await preDrinkHist(potions) : await stockHist(items, w.till);
      points = ownPoints(metric, [...rows, ...lots, ...pre], { ...w, joined });
    }
  }
  await mcpExec(pointsSql(id, w.till, points));
}
