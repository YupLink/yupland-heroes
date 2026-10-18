// Казино в замке: есть ли у игрока и постройка за ресурсы (владелец, 14.10.2026).
// У админа казино есть сразу, без постройки. Цена — lib/castleCasino.ts,
// списание и запись — одной функцией базы castle_casino_build
// (migrations/casino-02): под замком аккаунта, повтор нажатия ничего не списывает.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { isAdminWallet, requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "../beta-raid/owner";
import { CASINO_COST } from "@/lib/castleCasino";

/** Построено ли казино у аккаунта и сколько у него ресурсов — ядро без входа. */
export async function castleCasinoFor(account: string) {
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.castle_casino WHERE account_id = ${sqlStr(account)}) AS built,
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

export async function buildCastleCasinoFor(account: string, opId: string) {
  const { error, data } = await sb.rpc("castle_casino_build", {
    p_account: account,
    p_cost: CASINO_COST,
    p_op: `casino:${account}:${opId}`,
  });
  if (error) {
    const msg = String(error.message ?? "");
    throw new Error(/в минус/.test(msg) ? "Не хватает ресурсов" : msg || "Не удалось");
  }
  const row = (data as Array<{ built: boolean; applied: boolean }> | null)?.[0];
  return { built: row?.built === true, applied: row?.applied === true };
}

export const getCastleCasino = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireWallet();
  const account = await raidOwner(wallet);
  const admin = isAdminWallet(wallet);
  const state = await castleCasinoFor(account);
  // Админу казино стоит сразу (владелец): строить не нужно.
  return { ...state, built: state.built || admin, admin, cost: CASINO_COST };
});

export const buildCastleCasino = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ opId: z.string().min(8).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireWallet();
    if (isAdminWallet(wallet)) return { built: true, applied: false };
    return buildCastleCasinoFor(await raidOwner(wallet), data.opId);
  });
