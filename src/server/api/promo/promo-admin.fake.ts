// Подмены для тестов админки промокодов: кто зовёт (админ/владелец), что
// отвечает база на создание, проверку ссылок, удаление и список.
// В тесте: vi.mock("<модуль>", async () => (await import("./promo-admin.fake")).<имя>).

type Fn = (a: { data?: unknown }) => Promise<unknown>;

export const a = {
  admin: true,
  owner: false,
  sql: [] as string[],
  created: "pcd_op123456" as string | null,
  own: null as null | { id: string; code: string },
  deleted: true,
  /** Каких ссылок нет в справочниках. */
  missing: [] as string[],
  list: [] as unknown[],
};

export function resetAdminFake(): void {
  Object.assign(a, {
    admin: true,
    owner: false,
    created: "pcd_op123456",
    own: null,
    deleted: true,
    missing: [],
    list: [],
  });
  a.sql.length = 0;
}

export const serverFn = {
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (x: { data?: unknown }) =>
      fn({ data: v ? v(x.data) : x.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
};

export const auth = {
  requireAdmin: () => {
    if (!a.admin) throw new Error("Доступ запрещён: требуется admin-кошелёк");
    return a.owner ? "owner.tg" : "helper.tg";
  },
  isPayoutsAdminWallet: (w: string | null) => w === "owner.tg",
  getCurrentWallet: () => null,
};

/** Бокс «mp_darai» платит DARAI: заводит только владелец (mystic-money). */
export const money = {
  assertPackMoneyRight: async (id: string | null) => {
    if (id === "mp_darai" && !a.owner) throw new Error("только для владельца");
  },
};

/** Ссылки из VALUES проверки справочников: «(0, 'pack'::text, 'mp_1'::text)». */
const refsOf = (sql: string): string[] =>
  [...sql.matchAll(/\((\d+), '[a-z]+'::text, '([^']*)'::text\)/g)].map((m) => m[2]);

export const mcp = {
  mcpExec: async (sql: string) => {
    a.sql.push(sql);
    if (sql.includes("AS ok")) return refsOf(sql).map((ref) => ({ ok: !a.missing.includes(ref) }));
    if (sql.includes("INSERT INTO yuplink.promo_code ")) return [{ id: a.created, lines: 1 }];
    if (sql.includes("SELECT id, code FROM yuplink.promo_code")) return a.own ? [a.own] : [];
    if (sql.startsWith("DELETE")) return a.deleted ? [{ id: "pcd_op123456" }] : [];
    if (sql.includes("json_agg")) return a.list;
    return [];
  },
};

export const goodLine = {
  kind: "resource",
  ref: "gold",
  title: null,
  image: null,
  amount: "10-50",
  chance: 100,
  budget: 5000,
};

export const input = (over: Record<string, unknown> = {}) => ({
  code: "autumn",
  maxUsers: 100,
  lines: [goodLine],
  opId: "op123456",
  ...over,
});

export const call = (fn: unknown, data?: unknown) => (fn as Fn)({ data });
