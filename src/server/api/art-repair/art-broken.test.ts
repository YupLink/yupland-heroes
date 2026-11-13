// Сломанный слетает с героя (§8.63 п.3): ручки плашек и снятие вне удара.
// Механика за флагом: не запущена — ни плашек, ни снятия; «показано» — только
// свои и только непоказанные; снятие с купленного героя — один запрос по ключу
// лота, повтор ничего не задвоит. Сам SQL прогнан на PGlite (см. отчёт ветки).
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
const st = vi.hoisted(() => ({
  on: true,
  wallet: "w.near" as string | null,
  reply: [] as unknown[] | Error,
  dropped: [] as string[],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    if (st.reply instanceof Error) throw st.reply;
    return st.reply;
  },
}));
vi.mock("@/server/auth", () => ({ getCurrentWallet: () => st.wallet }));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_1" }));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w.near" }));
vi.mock("@/server/api/beta-raid/hero-power", () => ({
  invalidateHeroPower: (w: string) => void st.dropped.push(w),
}));
vi.mock("./art-repair-gate", () => ({ artBrokenOn: async () => st.on }));

const api = await import("./art-broken");
const sql = await import("./art-broken-sql");
type Fn<A, R> = (a: A) => Promise<R>;
const getOn = api.getArtBrokenOn as unknown as Fn<void, { on: boolean }>;
const getNotices = api.getArtBreakNotices as unknown as Fn<void, { items: unknown[] }>;
const mark = api.markArtBreakShown as unknown as Fn<{ data: { ids: string[] } }, unknown>;

beforeEach(() => {
  sqls.length = 0;
  st.on = true;
  st.wallet = "w.near";
  st.reply = [];
  st.dropped.length = 0;
});

describe("SQL плашек", () => {
  it("непоказанные своего аккаунта, старые первыми, с потолком", () => {
    const s = sql.breakNoticesSql("acc_1");
    expect(s).toContain("FROM yuplink.art_break_notice");
    expect(s).toContain("account_id = 'acc_1' AND shown_at IS NULL");
    expect(s).toContain("ORDER BY created_at, id");
    expect(s).toContain(`LIMIT ${sql.ART_BREAK_NOTICE_LIMIT}`);
  });

  it("«показано» — только свои и только непоказанные, без дублей id", () => {
    expect(sql.markShownSql("acc_1", [])).toBeNull();
    const s = sql.markShownSql("acc_1", ["a", "a", "b"]) ?? "";
    expect(s).toContain("SET shown_at = now()");
    expect(s).toContain("account_id = 'acc_1' AND shown_at IS NULL");
    expect(s).toContain("id IN ('a','b')");
  });

  it("снятие с героя: только сломанное своего аккаунта, событие по ключу, повтор — ничего", () => {
    const s = sql.stripBrokenFromHeroSql("hero_9", "hm_L1");
    expect(s).toContain("u.kind = 'artifact' AND u.wear >= 100 AND u.account_id = h.account_id");
    expect(s).toContain("WHERE e.value NOT IN (SELECT id FROM gone)");
    expect(s).toContain("WHERE x.id = 'hero_9' AND EXISTS (SELECT 1 FROM gone)");
    expect(s).toContain("'abn_' || 'hm_L1' || '_' || g.id");
    expect(s).toContain("ON CONFLICT (id) DO NOTHING");
    // Предмет остаётся в инвентаре: user_game_item не меняется вовсе.
    expect(s).not.toMatch(/(UPDATE|DELETE FROM) yuplink\.user_game_item/);
  });
});

describe("ручки", () => {
  it("флаг: запущено/нет — как говорит гейт", async () => {
    expect(await getOn()).toEqual({ on: true });
    st.on = false;
    expect(await getOn()).toEqual({ on: false });
  });

  it("плашки: механика не запущена или нет кошелька — пусто, базу не спрашиваем", async () => {
    st.on = false;
    expect(await getNotices()).toEqual({ items: [] });
    st.on = true;
    st.wallet = null;
    expect(await getNotices()).toEqual({ items: [] });
    expect(sqls).toEqual([]);
  });

  it("плашки: строки базы → форма клиента", async () => {
    st.reply = [{ id: "abn_1", itemId: "u1", name: "Меч", imageUrl: "/m.webp" }];
    expect(await getNotices()).toEqual({
      items: [{ id: "abn_1", itemId: "u1", name: "Меч", imageUrl: "/m.webp" }],
    });
    expect(sqls[0]).toContain("account_id = 'acc_1'");
  });

  it("«показано» пишет в базу и считает помеченные", async () => {
    st.reply = [{ id: "abn_1" }];
    expect(await mark({ data: { ids: ["abn_1"] } })).toEqual({ ok: true, marked: 1 });
    expect(sqls[0]).toContain("UPDATE yuplink.art_break_notice");
  });
});

describe("снятие с купленного героя", () => {
  it("механика не запущена — ничего", async () => {
    st.on = false;
    expect(await api.stripBrokenFromHero("w.near", "hero_9", "hm_L1")).toBe(0);
    expect(sqls).toEqual([]);
  });

  it("сняли — кэш силы сброшен; нечего снимать — не трогаем", async () => {
    st.reply = [{ stripped: 1, noted: 1 }];
    expect(await api.stripBrokenFromHero("w.near", "hero_9", "hm_L1")).toBe(1);
    expect(st.dropped).toEqual(["w.near"]);
    st.reply = [{ stripped: 0, noted: 0 }];
    expect(await api.stripBrokenFromHero("w.near", "hero_9", "hm_L1")).toBe(0);
    expect(st.dropped).toEqual(["w.near"]);
  });

  it("сбой базы покупку не роняет", async () => {
    st.reply = new Error("pool is closed");
    expect(await api.stripBrokenFromHero("w.near", "hero_9", "hm_L1")).toBe(0);
  });
});
