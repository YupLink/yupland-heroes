// Честная статистика коллекции: всё считается по факту, а не по счётчикам
// chip_collections.in_game_count / burned_count — они годами не обновлялись
// (у «Retro figurine» показывали 28 и 0 при 952 фишках на руках и 3975
// сожжённых).
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

export type CollectionStats = {
  /** Номеров тиража занято (только 1..тираж). */
  occupied: number;
  /** Свободных номеров тиража — столько фишек ещё может выпасть. */
  free: number;
  /** На руках у игроков (owned + выставленные на маркет). */
  inGame: number;
  /** Сожжено в крафте и при выводе в NFT. */
  burned: number;
  /** Сейчас лежит NFT на чейне (в игру не возвращена). */
  onChain: number;
  /** Номера за пределами тиража — след старого бага выдачи. */
  aboveTirage: number;
};

export async function getCollectionStats(
  collectionIds: string[],
): Promise<Map<string, CollectionStats>> {
  const out = new Map<string, CollectionStats>();
  if (collectionIds.length === 0) return out;
  const ids = collectionIds.map(sqlStr).join(",");

  const rows = (await mcpExec(
    `SELECT c.id,
            count(u.*) FILTER (WHERE u.serial_no BETWEEN 1 AND c.initial_supply) AS occupied,
            count(u.*) FILTER (WHERE u.serial_no > c.initial_supply) AS above_tirage,
            count(u.*) FILTER (WHERE u.status IN ('owned','listed')) AS in_game,
            count(u.*) FILTER (WHERE u.status = 'burned') AS burned,
            c.initial_supply AS supply
       FROM yuplink.chip_collections c
       LEFT JOIN yuplink.user_chip_inventory u ON u.collection_id = c.id
      WHERE c.id IN (${ids})
      GROUP BY c.id, c.initial_supply;`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    occupied: number;
    above_tirage: number;
    in_game: number;
    burned: number;
    supply: number;
  }>;

  const mints = (await mcpExec(
    `SELECT collection_id, count(*)::int AS on_chain
       FROM yuplink.chip_nft_mints
      WHERE collection_id IN (${ids}) AND returned_at IS NULL
      GROUP BY collection_id;`,
    { wrapJson: true },
  )) as Array<{ collection_id: string; on_chain: number }>;
  const onChainBy = new Map((mints ?? []).map((m) => [m.collection_id, Number(m.on_chain)]));

  for (const r of rows ?? []) {
    const occupied = Number(r.occupied);
    out.set(r.id, {
      occupied,
      free: Math.max(0, Number(r.supply) - occupied),
      inGame: Number(r.in_game),
      burned: Number(r.burned),
      onChain: onChainBy.get(r.id) ?? 0,
      aboveTirage: Number(r.above_tirage),
    });
  }
  return out;
}
