// Улучшения игрока за алмаз (правила — lib/accountUpgrade): прочитать, купить и сколько у
// игрока личных ячеек склада. Покупка — одной функцией базы (account_upgrade_buy): алмаз
// списывается один раз на аккаунт и вид, повтор отвечает «уже».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { accAccountId } from "@/server/api/currency/move";
import {
  NO_UPGRADES,
  UPGRADE_DIAMONDS,
  UPGRADE_KINDS,
  isUpgradeKind,
  isUpgraded,
  ownCellsWith,
  type Upgrades,
} from "@/lib/accountUpgrade";

/** Улучшения аккаунта. Сбой — ни одного (ячеек меньше, а не больше, чем куплено). */
export async function upgradesOf(account: string | null | undefined): Promise<Upgrades> {
  if (!account) return { ...NO_UPGRADES };
  const rows = (await mcpExec(
    `SELECT kind FROM yuplink.account_upgrade WHERE account_id = ${sqlStr(account)}`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string }> | null;
  const out = { ...NO_UPGRADES };
  for (const r of rows ?? []) if (isUpgradeKind(r.kind)) out[r.kind] = true;
  return out;
}

/** Личных ячеек склада у аккаунта. */
export async function ownCellsOf(account: string | null | undefined): Promise<number> {
  return ownCellsWith(await upgradesOf(account));
}

async function myAccount(): Promise<string> {
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");
  return account;
}

export const getMyUpgrades = createServerFn({ method: "GET" }).handler(async () => {
  const account = await myAccount();
  return { upgrades: await upgradesOf(account), cost: UPGRADE_DIAMONDS };
});

export const buyUpgrade = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kind: z.enum(UPGRADE_KINDS) }).parse(d))
  .handler(async ({ data }) => {
    const account = await myAccount();
    // Улучшение одно на оба окна: уже куплено — алмаз не берём.
    const now = await upgradesOf(account);
    if (isUpgraded(now)) return { upgrades: now };
    const rows = (await mcpExec(
      `SELECT yuplink.account_upgrade_buy(${sqlStr(account)}, ${sqlStr(data.kind)}, ${UPGRADE_DIAMONDS}) AS res`,
      { wrapJson: true },
    )) as Array<{ res: string }> | null;
    const res = rows?.[0]?.res;
    if (res !== "ok" && res !== "already") throw new Error("upgrade.failed");
    return { upgrades: await upgradesOf(account) };
  });
