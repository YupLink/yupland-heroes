// Подмены для тестов ремонта артефактов (art-repair.test.ts): игрок, клетка,
// кузница, флаг и модель функции базы yuplink.art_repair — та же семантика, что в
// migrations/art-repair-01.sql (сам SQL прогнан на PGlite, см. тест миграции).
// В тесте: vi.mock("<модуль>", async () => (await import("./art-repair.fake")).<имя>).
import { FORGE_TEMPLATE_ID } from "@/lib/hero/artRepair";

type Item = { id: string; account: string; kind: string; wear: number; rarity: string | null };

const fresh = () => ({
  wallet: "w_me",
  account: "acc_me",
  admin: false,
  open: false,
  pos: { q: 0, r: 0 } as { q: number; r: number } | null,
  /** Клетки карты игрока: "q,r" → шаблон постройки. */
  cells: new Map<string, string>([
    ["1,0", FORGE_TEMPLATE_ID],
    ["0,1", "building_other"],
  ]),
  voidCells: new Set<string>(),
  items: [] as Item[],
  heroes: new Map<string, string>(),
  res: { gold: 0, diamonds: 0 },
  ops: new Map<string, Record<string, unknown>>(),
  ledger: [] as Array<{ resource: string; delta: number; kind: string; ref: string }>,
  sql: [] as string[],
  dbError: null as string | null,
  powerDrops: 0,
});

export const s = fresh();
export const resetFake = (): void => void Object.assign(s, fresh());

export const startFn = {
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      // async: отказ проверки входа — отклонённый промис, как у настоящей ручки.
      handler: (h: (a: { data: unknown }) => unknown) => async (a?: { data: unknown }) =>
        h({ data: check ? check(a?.data) : a?.data }),
    };
    return fn;
  },
};
export const auth = { isAdminWallet: (w: string | null) => !!w && s.admin };
export const gate = { requireBetaRaid: async () => s.wallet };
export const owner = { raidOwner: async () => s.account };
export const rate = { actionGate: async () => {} };
export const where = {
  myMapId: async () => "rmap_1",
  playerCell: async () => {
    if (!s.pos) throw new Error("Ты ещё не на карте");
    return s.pos;
  },
};
export const voidGate = {
  requireNotVoid: async (_w: string, _m: string, q: number, r: number) => {
    if (s.voidCells.has(`${q},${r}`)) throw new Error("braid.void_blocked");
  },
};
export const building = {
  loadCellBuilding: async (_m: string, q: number, r: number) => {
    const id = s.cells.get(`${q},${r}`);
    return id ? { buildingId: id, name: "Кузница", effect: null, tiers: [], tier: 0 } : null;
  },
};
export const heroPower = { invalidateHeroPower: () => void (s.powerDrops += 1) };

const rk = (prices: Record<string, unknown>, rarity: string | null): string => {
  const r = String(rarity ?? "")
    .trim()
    .toLowerCase();
  return prices[r] && typeof prices[r] === "object" ? r : "common";
};

/** Модель art_repair: замки не нужны (один поток), порядок проверок — как в SQL. */
function artRepair(sql: string): Record<string, unknown> {
  const m =
    /art_repair\('([^']*)', '([^']*)', (?:ARRAY\[(.*?)\]::text\[\]|'\{\}'::text\[\]),\s*(true|false), '(.*?)'::jsonb, ([\d.]+), ([\d.]+)\)/s.exec(
      sql,
    );
  if (!m) throw new Error(`непонятный вызов: ${sql}`);
  const [, op, account, idsRaw, allRaw, pricesRaw, eg, ed] = m;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(op)) throw new Error("art_repair: ключ нажатия");
  const prices = JSON.parse(pricesRaw) as Record<string, { gold: number; diamonds: number }>;
  const ref = `artfix:${account}:${op}`;
  const prev = s.ops.get(ref);
  if (prev) return { ...prev, fresh: false };
  const ids =
    allRaw === "true"
      ? s.items
          .filter((i) => i.account === account && i.kind === "artifact" && i.wear > 0)
          .map((i) => i.id)
      : [...new Set((idsRaw ?? "").split(",").map((x) => x.trim().replace(/^'|'$/g, "")))].filter(
          Boolean,
        );
  ids.sort();
  if (ids.length === 0) return { ok: false, error: "empty" };
  for (const id of ids) {
    const it = s.items.find((i) => i.id === id);
    const why = !it
      ? "missing"
      : it.account !== account
        ? "foreign"
        : it.kind !== "artifact"
          ? "not_artifact"
          : it.wear <= 0
            ? "not_worn"
            : null;
    if (why) return { ok: false, error: "bad_item", id, why };
  }
  const rows = ids.map((id) => s.items.find((i) => i.id === id)!);
  const gold = rows.reduce((a, i) => a + (prices[rk(prices, i.rarity)].gold ?? 0), 0);
  const diamonds = rows.reduce((a, i) => a + (prices[rk(prices, i.rarity)].diamonds ?? 0), 0);
  if (Number(eg) !== gold || Number(ed) !== diamonds)
    return { ok: false, error: "price_moved", gold, diamonds };
  if (s.res.gold < gold || s.res.diamonds < diamonds)
    return {
      ok: false,
      error: "short",
      needGold: gold,
      haveGold: s.res.gold,
      needDiamonds: diamonds,
      haveDiamonds: s.res.diamonds,
    };
  if (gold > 0)
    s.ledger.push({ resource: "gold", delta: -gold, kind: "art_repair", ref: `${ref}:gold` });
  if (diamonds > 0)
    s.ledger.push({
      resource: "diamonds",
      delta: -diamonds,
      kind: "art_repair",
      ref: `${ref}:diamonds`,
    });
  s.res.gold -= gold;
  s.res.diamonds -= diamonds;
  for (const it of rows) it.wear = 0;
  const res = { ok: true, fresh: true, count: rows.length, gold, diamonds, ids };
  s.ops.set(ref, res);
  return res;
}

/** Модель базы: флаг, список ремонта, вызов функции. */
export const mcp = {
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("art_repair_open")) return s.open ? [{ value: "true" }] : [];
    if (sql.includes("yuplink.art_repair(")) {
      if (s.dbError) throw new Error(s.dbError);
      return [{ r: artRepair(sql) }];
    }
    if (sql.includes("u.wear > 0")) {
      return s.items
        .filter((i) => i.account === s.account && i.kind === "artifact" && i.wear > 0)
        .map((i) => ({
          id: i.id,
          wear: String(i.wear),
          name: `Арт ${i.id}`,
          image_url: null,
          rarity: i.rarity,
          hero_name: s.heroes.get(i.id) ?? null,
        }));
    }
    throw new Error(`неожиданный SQL: ${sql}`);
  },
};
