import { townHallError } from "@/server/api/castle-townhall/townhall-state";
// Архитектор замка (ПРАВИЛА §8.59.7): состояние для карточки в Ратуше, здания на
// площади и окна; постройка/улучшение. Правила — lib/castleArchitect.ts, цены —
// architect-config.ts, списание — castle_architect_upgrade (migrations/minev2-10,
// товары цены — minev2-40, architect-goods.ts: из рюкзака выбранного героя).
// Изготовление заготовки — craft.ts. Открыто всем игрокам (владелец: запуск).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "@/server/db/pg";
import { mcpExec } from "@/server/db/mcpClient";
import { requireWallet } from "@/server/auth";
import { sqlStr } from "@/server/api/raid-shared";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { BUILDER_SPEC } from "@/lib/buildingEffect";
import {
  ARCHITECT_MAX_LEVEL,
  BLUEPRINT_LEVEL,
  architectLevelCost,
  craftProblem,
} from "@/lib/castleArchitect";
import { BLUEPRINT_RESOURCES } from "@/lib/mineBlueprint";
import { MINE_PLACE_CAPTURE_COST } from "@/lib/minePlacement";
import { mineBoostMult, mineBoostNext } from "@/lib/mineBoost";
import { mineBoostLevels } from "./mine-boost-sql";
import { loadArchitectConfig } from "./architect-config";
import { architectError } from "./craft-core";
import { assertGoods, canonCost, goodsViews, heroArg } from "./architect-goods";
import { assertCastleSlot } from "@/server/api/castle-townhall/townhall-buy";

export async function who(): Promise<{ wallet: string; account: string }> {
  const wallet = requireWallet();
  return { wallet, account: await raidOwner(wallet) };
}

/** Уровень Архитектора аккаунта (0 — не построен). */
export async function architectLevel(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT level FROM yuplink.castle_architect WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ level: number | string }>;
  return Math.min(ARCHITECT_MAX_LEVEL, Math.max(0, Math.floor(Number(rows?.[0]?.level ?? 0) || 0)));
}

async function loadResources(account: string): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT resource, amount FROM yuplink.account_resources WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ resource: string; amount: number | string }>;
  return Object.fromEntries((rows ?? []).map((r) => [r.resource, Number(r.amount) || 0]));
}

export const getCastleArchitect = createServerFn({ method: "GET" }).handler(async () => {
  const { wallet, account } = await who();
  const [level, cfg, resources, bag, boosts] = await Promise.all([
    architectLevel(account),
    loadArchitectConfig(),
    loadResources(account),
    resolveBackpack(wallet).catch(() => null),
    mineBoostLevels(account),
  ]);
  const builder = bag?.spec === BUILDER_SPEC;
  const cost = architectLevelCost(cfg, level);
  // Товары цен: имя, картинка и сколько у выбранного героя; [0] — уровень.
  const goods = await goodsViews(
    [cost, ...BLUEPRINT_RESOURCES.map((k) => cfg.blueprints[k])],
    bag?.heroId ?? null,
  );
  return {
    level,
    maxLevel: ARCHITECT_MAX_LEVEL,
    /** Цена следующего уровня; null — потолок. */
    cost,
    /** Товары в цене следующего уровня. */
    costGoods: goods[0],
    resources,
    /** Выбранный герой: есть ли и Строитель ли он (делает заготовки без Архитектора). */
    hero: bag ? { name: bag.heroName, builder } : null,
    blueprints: BLUEPRINT_RESOURCES.map((kind, i) => ({
      kind,
      needLevel: BLUEPRINT_LEVEL[kind],
      cost: cfg.blueprints[kind],
      goods: goods[i + 1],
      problem: craftProblem(kind, level, builder),
      /** Усиление чертежа (lib/mineBoost): уровень, захват сейчас и следующий шаг. */
      boost: {
        level: boosts[kind],
        mult: mineBoostMult(boosts[kind]),
        capture: MINE_PLACE_CAPTURE_COST[kind] * mineBoostMult(boosts[kind]),
        next: mineBoostNext(boosts[kind]),
      },
    })),
  };
});

export type CastleArchitectState = Awaited<ReturnType<typeof getCastleArchitect>>;

export const upgradeCastleArchitect = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ fromLevel: z.number().int().min(0), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account } = await who();
    const level = architectLevelCost(await loadArchitectConfig(), data.fromLevel);
    if (!level) throw new Error("architect.max_level");
    // Постройка (0 → 1) занимает место в лимите Ратуши (§8.64).
    if (data.fromLevel === 0) await assertCastleSlot(account);
    const cost = await canonCost(level);
    // Товары в цене — из рюкзака выбранного героя; нет героя — платить нечем.
    let heroId: string | null = null;
    if (cost.goods?.length) {
      const bag = await resolveBackpack(wallet);
      if (!bag) throw new Error("market.need_hero");
      heroId = bag.heroId;
      await assertGoods(heroId, cost.goods);
    }
    const { error, data: rows } = await sb.rpc("castle_architect_upgrade", {
      p_account: account,
      p_from: data.fromLevel,
      p_cost: cost,
      p_op: `up:${account}:${data.opId}`,
      ...heroArg(cost, heroId),
    });
  if (error && /townhall_no_slot:/.test(String(error.message ?? ""))) {
    throw townHallError(new Error(String(error.message)));
  }
    if (error) throw architectError(new Error(String(error.message ?? "")));
    return {
      level: Number((rows as Array<{ level: number }> | null)?.[0]?.level ?? data.fromLevel + 1),
    };
  });
