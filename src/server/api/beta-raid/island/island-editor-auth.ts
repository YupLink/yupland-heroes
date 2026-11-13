// Кто правит карту в режиме бога (владелец, 31.10.2026: дать дизайнеру возможность
// нарисовать город поверх острова новичка — с её возможностями).
//
// Админ — любую карту, где стоит (как раньше, god-map). Дизайнер замка
// (isCastleEditor) — ТОЛЬКО свой остров новичка, где стоит сейчас,
// и только местность, дороги, декор, городские постройки и блоки: ни объектов
// (мобов с наградами), ни настроек (цены, награды), ни купола, ни шахт, полей и
// порталов. Стереть объект или постройку можно, поставить объект — нет
// (designerPatch вычищает).
// Право god_map (admin-rights, владелец 04.11.2026) — те же ограничения, но на
// любой карте, где стоит; в живом мире ещё и объекты, шахты, поля и порталы
// игроков не трогаются (liveMapPatch).
import { getCurrentWallet, isAdminWallet, isCastleEditor } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { walletHasRight } from "@/server/admin-rights";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { creatorCanEdit } from "@/server/api/creator/creator-access";
import { myMapId } from "../encounter-where";
import type { AdminCellPatch } from "../admin-cell-patch";

/** ownIsland — свой остров новичка: там дизайнеру можно снимать объекты и любые постройки.
 *  money — можно ли трогать деньги (только настоящему админу). */
export type GodMap = { mapId: string; admin: boolean; ownIsland?: boolean; money?: boolean };

async function tgUsernameOf(wallet: string): Promise<string | null> {
  const { pg } = await import("@/server/db/pg");
  const u = await pg.users.findOne({ wallet }).catch(() => null);
  return u?.telegram_username ?? null;
}

/** Остров принадлежит аккаунту этого кошелька: остров новичка или свой демо-остров
 *  (demo-island, 05.11.2026 — режим бога там тот же, что на своём острове). */
