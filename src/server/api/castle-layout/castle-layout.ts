// Расстановка замка на сервере — одна на аккаунт, общая для телефона и ПК
// (запрос Ангелины 26.10.2026). Владелец — аккаунт проверенной сессии (who():
// подписанная cookie → кошелёк → аккаунт), клиент ни кошелька, ни аккаунта не
// передаёт. Сервер пишет только по явному saveCastleLayout; базовую сцену сам
// не создаёт: нет строки — { revision: 0, layout: null }.
// Схема и пределы — layout-schema.ts, права — layout-rights.ts, SQL — layout-sql.ts.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { pg } from "@/server/db/pg";
import { isAdminWallet, isCastleEditor } from "@/server/auth";
import { LEGACY_BUILDINGS } from "@/lib/townHallCatalog";
import { loadTownHall, who } from "@/server/api/castle-townhall/townhall-state";
import {
  parseSaveInput,
  type ModularLayoutItem,
  type SaveCastleLayoutInput,
} from "./layout-schema";
import { FREE_BUILD_EXCEPT, hasFreeBuild } from "@/server/api/castle-townhall/free-build";
import { OWNED_LAYOUT_BUILDINGS, layoutRightsProblem, type LayoutOwnership } from "./layout-rights";
import { insertLayoutSql, readLayoutSql, updateLayoutSql } from "./layout-sql";

export type CastleLayoutState = { revision: number; layout: ModularLayoutItem[] | null };
export type SaveCastleLayoutResult =
  | { ok: true; revision: number }
  | { ok: false; conflict: true; revision: number; layout: ModularLayoutItem[] | null };

/** Сохранённая расстановка аккаунта; нет строки — ревизия 0 и null. */
export async function readCastleLayout(account: string): Promise<CastleLayoutState> {
  const rows = (await mcpExec(readLayoutSql(account), { wrapJson: true })) as Array<{
    revision: number | string;
    layout: unknown;
  }>;
  const r = rows?.[0];
  const revision = Number(r?.revision ?? 0);
  if (!r || !Number.isSafeInteger(revision) || revision < 1) return { revision: 0, layout: null };
  return { revision, layout: Array.isArray(r.layout) ? (r.layout as ModularLayoutItem[]) : null };
}

/** Что у аккаунта есть: здания и купленные виды — тем же запросом, что окно Ратуши. */
export async function layoutOwnership(wallet: string, account: string): Promise<LayoutOwnership> {
  const [th, free] = await Promise.all([loadTownHall(account), hasFreeBuild(account)]);
  const buildings: Record<string, number> = {};
  for (const b of th.buildings) buildings[b.kind] = (buildings[b.kind] ?? 0) + 1;
  for (const k of LEGACY_BUILDINGS) if (th.legacy[k]) buildings[k] = Math.max(buildings[k] ?? 0, 1);
  // Казино у админа стоит и без постройки (getCastleCasino: built || admin).
  if (isAdminWallet(wallet)) buildings.casino = Math.max(buildings.casino ?? 0, 1);
  // «Корона гречневого королевства» — только вход в игру (её закрывает bwApi): место в
  // раскладке принимаем у всех, иначе после снятия права замок перестал бы сохраняться.
  buildings.buckwheat_game = 1;
  // Личное право «строить бесплатно» (free-build.ts): покупные здания — как построенные.
  if (free)
    for (const k of OWNED_LAYOUT_BUILDINGS)
      if (!FREE_BUILD_EXCEPT.includes(k)) buildings[k] = Math.max(buildings[k] ?? 0, 1);
  return { buildings, decor: th.decor, full: false };
}

/** Админ или дизайнер замка: как session.isAdmin || session.isCastleEditor. */
async function castleEditor(wallet: string): Promise<boolean> {
  if (isAdminWallet(wallet)) return true;
  const u = await pg.users.findOne({ wallet }).catch(() => null);
  return isCastleEditor(wallet, u?.telegram_username ?? null);
}

/** Права на всё в сцене; отказ — ключом castle.layout_*. */
export async function assertLayoutRights(
  wallet: string,
  account: string,
  layout: readonly ModularLayoutItem[],
): Promise<void> {
  const own = await layoutOwnership(wallet, account);
  const problem = layoutRightsProblem(layout, own);
  if (!problem) return;
  // Дизайнера ищем в users только когда без этого не обойтись.
  if (await castleEditor(wallet)) {
    const again = layoutRightsProblem(layout, { ...own, full: true });
    if (!again) return;
    throw again;
  }
  throw problem;
}

export const getCastleLayout = createServerFn({ method: "GET" }).handler(
  async (): Promise<CastleLayoutState> => {
    const { account } = await who();
    return readCastleLayout(account);
  },
);

export const saveCastleLayout = createServerFn({ method: "POST" })
  .inputValidator((d: SaveCastleLayoutInput) => parseSaveInput(d))
  .handler(async ({ data }): Promise<SaveCastleLayoutResult> => {
    const { wallet, account } = await who();
    await assertLayoutRights(wallet, account, data.layout);
    const json = JSON.stringify(data.layout);
    const sql =
      data.revision === 0
        ? insertLayoutSql(account, json, wallet)
        : updateLayoutSql(account, data.revision, json, wallet);
    const rows = (await mcpExec(sql, { wrapJsonCte: true })) as Array<{
      revision: number | string;
    }>;
    const revision = Number(rows?.[0]?.revision);
    if (Number.isSafeInteger(revision) && revision > 0) return { ok: true, revision };
    return { ok: false, conflict: true, ...(await readCastleLayout(account)) };
  });
