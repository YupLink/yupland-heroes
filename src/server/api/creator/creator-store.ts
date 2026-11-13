// Работы креатора: список, новая голая карта, имя, общий доступ.
//
// Владелец, 07.11.2026: «отдельный мир — голая карта… создавать шаблоны
// поселений… сохранение шаблона и отдельный список таких работ… можно открыть
// любую и переделать… поделиться — сделать работу общей». Сохранять нечего
// отдельно: работа — сама карта, каждая правка режима бога пишется в неё
// сразу; в список — имя и кто владеет.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  CREATOR_PREFIX,
  type CreatorPeer,
  type CreatorRole,
  type CreatorShare,
  type CreatorWork,
} from "@/lib/raid/creator/ids";
import { CREATOR_MAP_SIZE, blankMapCells } from "@/lib/raid/creator/blankMap";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { insertMapSql } from "../beta-raid/worldgen/write-sql";
import { namesSql } from "../tournament/tour-sql";
import { blankCellsSql } from "./creator-map-sql";
import {
  insertWorkSql,
  lastOwnSql,
  renameWorkSql,
  shareSql,
  workSql,
  worksListSql,
  type ShareRole,
} from "./creator-sql";

/** Сколько своих работ у креатора — предохранитель от горы пустых карт. */
export const CREATOR_MAX_WORKS = 100;

type WorkRow = {
  map_id: string;
  name: string;
  owner_account: string;
  places: unknown;
  size: number | string | null;
  updated_ms: number | string | null;
  my_role: string | null;
  shared: unknown;
};

const parseJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const roleOf = (v: unknown): CreatorRole =>
  v === "owner" || v === "edit" || v === "view" ? v : null;

/** Кому открыта: [{account, role}] из jsonb; мусор — мимо. */
const sharesOf = (v: unknown): CreatorShare[] => {
  const list = parseJson(v);
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => {
    const o = (x ?? {}) as { account?: unknown; role?: unknown };
    const role = o.role === "view" ? "view" : o.role === "edit" ? "edit" : null;
    return typeof o.account === "string" && role ? [{ account: o.account, role }] : [];
  });
};

/** Строка базы → работа списка (имена авторов — снаружи). */
export function toWork(r: WorkRow, account: string, names: Map<string, string>): CreatorWork {
  const updated = Number(r.updated_ms);
  return {
    mapId: r.map_id,
    name: r.name,
    mine: r.owner_account === account,
    ownerAccount: r.owner_account,
    ownerName: names.get(r.owner_account) ?? r.owner_account,
    role: roleOf(r.my_role),
    sharedWith: sharesOf(r.shared),
    size: Number(r.size) || 64,
    updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
  };
}

/** Подписи аккаунтов (@username / id / кошелёк) — как в таблицах турниров. */
export async function namesOf(accounts: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(accounts)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const rows = ((await mcpExec(namesSql(ids), { wrapJson: true }).catch(() => [])) ?? []) as Array<{
    account_id: string;
    name: string;
  }>;
  return new Map(rows.map((r) => [r.account_id, r.name]));
}

export async function listWorks(account: string, all: boolean): Promise<CreatorWork[]> {
  const rows = ((await mcpExec(worksListSql(account, all), { wrapJson: true })) ?? []) as WorkRow[];
  const names = await namesOf(rows.map((r) => r.owner_account));
  return rows.map((r) => toWork(r, account, names));
}

/** Работа для действий: где старт, чья, моя роль, рамка, имя. */
export type WorkRef = {
  mapId: string;
  owner: string;
  spawn: Cell;
  role: CreatorRole;
  size: number;
  name: string;
};

/** places.spawn работы: целые q, r; нет — центр рамки не угадываем, null. */
export function spawnOf(places: unknown): Cell | null {
  const o = parseJson(places) as { spawn?: { q?: unknown; r?: unknown } } | null;
  const q = Number(o?.spawn?.q);
  const r = Number(o?.spawn?.r);
  return Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null;
}

/** Работа, видная аккаунту (all — админу любая), или null. */
export async function loadWork(
  mapId: string,
  account: string,
  all = false,
): Promise<WorkRef | null> {
  const rows = (await mcpExec(workSql(mapId, account, all), { wrapJson: true })) as
    | WorkRow[]
    | null;
  const r = rows?.[0];
  if (!r) return null;
  const spawn = spawnOf(r.places);
  if (!spawn) throw new Error("creator.no_spawn");
  return {
    mapId: r.map_id,
    owner: r.owner_account,
    spawn,
    role: roleOf(r.my_role),
    size: Number(r.size) || 64,
    name: r.name,
  };
}

/** Свой мир, в котором креатор был последним; своих нет — null. */
export async function lastOwnWork(account: string): Promise<string | null> {
  const rows = (await mcpExec(lastOwnSql(account), { wrapJson: true })) as Array<{
    map_id: string;
  }> | null;
  return rows?.[0]?.map_id ?? null;
}

export async function ownCount(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.raid_creator_work WHERE owner_account = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ n: number | string }> | null;
  return Number(rows?.[0]?.n) || 0;
}

/** Новая работа: голая карта (все клетки пустые) и строка в списке. */
export async function createWork(account: string, name: string): Promise<WorkRef> {
  if ((await ownCount(account)) >= CREATOR_MAX_WORKS) throw new Error("creator.too_many");
  const { cells, spawn } = blankMapCells();
  const mapId = `${CREATOR_PREFIX}${nanoid(10)}`;
  const statements = [
    insertMapSql({ id: mapId, name, size: CREATOR_MAP_SIZE }),
    ...blankCellsSql(mapId, cells),
    insertWorkSql({ mapId, name, owner: account, spawn }),
  ];
  try {
    for (const s of statements) await mcpExec(s, { wrapJson: false });
  } catch (e) {
    const { dropIsland } = await import("../beta-raid/island/island-create");
    await dropIsland(mapId).catch(() => {});
    throw e;
  }
  return { mapId, owner: account, spawn, role: "owner", size: CREATOR_MAP_SIZE, name };
}

export async function renameWork(mapId: string, name: string): Promise<void> {
  for (const s of renameWorkSql(mapId, name)) await mcpExec(s, { wrapJson: false });
}

export async function setShare(mapId: string, peer: string, role: ShareRole | null): Promise<void> {
  await mcpExec(shareSql(mapId, peer, role), { wrapJson: false });
}

/** Другие креаторы — кому можно открыть работу. */
export async function listPeers(account: string): Promise<CreatorPeer[]> {
  const { accountsWithRight } = await import("@/server/admin-rights");
  const others = (await accountsWithRight("creator")).filter((a) => a !== account);
  const names = await namesOf(others);
  return others
    .map((a) => ({ account: a, name: names.get(a) ?? a }))
    .sort((x, y) => x.name.localeCompare(y.name));
}
