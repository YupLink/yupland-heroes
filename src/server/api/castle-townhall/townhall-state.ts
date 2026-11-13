// Ратуша замка (ПРАВИЛА §8.64): состояние для окна Ратуши и сцены замка и
// улучшение уровня. Правила — lib/townHall.ts, каталог — lib/townHallCatalog.ts,
// цены — townhall-config.ts, списание — castle_townhall_upgrade
// (migrations/townhall-01). Покупки зданий и декора — townhall-buy.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "@/server/db/pg";
import { mcpExec } from "@/server/db/mcpClient";
import { requireWallet } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { raidOwner } from "@/server/api/beta-raid/owner";
import {
  BASE_IN_LIMIT,
  TOWN_HALL_MAX_LEVEL,
  levelCost,
  slotLimit,
  slotsUsed,
  type TownHallCost,
} from "@/lib/townHall";
import {
  LEGACY_BUILDINGS,
  buildingProblem,
  type BuyProblem,
  type LegacyBuilding,
} from "@/lib/townHallCatalog";
import { loadTownHallConfig, townHallPricesOpen } from "./townhall-config";
import { FREE_BUILD_EXCEPT, hasFreeBuild } from "./free-build";

export async function who(): Promise<{ wallet: string; account: string }> {
  const wallet = requireWallet();
  return { wallet, account: await raidOwner(wallet) };
}

export type OwnedBuilding = {
  id: string;
  kind: string;
  source: "buy" | "alpha";
  createdAt: string;
};

