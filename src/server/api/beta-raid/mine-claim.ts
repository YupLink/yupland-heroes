// Сбор добычи с шахты (пендинг-модель, без крона). Владелец забирает целые
// накопленные часы в любой момент; секундомер НЕ сбрасывается — SQL двигает
// только claimed_hours. Доступно всем игрокам (владелец = кто захватил).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { publishRaid } from "../../raidLive";
import { ownedMineRows, type MineRow } from "./mine-pendings";
import { bumpAchievement } from "../achievements/bump";

// Владелец шахты — любой игрок; сбор добычи гейтит сама SQL (owner_account=я).
async function raidAccount(): Promise<{ mapId: string; account: string }> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return { mapId: await myMapId(wallet), account };
}

async function claimOne(mapId: string, q: number, r: number, account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT yuplink.raid_mine_claim(${sqlStr(mapId)}, ${q}, ${r}, ${sqlStr(account)}) AS amt;`,
    { wrapJson: true },
  ).catch((e: unknown) => {
    // SQL бросает 'mine_not_owner' сырым текстом (мост дописывает префикс), а
    // humanError переводит только ключи вида domain.key. Случай реальный: окно
    // шахты открыто, а её уже отбили — накопленное начислено при перехвате.
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/mine_not_owner/.test(msg) ? "braid.mine_not_owner" : msg);
  })) as Array<{ amt: number }>;
  const amount = Number(rows?.[0]?.amt ?? 0);
  // Ачивка «Хозяин шахт» (§8.57): сколько собрано с шахт.
  bumpAchievement(account, "minelord", amount);
  return amount;
}

/** Забрать добычу одной шахты (из её окна). Ресурс клиент знает сам. */
export const claimMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const { mapId, account } = await raidAccount();
    const amount = await claimOne(mapId, data.q, data.r, account);
    if (amount > 0)
      publishRaid({ mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    return { ok: true as const, amount };
  });

/** Забрать добычу со ВСЕХ своих шахт (кнопка «Собрать» над картой). */
export const claimAllMines = createServerFn({ method: "POST" }).handler(async () => {
  const { mapId, account } = await raidAccount();
  // Со всех открытых этажей: шахты — добыча аккаунта, где бы он ни стоял.
  const { floorMaps } = await import("./floors");
  const floors = await floorMaps(mapId);
  const mines: MineRow[] = (
    await Promise.all(floors.map(({ id }) => ownedMineRows(id, account).catch(() => [])))
  ).flat();
  const credited: Record<string, number> = {};
  const touched: MineRow[] = [];

  // Имена кастомных товаров (cst_*) — подтягиваем одним запросом, а не по
  // одной шахте. Без этого в toast «Собрано с шахт: 0.04 custom» вместо
  // «0.04 Помидор».
  const customIds = mines
    .filter((m) => m.resource === "custom" && m.token?.startsWith("cst_"))
    .map((m) => m.token!);
  const customNames = new Map<string, string>();
  if (customIds.length > 0) {
    const rows = (await mcpExec(
      `SELECT id, name FROM yuplink.raid_custom_item
        WHERE id IN (${customIds.map((id) => sqlStr(id)).join(",")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; name: string }>;
    for (const r of rows ?? []) customNames.set(r.id, String(r.name ?? ""));
  }

  for (const m of mines) {
    const amt = await claimOne(m.mapId, m.q, m.r, account).catch(() => 0);
    if (amt > 0) {
      // Ключ — символ монеты для token-шахт (Darai/magicdust), имя товара
      // для custom-шахт, иначе сам ресурс.
      let key: string;
      if (m.resource === "token") {
        key = m.token ?? "token";
      } else if (m.resource === "custom" && m.token?.startsWith("cst_")) {
        key = customNames.get(m.token) ?? "custom";
      } else {
        key = m.resource;
      }
      credited[key] = (credited[key] ?? 0) + amt;
      touched.push(m);
    }
  }
  for (const { id } of floors) {
    const cells = touched.filter((m) => m.mapId === id).map((m) => `${m.q},${m.r}`);
    if (cells.length) publishRaid({ mapId: id, type: "built", mine: true, cells });
  }
  return { ok: true as const, credited };
});
