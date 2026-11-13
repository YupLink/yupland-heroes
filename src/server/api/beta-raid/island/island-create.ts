// Создать и снести остров игрока. Запись — по шагам, как у генератора миров:
// сбой посередине сносит недописанный остров целиком.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { ISLAND_PREFIX } from "@/lib/raid/island/ids";
import { generateIsland, type IslandPrizes } from "@/lib/raid/island/generate";
import { islandFromMaster, type MasterIsland } from "@/lib/raid/island/master";
import { loadMaster, masterMapId } from "./island-master";
import { ISLAND_BUILDINGS, ISLAND_OBJECTS } from "@/lib/raid/island/catalog";
import { fitShortLesson, masterPillar, sailCells } from "@/lib/raid/island/shortLessonFit";
import { pickShortYard } from "@/lib/raid/island/shortYard";
import { sqlStr } from "@/server/api/raid-shared";
import { liveRewardSql } from "@/server/api/raid-reward-live";
import { islandBase } from "./island-base";
import { dropIslandSql, dropMapSql, islandSql } from "./island-write";
import { loadIsland, type LiveIslandRow } from "./island-row";
import { claimIslandMines } from "./island-mine-claim";
import { isKeptMap } from "./island-keep";
import { isIslandTutorialPilot } from "@/server/islandTester";
import { getSessionTgId } from "@/server/auth";
import { activeTemplates } from "./town-template-store";
import { islandSpellPlan } from "./island-spell-plan";

const SEED_MAX = 2_000_000_000;

/**
 * Подарок острова в первом сундуке — раз на аккаунт (владелец, 17.10.2026:
 * «чтобы не было ферм»; 20.10: «всё, что дарится, — в первом сундуке»).
 * Получал: открыл первый сундук прежнего острова (строки «Добычи» с него) или
 * взял подарок прежним путём — через «Подарки» (до 20.10).
 */
async function giftLeft(account: string): Promise<IslandPrizes> {
  const acc = sqlStr(account);
  const chest = sqlStr(ISLAND_OBJECTS.chest.replace(/^chest:/, ""));
  const rows = (await mcpExec(
    `SELECT
       (EXISTS (SELECT 1 FROM yuplink.raid_reward
                 WHERE account_id = ${acc} AND boss_id = ${chest}
                   AND left(location_id, ${ISLAND_PREFIX.length}) = ${sqlStr(ISLAND_PREFIX)}
                   AND reward_kind IN ('likes', 'energy', 'resource', 'pack') AND ${liveRewardSql()})
        OR EXISTS (SELECT 1 FROM yuplink.player_gift
                    WHERE source_ref LIKE ${sqlStr(`island:gift:${account}:%`)}
                      AND source_ref <> ${sqlStr(`island:gift:${account}:hero`)})) AS got;`,
    { wrapJson: true },
  )) as Array<{ got: boolean }>;
  return { gift: rows?.[0]?.got !== true };
}

/** Образец, если включён и читается; сбой — null (остров строит генератор). */
async function masterIsland(): Promise<MasterIsland | null> {
  const id = await masterMapId().catch(() => null);
  return id ? await loadMaster(id).catch(() => null) : null;
}

export async function createIsland(account: string, by: string): Promise<LiveIslandRow> {
  const base = await islandBase();
  const seed = 1 + Math.floor(Math.random() * SEED_MAX);
  // Города — по шаблонам Ангелины, если есть включённые (сбой чтения — выращенные).
  const templates = await activeTemplates().catch(() => []);
  // Короткое обучение: пилот Кай — всегда, остальным — выключателем island_short (11.11).
  const { islandSwitchOn, ISLAND_SHORT_KEY } = await import("./island-newbie");
  const short = isIslandTutorialPilot(getSessionTgId()) || (await islandSwitchOn(ISLAND_SHORT_KEY));
  // Остров-образец включён (settings.island_master) — копия образца, иначе генератор.
  const master = await masterIsland();
  // Столб урока: у копии — столб самого образца (её заклинание и цена), иначе — из мира.
  const pillar = !short
    ? undefined
    : (master && masterPillar(master.cells, master.places.lesson?.pillar)) || (await islandSpellPlan(base.catalog));
  const prizes = { ...(await giftLeft(account)), short, pillar };
  const island = master
    ? islandFromMaster(master, seed, prizes)
    : generateIsland(base.spec, base.catalog, seed, prizes, templates);
  // Озеро урока на образце перерисовано — цель переправы по нынешней воде (shortLessonFit).
  if (master && island.places.lesson) {
    const water = base.spec.water.shallow;
    island.places.lesson = fitShortLesson(island.cells, island.places.lesson, (t) => t === water, ISLAND_BUILDINGS.shipyard);
    // Верфь шага «лодка» — до которой дойти пешком и от которой доплыть (shortYard).
    const yard = pickShortYard(island.cells, island.places.spawn, base.spec.water, ISLAND_BUILDINGS.shipyard, sailCells(island.places.lesson));
    if (yard) island.places.shipyard = yard;
  }
  const mapId = `${ISLAND_PREFIX}${nanoid(10)}`;
  const statements = islandSql({
    mapId,
    name: `Остров ${island.townName}`,
    account,
    seed,
    island,
    by,
    copyShopsFrom: master?.mapId,
    // Админ на острове тестирует, а доходы мира у него идут — потолки только «новичкам».
    capped: !(await import("@/server/auth")).isAdminWallet(by),
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
  // Сохранённый остров (raid_map_keep) не сносится никогда — ни шахты, ни уборка.
  if (await isKeptMap(mapId)) return;
  // Выход порталом и «Новый остров»: добыча шахт — хозяевам, пока клетки целы.
  await claimIslandMines(mapId).catch((e) =>
    console.warn("[island] шахты:", mapId, e instanceof Error ? e.message : e),
  );
  await mcpExec(dropMapSql(mapId), { wrapJson: false });
  for (const s of dropIslandSql(mapId)) {
    await mcpExec(s, { wrapJson: false }).catch((e) =>
      console.warn("[island] drop:", mapId, e instanceof Error ? e.message : e),
    );
  }
}