export type TownHallRow = {
  level: number;
  /** Куплено зданий (castle_building + Казино, Аукционный дом, Архитектор). */
  purchased: number;
  buildings: OwnedBuilding[];
  legacy: Record<LegacyBuilding, boolean>;
  decor: string[];
  resources: Record<string, number>;
};

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Всё про Ратушу аккаунта — одним запросом. */
export async function loadTownHall(account: string): Promise<TownHallRow> {
  const a = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT
       (SELECT level FROM yuplink.castle_townhall WHERE account_id = ${a}) AS level,
       yuplink.castle_slots_used(${a}) AS purchased,
       (SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'source', source,
                 'createdAt', created_at) ORDER BY created_at)
          FROM yuplink.castle_building WHERE account_id = ${a}) AS buildings,
       EXISTS (SELECT 1 FROM yuplink.castle_casino WHERE account_id = ${a}) AS casino,
       EXISTS (SELECT 1 FROM yuplink.castle_auction_house WHERE account_id = ${a} AND level >= 1) AS auction,
       EXISTS (SELECT 1 FROM yuplink.castle_architect WHERE account_id = ${a} AND level >= 1) AS architect,
       (SELECT jsonb_agg(kind ORDER BY kind) FROM yuplink.castle_decor WHERE account_id = ${a}) AS decor,
       (SELECT jsonb_object_agg(resource, amount) FROM yuplink.account_resources
         WHERE account_id = ${a}) AS resources`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  const r = rows?.[0] ?? {};
  const level = Math.min(TOWN_HALL_MAX_LEVEL, Math.max(1, Math.floor(Number(r.level ?? 1) || 1)));
  const res = r.resources && typeof r.resources === "object" ? r.resources : {};
  return {
    level,
    purchased: Math.max(0, Math.floor(Number(r.purchased) || 0)),
    buildings: arr<OwnedBuilding>(r.buildings),
    legacy: Object.fromEntries(LEGACY_BUILDINGS.map((k) => [k, r[k] === true])) as Record<
      LegacyBuilding,
      boolean
    >,
    decor: arr<string>(r.decor),
    resources: Object.fromEntries(
      Object.entries(res as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]),
    ),
  };
}

export type CatalogBuilding = {
  kind: string;
  cost: TownHallCost;
  max: number;
  needLevel: number;
  owned: number;
  problem: BuyProblem;
};

/** Окно Ратуши: уровень, места, купленное и каталог с ценами. */
export async function townHallView(account: string) {
  const [row, cfg, open, free] = await Promise.all([
    loadTownHall(account),
    loadTownHallConfig(),
    townHallPricesOpen(),
    hasFreeBuild(account),
  ]);
  const limit = slotLimit(row.level);
  const used = slotsUsed(row.purchased);
  const catalog: CatalogBuilding[] = Object.entries(cfg.buildings).map(([kind, offer]) => {
    const bought = row.buildings.filter((b) => b.kind === kind).length;
    // Личное право «строить бесплатно» (free-build.ts): здание уже стоит, кнопки «Купить» нет.
    const owned = free && !FREE_BUILD_EXCEPT.includes(kind) ? Math.max(bought, 1) : bought;
    return {
      kind,
      ...offer,
      owned,
      problem: buildingProblem(offer, { level: row.level, used, limit, owned }),
    };
  });
  return {
    level: row.level,
    maxLevel: TOWN_HALL_MAX_LEVEL,
    /** Цены уровней и декора открыты владельцем (townhall_prices_open). */
    pricesOpen: open,
    /** Цена следующего уровня; null — 9-й, потолок, или цены ещё не утверждены. */
    cost: open ? levelCost(cfg.levels, row.level) : null,
    slots: {
      limit,
      used,
      free: Math.max(0, limit - used),
      /** Лимит после улучшения; null — потолок. */
      nextLimit: row.level < TOWN_HALL_MAX_LEVEL ? slotLimit(row.level + 1) : null,
      /** Сколько базовых зданий входит в лимит (0 — только купленные). */
      base: BASE_IN_LIMIT,
    },
    buildings: row.buildings,
    legacy: row.legacy,
    catalog,
    decor: { owned: row.decor, prices: open ? cfg.decor : {} },
    resources: row.resources,
  };
}

export type TownHallView = Awaited<ReturnType<typeof townHallView>>;

export const getTownHall = createServerFn({ method: "GET" }).handler(async () => {
  const { account } = await who();
  return townHallView(account);
});

/**
 * Отказ базы — ключом `townhall.*`; текст игроку — словарь
 * lib/translations/townhall.ts через humanError (числа — в ключе).
 */
export function townHallError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (/res_move: в минус/.test(msg)) return new Error("townhall.no_resources");
  if (/townhall_level_moved/.test(msg)) return new Error("townhall.level_moved");
  if (/townhall_max_level/.test(msg)) return new Error("townhall.max_level");
  const need = /townhall_need_level:(\d+)/.exec(msg);
  if (need) return new Error(`townhall.need_level|${JSON.stringify({ n: Number(need[1]) })}`);
  const slot = /townhall_no_slot:(\d+):(\d+)/.exec(msg);
  if (slot) return new Error(`townhall.no_slot:${slot[1]}:${slot[2]}`);
  if (/townhall_kind_max/.test(msg)) return new Error("townhall.kind_max");
  if (/townhall_bad_kind/.test(msg)) return new Error("townhall.unknown_kind");
  return e instanceof Error ? e : new Error(msg || "Не удалось");
}

export const upgradeTownHall = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ fromLevel: z.number().int().min(1), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { account } = await who();
    if (!(await townHallPricesOpen())) throw new Error("townhall.prices_pending");
    const cost = levelCost((await loadTownHallConfig()).levels, data.fromLevel);
    if (!cost) throw new Error("townhall.max_level");
    const { error, data: rows } = await sb.rpc("castle_townhall_upgrade", {
      p_account: account,
      p_from: data.fromLevel,
      p_cost: cost,
      p_op: `up:${account}:${data.opId}`,
    });
    if (error) throw townHallError(new Error(String(error.message ?? "")));
    const row = (rows as Array<{ level: number; applied: boolean }> | null)?.[0];
    return { level: Number(row?.level ?? data.fromLevel + 1), applied: row?.applied === true };
  });
