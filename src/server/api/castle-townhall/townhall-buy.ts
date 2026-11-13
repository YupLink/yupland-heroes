// Покупки в Ратуше замка (ПРАВИЛА §8.64): здание (в пределах лимита уровня) и
// вид декора (один раз за золото). Списание и запись — функциями базы
// castle_building_buy / castle_decor_buy (migrations/townhall-01): под замком
// аккаунта, лимит и потолок вида проверяет сама база, повтор нажатия ничего не
// списывает. Цены и виды — только из настройки сервера (клиенту не верим).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "@/server/db/pg";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { BASE_IN_LIMIT, SLOT_LIMITS, slotLimit, slotsUsed } from "@/lib/townHall";
import { KIND_RE } from "@/lib/townHallCatalog";
import { loadTownHallConfig, townHallPricesOpen } from "./townhall-config";
import { townHallError, who } from "./townhall-state";
import { freeBuildCovers } from "./free-build";

const opId = z.string().min(8).max(40);
const kind = z.string().regex(KIND_RE);

/** Купить здание каталога за свой счёт аккаунта. */
export async function buyBuildingFor(account: string, k: string, op: string) {
  const offer = (await loadTownHallConfig()).buildings[k];
  if (!offer) throw new Error("townhall.unknown_kind");
  // Личное право «строить бесплатно»: здание и так стоит, покупать и списывать нечего.
  if (await freeBuildCovers(account, k)) return { id: "", kind: k, applied: false };
  const { error, data } = await sb.rpc("castle_building_buy", {
    p_account: account,
    p_kind: k,
    p_cost: offer.cost,
    p_max: offer.max,
    p_need_level: offer.needLevel,
    p_limits: [...SLOT_LIMITS],
    p_base: BASE_IN_LIMIT,
    p_op: `bld:${account}:${op}`,
  });
  if (error) throw townHallError(new Error(String(error.message ?? "")));
  const row = (data as Array<{ building_id: string; applied: boolean }> | null)?.[0];
  return { id: String(row?.building_id ?? ""), kind: k, applied: row?.applied === true };
}

export const buyCastleBuilding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kind, opId }).parse(d))
  .handler(async ({ data }) => {
    const { account } = await who();
    return buyBuildingFor(account, data.kind, data.opId);
  });

/** Купить вид декора: дальше его можно ставить сколько угодно. */
export async function buyDecorFor(account: string, k: string, op: string) {
  if (!(await townHallPricesOpen())) throw new Error("townhall.prices_pending");
  const gold = (await loadTownHallConfig()).decor[k];
  if (!gold) throw new Error("townhall.unknown_kind");
  const { error, data } = await sb.rpc("castle_decor_buy", {
    p_account: account,
    p_kind: k,
    p_gold: gold,
    p_op: `dec:${account}:${op}`,
  });
  if (error) throw townHallError(new Error(String(error.message ?? "")));
  const row = (data as Array<{ applied: boolean }> | null)?.[0];
  return { kind: k, applied: row?.applied === true };
}

export const buyCastleDecor = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kind, opId }).parse(d))
  .handler(async ({ data }) => {
    const { account } = await who();
    return buyDecorFor(account, data.kind, data.opId);
  });

/**
 * Перед постройкой Казино, Аукционного дома и Архитектора (у них свои кнопки
 * и функции базы): есть ли свободное место в лимите Ратуши. Проверка до
 * списания, без общего замка — в гонке с покупкой здания каталога лимит
 * может превыситься на одно здание; снести его нельзя, следующую покупку
 * база не пропустит.
 */
export async function assertCastleSlot(account: string): Promise<void> {
  const a = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT (SELECT level FROM yuplink.castle_townhall WHERE account_id = ${a}) AS level,
            yuplink.castle_slots_used(${a}) AS purchased`,
    { wrapJson: true },
  )) as Array<{ level: number | null; purchased: number }>;
  const r = rows?.[0];
  const limit = slotLimit(Number(r?.level ?? 1) || 1);
  const used = slotsUsed(Number(r?.purchased) || 0);
  if (used >= limit) throw new Error(`townhall.no_slot:${used}:${limit}`);
}