async function ownsIsland(wallet: string, mapId: string): Promise<boolean> {
  const { accountOf } = await import("@/server/api/user-shared");
  const account = await accountOf(wallet).catch(() => null);
  if (!account) return false;
  const m = sqlStr(mapId),
    acc = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.raid_island WHERE map_id = ${m} AND account_id = ${acc}
     UNION ALL
     SELECT 1 FROM yuplink.raid_demo_island WHERE map_id = ${m} AND account_id = ${acc}`,
    { wrapJson: true },
  ).catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Право island_god и герой на своём острове — карта острова; право creator и
 * герой в своей (или открытой ему) работе — карта работы (креатор, 07.11.2026:
 * режим бога целиком, без денег); иначе null.
 */
async function islandGodMap(wallet: string): Promise<string | null> {
  const mapId = await myMapId(wallet).catch(() => null);
  if (!mapId) return null;
  if (isCreatorMapId(mapId)) return (await creatorCanEdit(wallet, mapId)) ? mapId : null;
  if (!(await walletHasRight(wallet, "island_god"))) return null;
  return isIslandMapId(mapId) && (await ownsIsland(wallet, mapId)) ? mapId : null;
}

export type GodAdmin = { wallet: string; mapId: string; money: boolean };

/**
 * Режим бога целиком (вместо requireAdmin() + godMapId()): админ — карта, где
 * стоит, деньги можно; право island_god — только свой остров новичка и без
 * денег (god-money.ts).
 */
export async function requireGodAdmin(): Promise<GodAdmin> {
  const wallet = getCurrentWallet();
  if (wallet && isAdminWallet(wallet)) return { wallet, mapId: await myMapId(wallet), money: true };
  const own = wallet ? await islandGodMap(wallet) : null;
  if (wallet && own) return { wallet, mapId: own, money: false };
  throw new Error("Доступ запрещён: требуется admin-кошелёк");
}

/**
 * Карта режима бога и уровень прав: админ — где стоит; дизайнер — свой остров,
 * где стоит. Иначе — отказ. Звать вместо requireAdmin() + godMapId().
 */
export async function requireGodMap(): Promise<GodMap> {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Доступ запрещён: требуется admin-кошелёк");
  if (isAdminWallet(wallet)) return { mapId: await myMapId(wallet), admin: true, money: true };
  const own = await islandGodMap(wallet);
  if (own) return { mapId: own, admin: true, ownIsland: true, money: false };
  if (await walletHasRight(wallet, "god_map")) {
    const mapId = await myMapId(wallet);
    const ownIsland = isIslandMapId(mapId) && (await ownsIsland(wallet, mapId));
    return { mapId, admin: false, ownIsland };
  }
  if (isCastleEditor(wallet, await tgUsernameOf(wallet))) {
    const mapId = await myMapId(wallet);
    if (isIslandMapId(mapId) && (await ownsIsland(wallet, mapId))) {
      return { mapId, admin: false, ownIsland: true };
    }
    throw new Error("Рисовать можно только на своём острове новичка");
  }
  throw new Error("Доступ запрещён: требуется admin-кошелёк");
}

/** Дизайнер замка (или админ) — для чтения справочников кисти. */
export async function requireDesigner(): Promise<string> {
  const wallet = getCurrentWallet();
  if (wallet && (isAdminWallet(wallet) || isCastleEditor(wallet, await tgUsernameOf(wallet)))) {
    return wallet;
  }
  if (wallet && (await walletHasRight(wallet, "god_map"))) return wallet;
  if (wallet && (await walletHasRight(wallet, "island_god"))) return wallet;
  if (wallet && (await walletHasRight(wallet, "creator"))) return wallet;
  throw new Error("Нет доступа");
}

/** Постройки, которые дизайнер ставит: городские (как у генератора города). */
export async function designerBuildings(): Promise<ReadonlySet<string>> {
  const { islandBase } = await import("./island-base");
  const { townBuildingIds } = await import("@/lib/raid/island/townTemplate");
  return townBuildingIds((await islandBase()).catalog);
}

/**
 * Правка дизайнера без лишнего: объект — только снять; настройка — только
 * вместе со своим объектом/постройкой (пустая настройка у живой шахты или
 * сундука = «как у шаблона», то есть мировые награды); постройка — только
 * городская (town); тир, «жив» и купол — не трогать вовсе. Не отказ, а очистка:
 * ластик, отменяя мазок, шлёт клетке её прежние слои — с отказом ломалась бы отмена.
 */
export function designerPatch(c: AdminCellPatch, town: ReadonlySet<string>): AdminCellPatch {
  const out: AdminCellPatch = { ...c };
  if (out.objectId !== undefined && out.objectId !== null) delete out.objectId;
  if (out.objectConfig !== undefined && !(out.objectConfig === null && out.objectId === null))
    delete out.objectConfig;
  if (typeof out.buildingId === "string" && !town.has(out.buildingId)) {
    delete out.buildingId;
    delete out.buildingSkinId;
  }
  if (out.buildingConfig !== undefined && !(out.buildingConfig === null && out.buildingId === null))
    delete out.buildingConfig;
  delete out.tier;
  delete out.alive;
  delete out.voidFog;
  return out;
}

/**
 * Не свой остров (живой мир или чужой остров) под правом god_map: объекты не трогаются вовсе
 * (награды и запас DARAI), а постройку меняют только там, где стояла городская
 * или ничего — шахты, поля и порталы игроков не сносятся и не перекрываются.
 * old — постройки клеток до правки (readOldBuildings).
 */
export function liveMapPatch(
  c: AdminCellPatch,
  old: ReadonlyMap<string, string | null>,
  town: ReadonlySet<string>,
): AdminCellPatch {
  const out: AdminCellPatch = { ...c };
  delete out.objectId;
  delete out.objectConfig;
  const was = old.get(`${c.q},${c.r}`);
  if (out.buildingId !== undefined && was && !town.has(was)) {
    delete out.buildingId;
    delete out.buildingSkinId;
    delete out.buildingConfig;
  }
  return out;
}
