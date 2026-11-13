// Сбор добычи с шахты (пендинг-модель, без крона). Владелец забирает целые
// накопленные часы в любой момент; секундомер НЕ сбрасывается — SQL двигает
// только claimed_hours. Доступно всем игрокам (владелец = кто захватил).
// «Собрать со всех шахт» забирает и отнятые шахты и грибы — их несобранное
// (§8.71, mine-lost-claim): после сбора строка уходит из «Добычи».
// Сам сбор — общее ядро mine-claim-core.ts (им же собирает «Управление шахтами»).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";
import { publishRaid } from "../../raidLive";
import { ownedMineRows, type MineRow } from "./mine-pendings";
import { claimMineRows, claimOne } from "./mine-claim-core";

// Владелец шахты — любой игрок; сбор добычи гейтит сама SQL (owner_account=я).
async function raidAccount(): Promise<{ mapId: string; account: string; wallet: string }> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return { mapId: await myMapId(wallet), account, wallet };
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
  const { mapId, account, wallet } = await raidAccount();
  // Со всех открытых этажей: шахты — добыча аккаунта, где бы он ни стоял.
  const { floorMaps } = await import("./floors");
  const floors = await floorMaps(mapId);
  const mines: MineRow[] = (
    await Promise.all(floors.map(({ id }) => ownedMineRows(id, account).catch(() => [])))
  ).flat();
  const credited = await claimMineRows(account, mines);
  // Отнятые шахты и грибы — их строки журнала (сбой — свои шахты уже собраны).
  const { claimLostRows } = await import("./mine-lost/mine-lost-claim");
  const lost = await claimLostRows(account, wallet).catch(() => null);
  for (const [key, n] of Object.entries(lost?.credited ?? {})) {
    credited[key] = Math.round(((credited[key] ?? 0) + n) * 10_000) / 10_000;
  }
  return { ok: true as const, credited };
});
