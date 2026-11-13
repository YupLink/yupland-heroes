// Демо-остров (владелец, 05.11.2026: «для Кайлани пробный демо остров — чтобы он
// не был никуда прикреплён, заход и выход через профиль… доступ только у неё…
// полный режим бога с её полноценными механиками»).
//
// Карта — обычный остров isle_… (как новый остров: генератор или образец), но
// строка своя, raid_demo_island, а не raid_island. Поэтому обучение, подарок
// первого сундука, «Сумка острова», выход порталом и «Новый остров» его не
// касаются. Порталов в него нет ни из одного мира (карта не active, в сеть
// порталов не входит), а порталы на нём никуда не ведут (world-portals-net:
// выход — только у своего острова новичка). Вход и выход — строкой профиля
// (demo-island-api). Режим бога там такой же, как на своём острове
// (island-editor-auth: ownsIsland), денег нет (god-money: isMoneyFreeMap).
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { ISLAND_PREFIX } from "@/lib/raid/island/ids";
import { generateIsland } from "@/lib/raid/island/generate";
import { islandFromMaster } from "@/lib/raid/island/master";
import { parsePlaces, type IslandPlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { islandBase } from "./island-base";
import { islandMapSql } from "./island-write";
import { loadMaster, masterMapId } from "./island-master";
import { activeTemplates } from "./town-template-store";
import { mainWorldStart, moveAcross, positionOf, type MapCell } from "./island-move";

const SEED_MAX = 2_000_000_000;

export type DemoIsland = { mapId: string | null; places: IslandPlaces; back: MapCell | null };
type LiveDemo = DemoIsland & { mapId: string };

export async function loadDemoIsland(account: string): Promise<DemoIsland | null> {
  const rows = (await mcpExec(
    `SELECT map_id, places, back_map, back_q, back_r FROM yuplink.raid_demo_island
      WHERE account_id = ${sqlStr(account)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  const r = rows?.[0];
  if (!r) return null;
  const places = parsePlaces(typeof r.places === "string" ? JSON.parse(r.places) : r.places);
  if (!places) return null;
  const backMap = typeof r.back_map === "string" && r.back_map ? r.back_map : null;
  return {
    mapId: typeof r.map_id === "string" && r.map_id ? r.map_id : null,
    places,
    back:
      backMap && r.back_q != null && r.back_r != null
        ? { mapId: backMap, q: Number(r.back_q), r: Number(r.back_r) }
        : null,
  };
}

/** Строка демо-острова: первая или взамен снесённой карты; живую не трогает. */
export function demoRowSql(o: {
  account: string;
  mapId: string;
  seed: number;
  places: IslandPlaces;
  by: string;
}): string {
  return `INSERT INTO yuplink.raid_demo_island (account_id, map_id, seed, places, created_by)
    VALUES (${sqlStr(o.account)}, ${sqlStr(o.mapId)}, ${o.seed},
            ${sqlStr(JSON.stringify(o.places))}::jsonb, ${sqlStr(o.by)})
    ON CONFLICT (account_id) DO UPDATE
      SET map_id = EXCLUDED.map_id, seed = EXCLUDED.seed, places = EXCLUDED.places,
          created_by = EXCLUDED.created_by, created_at = now(),
          back_map = NULL, back_q = NULL, back_r = NULL
      WHERE yuplink.raid_demo_island.map_id IS NULL;`;
}

/** Новый демо-остров: как остров новичка, но без подарка и обучения. */
async function createDemoIsland(account: string, by: string): Promise<LiveDemo> {
  const base = await islandBase();
  const seed = 1 + Math.floor(Math.random() * SEED_MAX);
  const templates = await activeTemplates().catch(() => []);
  const masterId = await masterMapId().catch(() => null);
  const master = masterId ? await loadMaster(masterId).catch(() => null) : null;
  const prizes = { gift: false };
  const island = master
    ? islandFromMaster(master, seed, prizes)
    : generateIsland(base.spec, base.catalog, seed, prizes, templates);
  const mapId = `${ISLAND_PREFIX}${nanoid(10)}`;
  const statements = [
    ...islandMapSql({
      mapId,
      name: "Демо-остров",
      account,
      seed,
      island,
      by,
      copyShopsFrom: master?.mapId,
    }),
    demoRowSql({ account, mapId, seed, places: island.places, by }),
  ];
  const { dropIsland } = await import("./island-create");
  try {
    for (const s of statements) await mcpExec(s, { wrapJson: false });
  } catch (e) {
    await dropIsland(mapId).catch(() => {});
    throw e;
  }
  const row = await loadDemoIsland(account);
  if (row?.mapId === mapId) return { ...row, mapId };
  // Строку занял демо-остров, созданный одновременно с этим, — наш лишний.
  await dropIsland(mapId).catch(() => {});
  if (row?.mapId) return { ...row, mapId: row.mapId };
  throw new Error("island.create_failed");
}

/** Демо-остров аккаунта: есть — он, нет (или карту снесли) — новый. */
export async function ensureDemoIsland(account: string, by: string): Promise<LiveDemo> {
  const had = await loadDemoIsland(account);
  return had?.mapId ? { ...had, mapId: had.mapId } : createDemoIsland(account, by);
}

async function saveDemoBack(account: string, at: MapCell): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_demo_island
        SET back_map = ${sqlStr(at.mapId)}, back_q = ${Math.trunc(at.q)}, back_r = ${Math.trunc(at.r)}
      WHERE account_id = ${sqlStr(account)};`,
  );
}

/** Куда можно вернуть: открытый мир, главная карта или остров (острова не active). */
export async function mapExists(mapId: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.raid_maps m
      WHERE m.id = ${sqlStr(mapId)}
        AND (m.active OR left(m.id, ${ISLAND_PREFIX.length}) = ${sqlStr(ISLAND_PREFIX)}
             OR m.id = (SELECT (s.value::jsonb)->>'mapId' FROM yuplink.settings s
                         WHERE s.key = 'beta_raid_map'))
      LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

export type DemoMove = { map: string; at: Cell };

/** На демо-остров (нет — создать); откуда пришла — запоминаем. */
export async function enterDemoIsland(wallet: string, account: string): Promise<DemoMove> {
  const row = await ensureDemoIsland(account, wallet);
  const here = await positionOf(account);
  if (here?.mapId === row.mapId) return { map: row.mapId, at: { q: here.q, r: here.r } };
  if (here) await saveDemoBack(account, here);
  const { ensureIslandHero } = await import("./island-hero");
  await ensureIslandHero(wallet, account);
  const spawn: MapCell = { mapId: row.mapId, ...row.places.spawn };
  if (!(await moveAcross(wallet, here?.mapId ?? null, spawn)))
    throw new Error("island.move_failed");
  return { map: row.mapId, at: row.places.spawn };
}

/** С демо-острова — туда, откуда пришла (карты нет — к замку основного мира). */
export async function leaveDemoIsland(wallet: string, account: string): Promise<DemoMove | null> {
  const row = await loadDemoIsland(account);
  const here = await positionOf(account);
  if (!row?.mapId || here?.mapId !== row.mapId) return null;
  const to = row.back && (await mapExists(row.back.mapId)) ? row.back : await mainWorldStart();
  if (!(await moveAcross(wallet, row.mapId, to))) throw new Error("island.move_failed");
  return { map: to.mapId, at: { q: to.q, r: to.r } };
}

/**
 * Откуда пришла на остров новичка: с демо-острова — туда, откуда пришла на демо
 * (иначе выход с острова и выход с демо ведут друг в друга по кругу).
 */
export async function backPastDemo(
  account: string,
  here: MapCell,
  islandMapId: string,
): Promise<MapCell> {
  const demo = await loadDemoIsland(account).catch(() => null);
  if (!demo?.mapId || here.mapId !== demo.mapId) return here;
  if (demo.back && demo.back.mapId !== islandMapId) return demo.back;
  return mainWorldStart();
}

/** Стоит ли сейчас на своём демо-острове. */
export async function onDemoIsland(account: string): Promise<boolean> {
  const [row, here] = await Promise.all([loadDemoIsland(account), positionOf(account)]);
  return !!row?.mapId && here?.mapId === row.mapId;
}
