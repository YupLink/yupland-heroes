// Деньги в режиме бога не-админа (право island_god; владелец 04.11.2026:
// «режим бога целиком на её острове… деньги — запрет»). Деньги — монеты
// (DARAI, USDT и прочие токены). Игровые ресурсы, лайки, энергия, билеты,
// товары, вещи и паки — не деньги.
//  · stripMoney — из настройки клетки, которую он пишет, вычищается всё в
//    токенах: элементы с kind/resource "token" и ключи-монеты.
//  · tokenBuildings — постройки, чей шаблон сам добывает токены (шахта, поле):
//    такие на его остров не ставятся — пустая настройка взяла бы шаблонную.
//  · isMoneyFreeMap — остров владельца права: награды в токенах оттуда в
//    очередь не встают (reward-queue), даже пришедшие из шаблона объекта.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import { parseRecipe } from "@/lib/marketRecipe";
import type { AdminCellPatch } from "./admin-cell-patch";

const MONEY_KEYS: ReadonlySet<string> = new Set(["token", "usdt", "darai"]);

const isTokenNode = (x: unknown): boolean => {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return o.kind === "token" || o.resource === "token";
};

/** Копия без токенов; сама настройка «в токенах» (плоская шахта) — null. */
export function stripMoney(v: unknown): unknown {
  if (isTokenNode(v)) return null;
  if (Array.isArray(v)) return v.filter((x) => !isTokenNode(x)).map(stripMoney);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (MONEY_KEYS.has(k) || isTokenNode(x)) continue;
      out[k] = stripMoney(x);
    }
    return out;
  }
  return v;
}

/** Виды наград очереди, которые не деньги; остальное — символ монеты. */
const NOT_MONEY: ReadonlySet<string> = new Set([
  "likes",
  "tickets",
  "energy",
  "resource",
  "custom",
  "item",
  "pack",
  // Клад (§8.117): строка «Добычи», не символ монеты.
  "treasure",
  // Доля владельцев казино (§8.124): золото по «Забрать», не символ монеты.
  "casino_share",
]);
export const isMoneyKind = (kind: string): boolean => !NOT_MONEY.has(kind);

/** Из этих построек — те, чей шаблон добывает токены. */
export async function tokenBuildings(ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set();
  const rows = (await mcpExec(
    `SELECT t.id FROM yuplink.mystic_item_template t
      WHERE t.id IN (${ids.map(sqlStr).join(", ")})
        AND (t.meta->'mine'->>'resource' = 'token' OR t.meta->>'resource' = 'token'
             OR t.meta->'field'->'reward'->>'resource' = 'token');`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  return new Set((rows ?? []).map((r) => r.id));
}

const TTL_MS = 30_000;
const freeCache = new Map<string, { at: number; free: boolean }>();

/**
 * Остров владельца права island_god — без денег; демо-остров (demo-island) и
 * работы креатора (isle_cw_…) — всегда без денег.
 */
export async function isMoneyFreeMap(mapId: string): Promise<boolean> {
  if (!isIslandMapId(mapId)) return false;
  if (isCreatorMapId(mapId)) return true;
  const hit = freeCache.get(mapId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.free;
  const m = sqlStr(mapId);
  const rows = (await mcpExec(
    `SELECT account_id, false AS demo FROM yuplink.raid_island WHERE map_id = ${m}
     UNION ALL
     SELECT account_id, true FROM yuplink.raid_demo_island WHERE map_id = ${m}
     LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ account_id: string; demo: boolean }>;
  const { accountHasRight } = await import("@/server/admin-rights");
  const free =
    rows?.[0]?.demo === true ||
    (await accountHasRight(rows?.[0]?.account_id ?? null, "island_god"));
  freeCache.set(mapId, { at: Date.now(), free });
  return free;
}

/** Лавка не-админа: ни цены, ни выдачи, ни выкупа в токенах. */
export function assertNoMarketTokens(d: {
  kind?: string;
  refId?: string | null;
  giveToken?: string | null;
  priceResource?: string | null;
  price2Resource?: string | null;
  priceMore?: Array<{ resource?: string | null }> | null;
}): void {
  const token =
    (d.kind === "resource" && d.refId === "token") ||
    !!d.giveToken ||
    d.priceResource === "token" ||
    d.price2Resource === "token" ||
    (d.priceMore ?? []).some((l) => l.resource === "token");
  if (token) throw new Error("Токены в лавке — только админу");
}

type MarketPacks = {
  side?: string;
  kind?: string;
  refId?: string | null;
  priceResource?: string | null;
  priceToken?: string | null;
  price2Resource?: string | null;
  price2Token?: string | null;
  outcomes?: unknown[] | null;
};

/** Паки, которые позиция ОТДАЁТ игроку: товар покупки, исходы рецепта, цена скупки. */
function packsOut(d: MarketPacks): string[] {
  const ids: Array<string | null | undefined> = [];
  if (d.side === "sell") {
    if (d.priceResource === "pack") ids.push(d.priceToken);
    if (d.price2Resource === "pack") ids.push(d.price2Token);
  } else {
    if (d.kind === "pack") ids.push(d.refId);
    if (d.kind === "recipe") {
      for (const o of parseRecipe(d.outcomes)) if (o.kind === "pack") ids.push(o.refId);
    }
  }
  return [...new Set(ids.filter((id): id is string => !!id))];
}

/**
 * Бокс с DARAI/Stars внутри (mystic-money) — те же деньги: лавка и ратуша
 * не-админа (money: false) его не отдают, у админа — только админ выплат.
 */
export async function assertMarketPacksRight(d: MarketPacks, money: boolean): Promise<void> {
  const ids = packsOut(d);
  if (ids.length === 0) return;
  const { assertPackMoneyRight, packPaysMoney } = await import("@/server/api/mystic-money");
  for (const id of ids) {
    if (money) await assertPackMoneyRight(id);
    else if (await packPaysMoney(id)) throw new Error("Деньги в лавке — только админу");
  }
}

/**
 * Правка клеток не-админа (island_god): настройки объекта и постройки — без
 * токенов; постройка, чей шаблон сам добывает токены, не ставится.
 */
export async function stripCellsMoney(cells: AdminCellPatch[]): Promise<AdminCellPatch[]> {
  const placed = [
    ...new Set(cells.flatMap((c) => (typeof c.buildingId === "string" ? [c.buildingId] : []))),
  ];
  const token = await tokenBuildings(placed);
  return cells.map((c) => {
    const out: AdminCellPatch = { ...c };
    if (out.objectConfig)
      out.objectConfig = stripMoney(out.objectConfig) as AdminCellPatch["objectConfig"];
    if (out.buildingConfig)
      out.buildingConfig = stripMoney(out.buildingConfig) as AdminCellPatch["buildingConfig"];
    if (typeof out.buildingId === "string" && token.has(out.buildingId)) {
      delete out.buildingId;
      delete out.buildingSkinId;
      delete out.buildingConfig;
    }
    return out;
  });
}
