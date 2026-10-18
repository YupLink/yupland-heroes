// Аукционный дом игрока: состояние, постройка/улучшение, мои вещи для лота.
// Правила — lib/auctionHouse.ts; выставление и снятие лота — house-lot.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "../beta-raid/owner";
import { listFreeArtifacts } from "../beta-raid/art-stock";
import { resolveBackpack } from "../beta-raid/market-backpack";
import { ensureAuctionSchema } from "./schema";
import { BUSY_SLOT_SQL } from "./house-fn";
import {
  HOUSE_MAX_LEVEL,
  SOLD_SLOT_HOURS,
  houseCost,
  houseCurrencies,
  houseFeePct,
  houseSlots,
} from "@/lib/auctionHouse";
import { isWalletLinked } from "@/lib/walletLinked";

export async function who(): Promise<{ wallet: string; account: string }> {
  const wallet = await requireWallet();
  return { wallet, account: await raidOwner(wallet) };
}

async function loadResources(account: string): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT resource, amount FROM yuplink.account_resources WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ resource: string; amount: number }>;
  return Object.fromEntries((rows ?? []).map((r) => [r.resource, Number(r.amount) || 0]));
}

export function humanHouseError(msg: string): string {
  if (/house_level_moved/.test(msg)) return "Уровень дома уже изменился — обнови окно";
  if (/house_max_level/.test(msg)) return `Дом уже ${HOUSE_MAX_LEVEL}-го уровня`;
  if (/house_needed/.test(msg)) return "Сначала построй аукционный дом в ратуше замка";
  const slot = msg.match(/house_no_slot:(\d+)/);
  if (slot) return `Все лоты заняты (${slot[1]}) — улучши дом или дождись освобождения`;
  if (/res_move: в минус/.test(msg)) return "Не хватает ресурсов";
  return msg || "Не удалось";
}

type HouseRow = { level: number | null; busy: number | string; cool_from: string | null };

/** Уровень дома аккаунта (0 — не построен). */
export async function houseLevel(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT level FROM yuplink.castle_auction_house WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ level: number }>;
  return Math.min(HOUSE_MAX_LEVEL, Math.max(0, Number(rows?.[0]?.level ?? 0) || 0));
}

export const getAuctionHouse = createServerFn({ method: "GET" }).handler(async () => {
  const { wallet, account } = await who();
  await ensureAuctionSchema();
  const acc = sqlStr(account);
  const [rows, resources] = await Promise.all([
    mcpExec(
      `SELECT (SELECT h.level FROM yuplink.castle_auction_house h WHERE h.account_id = ${acc}) AS level,
              (SELECT count(*) FROM yuplink.auction a
                WHERE a.seller_account_id = ${acc} AND ${BUSY_SLOT_SQL}) AS busy,
              (SELECT min(a.closed_at) FROM yuplink.auction a
                WHERE a.seller_account_id = ${acc} AND a.status = 'settled'
                  AND a.winner_account_id IS NOT NULL
                  AND a.closed_at > now() - interval '${SOLD_SLOT_HOURS} hours') AS cool_from;`,
      { wrapJson: true },
    ) as Promise<HouseRow[]>,
    loadResources(account),
  ]);
  const r = rows?.[0];
  const level = Math.min(HOUSE_MAX_LEVEL, Math.max(0, Number(r?.level ?? 0) || 0));
  const busy = Number(r?.busy) || 0;
  const slots = houseSlots(level);
  return {
    level,
    maxLevel: HOUSE_MAX_LEVEL,
    slots,
    /** Комиссия проекту сейчас и после улучшения, %. */
    feePct: level > 0 ? houseFeePct(level) : null,
    nextFeePct: level < HOUSE_MAX_LEVEL ? houseFeePct(level + 1) : null,
    /** За что можно продавать сейчас. */
    currencies: level > 0 ? houseCurrencies(level, isWalletLinked(wallet)) : [],
    busy,
    /** Когда освободится слот проданного лота (мс), если сейчас все заняты. */
    freeAt:
      level > 0 && busy >= slots && r?.cool_from
        ? Date.parse(r.cool_from) + SOLD_SLOT_HOURS * 3600_000
        : null,
    cost: houseCost(level),
    resources,
  };
});

export const upgradeAuctionHouse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ fromLevel: z.number().int().min(0), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { account } = await who();
    await ensureAuctionSchema();
    const cost = houseCost(data.fromLevel);
    if (!cost) throw new Error(`Дом уже ${HOUSE_MAX_LEVEL}-го уровня`);
    const { error, data: rows } = await sb.rpc("castle_auction_house_upgrade", {
      p_account: account,
      p_from: data.fromLevel,
      p_cost: cost,
      p_op: `up:${account}:${data.opId}`,
    });
    if (error) throw new Error(humanHouseError(String(error.message ?? "")));
    return { level: Number((rows as Array<{ level: number }> | null)?.[0]?.level ?? 0) };
  });

type StackRow = {
  stackKey: string;
  refId: string | null;
  name: string;
  image: string | null;
  count: number | string;
  wear: number | string | null;
};

/** Товары рюкзака выбранного героя, которые можно выставить (целые штуки). */
export async function sellableGoods(wallet: string) {
  const bp = await resolveBackpack(wallet).catch(() => null);
  if (!bp) return { heroId: null as string | null, goods: [] };
  const rows = (await mcpExec(
    `SELECT b.stack_key AS "stackKey", b.ref_id AS "refId", b.name, b.image, b.count, b.wear
       FROM yuplink.raid_hero_backpack b
      WHERE b.hero_id = ${sqlStr(bp.heroId)} AND b.kind = 'custom' AND b.count >= 1
      ORDER BY b.name, b.stack_key;`,
    { wrapJson: true },
  )) as StackRow[];
  const goods = (rows ?? [])
    .map((r) => ({
      stackKey: r.stackKey,
      refId: r.refId ?? r.stackKey.replace(/^custom:/, ""),
      name: r.name,
      image: r.image ?? null,
      // Изношенная штука инструмента остаётся у героя (в рюкзаке её не делят).
      max: Math.floor(Number(r.count) || 0) - (Number(r.wear) > 0 ? 1 : 0),
    }))
    .filter((g) => g.max >= 1 && g.refId.startsWith("cst_"));
  return { heroId: bp.heroId, goods };
}

/** Что игрок может выставить: ресурсы, свободные артефакты, товары рюкзака. */
export const myAuctionGoods = createServerFn({ method: "GET" }).handler(async () => {
  const { wallet, account } = await who();
  const [resources, artifacts, bag] = await Promise.all([
    loadResources(account),
    listFreeArtifacts(account),
    sellableGoods(wallet),
  ]);
  return {
    resources,
    artifacts: artifacts.map((a) => ({
      ref: a.templateId,
      name: a.name,
      image: a.imageUrl,
      rarity: a.rarity,
      max: a.count,
    })),
    goods: bag.goods.map((g) => ({ ref: g.stackKey, name: g.name, image: g.image, max: g.max })),
  };
});
