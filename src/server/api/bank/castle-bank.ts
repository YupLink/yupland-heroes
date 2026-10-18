// Банк в замке (владелец, 14.10.2026): пока только админам, у админа построен сразу.
// Игрокам потом — постройка за ресурсы в Ратуше; без неё не купить лицензию на
// продажу золота за DARAI (bank-license.ts).
// Цена — lib/castleBank.ts, списание и запись — castle_bank_build (migrations/bank-01).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { isAdminWallet, requireAdmin, requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "../beta-raid/owner";
import { BANK_COST } from "@/lib/castleBank";

/** Построен ли банк у аккаунта и сколько у него ресурсов — ядро без входа. */
export async function castleBankFor(account: string) {
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.castle_bank WHERE account_id = ${sqlStr(account)}) AS built,
            (SELECT jsonb_object_agg(resource, amount) FROM yuplink.account_resources
              WHERE account_id = ${sqlStr(account)}) AS resources;`,
    { wrapJson: true },
  )) as Array<{ built: boolean; resources: Record<string, number> | null }>;
  const r = rows?.[0];
  const resources = Object.fromEntries(
    Object.entries(r?.resources ?? {}).map(([k, v]) => [k, Number(v) || 0]),
  );
  return { built: r?.built === true, resources };
}

export async function buildCastleBankFor(account: string, opId: string) {
  const { error, data } = await sb.rpc("castle_bank_build", {
    p_account: account,
    p_cost: BANK_COST,
    p_op: `bank:${account}:${opId}`,
  });
  if (error) {
    const msg = String(error.message ?? "");
    throw new Error(/в минус/.test(msg) ? "Не хватает ресурсов" : msg || "Не удалось");
  }
  const row = (data as Array<{ built: boolean; applied: boolean }> | null)?.[0];
  return { built: row?.built === true, applied: row?.applied === true };
}

/** Не админу банка нет вовсе: ни здания, ни карточки в Ратуше. */
export const getCastleBank = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  if (!isAdminWallet(wallet)) return { visible: false as const };
  const state = await castleBankFor(await raidOwner(wallet));
  // Админу банк построен сразу (владелец 15.10: «админу построй») — как казино.
  return { visible: true as const, ...state, built: true, cost: BANK_COST };
});

export const buildCastleBank = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ opId: z.string().min(8).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    return buildCastleBankFor(await raidOwner(wallet), data.opId);
  });
