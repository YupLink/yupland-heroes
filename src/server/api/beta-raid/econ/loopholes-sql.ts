// SQL двух эвристик лазеек, которые считаются в базе: общие полки склада и
// перерасход энергии. Арбитраж и «одни награды» собираются из уже готовых
// цепочек и дельт — им своего SQL не нужно.
import type { EconRange } from "@/lib/econ/types";
import { rangeSql } from "./range";

export type ShelfRow = {
  account_id: string;
  item_name: string;
  took: number | string;
  put: number | string;
};

export type EnergyRow = {
  account_id: string;
  spend: number | string;
  regen: number | string;
  bought: number | string;
  /** Награды игры: боссы, дропы, мистические паки, шахты, возвраты. */
  rewards: number | string;
  gifted: number | string;
};

/** Взял с общей полки / положил на неё — по игроку и товару. Журнал пишет
 *  полку без цены: wh_take/take и wh_put|field/put (перелив с поля на общий
 *  склад — тоже put, см. noteShelf в trade-hooks.ts). */
export function shelfTakerSql(range: EconRange): string {
  const put = `(side = 'put' AND source IN ('wh_put', 'field'))`;
  return `SELECT account_id, item_name,
            COALESCE(sum(qty) FILTER (WHERE source = 'wh_take'), 0) AS took,
            COALESCE(sum(qty) FILTER (WHERE ${put}), 0) AS put
       FROM yuplink.trade_journal
      WHERE ${rangeSql("at", range)} AND (source = 'wh_take' OR ${put})
      GROUP BY 1, 2;`;
}

/** Энергия за окно: подарки против регена, покупок и наград игры. Порог по
 *  подаркам отсекается ещё в базе — иначе строка на каждого, кто хоть раз шагнул. */
export function energyOutlierSql(range: EconRange, minGifted: number): string {
  const bought = `'energy_pack', 'energy_market', 'energy_add', 'energy_like'`;
  const gifted = `'energy_admin', 'energy_gift', 'energy_owner', 'admin_grant', 'energy_grant',
                  'energy_compensation', 'energy_tester'`;
  const rewards = `'energy_reward', 'energy_drop', 'energy_mystic', 'energy_boss', 'mine',
                   'energy_refund', 'mine_refund', 'energy_decay_refund'`;
  // Энергия подписки начисляется видом подарка (тает так же), но куплена:
  // её отличает ref 'esub:' — в «купленное», а не в подарки.
  const sub = `COALESCE(ref, '') LIKE 'esub:%'`;
  const giftedSum = `COALESCE(sum(delta) FILTER (WHERE kind IN (${gifted}) AND NOT ${sub}), 0)`;
  return `SELECT account_id,
            COALESCE(-sum(delta) FILTER (WHERE kind = 'energy_spend'), 0) AS spend,
            COALESCE(sum(delta) FILTER (WHERE kind = 'energy_regen'), 0) AS regen,
            COALESCE(sum(delta) FILTER (WHERE kind IN (${bought}) OR ${sub}), 0) AS bought,
            COALESCE(sum(delta) FILTER (WHERE kind IN (${rewards})), 0) AS rewards,
            ${giftedSum} AS gifted
       FROM yuplink.currency_ledger
      WHERE token = 'Energy' AND ${rangeSql("created_at", range)}
      GROUP BY 1
     HAVING ${giftedSum} > ${Math.max(0, Math.floor(minGifted))};`;
}
