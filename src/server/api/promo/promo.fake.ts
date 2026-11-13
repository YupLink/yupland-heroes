// Подмены для тестов ввода промокода: состояние и модули. Базы и сети нет —
// тест смотрит, что позвано и с какими ключами.
// В тесте: vi.mock("<модуль>", async () => (await import("./promo.fake")).<имя>).

type Fn = (a: { data: unknown }) => Promise<unknown>;
type Gift = { id: string; kind: string; amount: number; ref_id: string | null };
type Stack = { kind: string; ref: string | null; qty: number; nonce: string };

export const s = {
  wallet: "w1.tg" as string | null,
  tg: 42 as number | null,
  redeem: null as unknown,
  redeemFail: null as string | null,
  /** Строка уже в «Добыче» (проверка по ключу). */
  harvestN: 0,
  /** Отметка «куда легло» падает. */
  markFail: false,
  sql: [] as string[],
  gates: [] as string[],
  gifts: [] as Gift[],
  giftFail: null as string | null,
  stacks: [] as Stack[],
  stackFail: null as string | null,
  queued: [] as Array<Record<string, unknown>>,
};

export function resetPromoFake(): void {
  Object.assign(s, {
    wallet: "w1.tg",
    tg: 42,
    redeem: null,
    redeemFail: null,
    harvestN: 0,
    markFail: false,
    giftFail: null,
    stackFail: null,
  });
  for (const k of ["sql", "gates", "gifts", "stacks", "queued"] as const) s[k].length = 0;
}

export const serverFn = {
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
};
export const auth = { getCurrentWallet: () => s.wallet };
export const maintenance = { assertNotMaintenance: () => undefined };
export const rateGate = { guessGate: async (what: string) => void s.gates.push(what) };
export const pgMod = {
  pg: { users: { findOne: async () => ({ telegram_id: s.tg }) } },
};
export const userShared = { accountIdOf: async () => "acc_1" };

export const mcp = {
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("promo_redeem(")) {
      if (s.redeemFail) throw new Error(s.redeemFail);
      return [{ res: s.redeem }];
    }
    if (sql.includes("SET delivered = delivered ||") && s.markFail) throw new Error("MCP POST 502");
    // Проверка «строка уже в Добыче» (promo-harvest.harvestHas).
    if (sql.includes("count(*)::int AS n")) return [{ n: s.harvestN }];
    return [];
  },
};
export const gifts = {
  deliverGift: async (_w: string, g: Gift) => {
    if (s.giftFail) throw new Error(s.giftFail);
    s.gifts.push({ id: g.id, kind: g.kind, amount: g.amount, ref_id: g.ref_id });
  },
};
export const stack = {
  depositRefStack: async (o: Stack) => {
    if (s.stackFail) throw new Error(s.stackFail);
    s.stacks.push({ kind: o.kind, ref: o.ref, qty: o.qty, nonce: o.nonce });
    return "given";
  },
};
export const queue = {
  queueEncounterReward: async (r: Record<string, unknown>) => void s.queued.push(r),
};
export const where = { myMapId: async () => "map_1" };

/** Строка, выпавшая в базе. */
export const line = (idx: number, kind: string, amount: number, ref: string | null = null) => ({
  idx,
  kind,
  ref,
  title: kind === "custom" ? "Пшеница" : null,
  image: null,
  amount,
});

/** Свежая активация (первый ввод). */
export const fresh = (rolled: unknown[]) => ({
  id: "prd_x",
  code: "AUTUMN",
  status: "reserved",
  same_op: true,
  was: false,
  rolled,
  delivered: {},
});

export const marks = (): string[] =>
  s.sql.filter((q) => q.includes("SET delivered = delivered ||"));
export const closed = (): boolean => s.sql.some((q) => q.includes("SET status = 'done'"));

type Items = { status: string; items: Array<{ where: string }> };

/** Ввести код через ручку (ключ нажатия по умолчанию — op123456). */
export async function redeem(data: Record<string, unknown>): Promise<Items> {
  const { redeemPromo } = await import("./promo-redeem");
  return (await (redeemPromo as unknown as Fn)({
    data: { opId: "op123456", ...data },
  })) as Items;
}
