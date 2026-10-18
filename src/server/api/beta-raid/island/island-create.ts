// Создать и снести остров игрока. Запись — по шагам, как у генератора миров:
// сбой посередине сносит недописанный остров целиком.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { ISLAND_PREFIX } from "@/lib/raid/island/ids";
import { generateIsland, type IslandPrizes } from "@/lib/raid/island/generate";
import { ISLAND_ARTIFACT, ISLAND_TRAINING_PACK } from "@/lib/raid/island/catalog";
import { sqlStr } from "@/server/api/raid-shared";
import { liveRewardSql } from "@/server/api/raid-reward-live";
import { islandBase } from "./island-base";
import { dropIslandSql, dropMapSql, islandSql } from "./island-write";
import { loadIsland, type LiveIslandRow } from "./island-row";

const SEED_MAX = 2_000_000_000;

/**
 * Подарочные артефакт и пак — один раз на аккаунт (владелец, 17.10.2026:
 * «только по одному экземпляру — чтобы не было ферм»): получал с прошлого
 * острова (в «Добыче» или уже забрал) — новому острову призов не кладём.
 */
async function prizesLeft(account: string): Promise<IslandPrizes> {
  const acc = sqlStr(account);
  const art = sqlStr(ISLAND_ARTIFACT);
  const pack = sqlStr(ISLAND_TRAINING_PACK);
  const rows = (await mcpExec(
    `SELECT
       (EXISTS (SELECT 1 FROM yuplink.user_game_item WHERE account_id = ${acc} AND template_id = ${art})
        OR EXISTS (SELECT 1 FROM yuplink.raid_reward WHERE account_id = ${acc}
                    AND reward_kind = 'item' AND pack_id = ${art} AND ${liveRewardSql()})) AS art,
       (EXISTS (SELECT 1 FROM yuplink.chip_pack_grants WHERE account_id = ${acc} AND chip_pack_id = ${pack})
        OR EXISTS (SELECT 1 FROM yuplink.raid_reward WHERE account_id = ${acc}
                    AND reward_kind = 'pack' AND pack_id = ${pack} AND ${liveRewardSql()})) AS pack;`,
    { wrapJson: true },
  )) as Array<{ art: boolean; pack: boolean }>;
  const r = rows?.[0];
  return { artifact: r?.art !== true, pack: r?.pack !== true };
}

export async function createIsland(account: string, by: string): Promise<LiveIslandRow> {
  const base = await islandBase();
  const seed = 1 + Math.floor(Math.random() * SEED_MAX);
  const island = generateIsland(base.spec, base.catalog, seed, await prizesLeft(account));
  const mapId = `${ISLAND_PREFIX}${nanoid(10)}`;
  const statements = islandSql({
    mapId,
    name: `Остров ${island.townName}`,
    account,
    seed,
    island,
    by,
  });
  try {
    for (const s of statements) await mcpExec(s, { wrapJson: false });
  } catch (e) {
    await dropIsland(mapId).catch(() => {});
    throw e;
  }
  const row = await loadIsland(account);
  if (row?.mapId === mapId) return { ...row, mapId };
  // Строку занял остров, созданный одновременно с этим, — наш лишний.
  await dropIsland(mapId).catch(() => {});
  if (row?.mapId) return { ...row, mapId: row.mapId };
  throw new Error("island.create_failed");
}

/** Снести остров (игрок с него уже ушёл): карта — обязательно, уборка — по возможности. */
export async function dropIsland(mapId: string): Promise<void> {
  await mcpExec(dropMapSql(mapId), { wrapJson: false });
  for (const s of dropIslandSql(mapId)) {
    await mcpExec(s, { wrapJson: false }).catch((e) =>
      console.warn("[island] drop:", mapId, e instanceof Error ? e.message : e),
    );
  }
}
