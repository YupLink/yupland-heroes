// Ломбард героев: снятие выбранной копии за выплату, ответ на слепой повтор из
// снимка, отказы по существу и возврат снимком (откат сделки).
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  sqls: [] as string[],
  /** Ответ базы по первой подходящей строке шаблона; нет — пусто. */
  replies: [] as Array<{ match: string; rows: unknown[] }>,
  /** Бросить на запросе с этой строкой (сбой базы). */
  failOn: null as string | null,
  undoAlerts: [] as Array<Record<string, unknown>>,
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sqls.push(sql);
    if (st.failOn && sql.includes(st.failOn)) throw new Error("db down");
    return st.replies.find((r) => sql.includes(r.match))?.rows ?? [];
  },
}));
vi.mock("./market-undo-alert", () => ({
  reportUndoFailure: async (f: Record<string, unknown>) => void st.undoAlerts.push(f),
}));

const { spendPawnHero, restorePawnHeroes, listFreeHeroes, markPawnHeroesPaid, pickedHeroIds } =
  await import("./hero-pawn-take");

const TAKE = "WITH cand AS";
const RECALL = 'SELECT item_id AS "itemId"';
const STATE = "AS free";
const WOKEN = "SELECT id FROM yuplink.hero_instance WHERE item_id";
const RESTORE = "INSERT INTO yuplink.user_game_item";

beforeEach(() => {
  st.sqls = [];
  st.replies = [];
  st.failOn = null;
  st.undoAlerts = [];
});

const pick = { heroItemId: "ugi_1" };

describe("spendPawnHero", () => {
  it("снята выбранная копия — квитанция несёт ключ снимка и шаблон", async () => {
    st.replies.push({ match: TAKE, rows: [{ _row: { itemId: "ugi_1", templateId: "hero_A" } }] });
    const r = await spendPawnHero("w1", "acc1", "hero_any_rare", 1, "mkt-sell:1", pick);
    expect(r.paidHeroes).toEqual([{ op: "mkt-sell:1", itemId: "ugi_1", templateId: "hero_A" }]);
    expect(st.sqls[0]).toContain("u.id = 'ugi_1'");
    expect(st.sqls[0]).toContain("= 'rare'");
    // Проверка «разбудили в тот же миг» — после снятия.
    expect(st.sqls.some((s) => s.includes(WOKEN))).toBe(true);
  });

  it("слепой повтор удачной попытки — тот же ответ из снимка, второго героя не снимаем", async () => {
    st.replies.push({ match: RECALL, rows: [{ itemId: "ugi_1", templateId: "hero_A" }] });
    const r = await spendPawnHero("w1", "acc1", "hero_any_rare", 1, "mkt-sell:1", pick);
    expect(r.paidHeroes?.[0]?.itemId).toBe("ugi_1");
  });

  it("без выбора копии — отказ до базы", async () => {
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 1, "r", {})).rejects.toThrow(
      "market.hero_pick_need",
    );
    expect(st.sqls).toHaveLength(0);
  });

  it("героев в сделке — ровно столько, сколько выбрано копий", async () => {
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 2, "r", pick)).rejects.toThrow(
      "market.bad_qty",
    );
  });

  it("уникальный герой — отказ своим ключом, до редкости и занятости", async () => {
    st.replies.push({ match: STATE, rows: [{ rarity: "rare", unique: true, free: true }] });
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 1, "r", pick)).rejects.toThrow(
      "market.hero_unique",
    );
  });

  it("отказы по существу: не твой / другая редкость / занят", async () => {
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 1, "r", pick)).rejects.toThrow(
      "market.hero_none",
    );
    st.replies.push({ match: STATE, rows: [{ rarity: "epic", free: true }] });
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 1, "r", pick)).rejects.toThrow(
      "market.hero_rarity_wrong",
    );
    st.replies[0] = { match: STATE, rows: [{ rarity: "rare", free: false }] };
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 1, "r", pick)).rejects.toThrow(
      "market.hero_busy",
    );
  });

  it("спящего разбудили в тот же миг — копия возвращается, сделки нет", async () => {
    st.replies.push({ match: TAKE, rows: [{ _row: { itemId: "ugi_1", templateId: "hero_A" } }] });
    st.replies.push({ match: WOKEN, rows: [{ id: "hero_new" }] });
    await expect(
      spendPawnHero("w1", "acc1", "hero_any_rare", 1, "mkt-sell:2", pick),
    ).rejects.toThrow("market.hero_busy");
    const restore = st.sqls.find((s) => s.includes(RESTORE));
    expect(restore).toContain("op = 'mkt-sell:2'");
    expect(st.undoAlerts).toHaveLength(0);
  });

  it("возврат разбуженного не прошёл — алерт админам, игроку тот же отказ", async () => {
    st.replies.push({ match: TAKE, rows: [{ _row: { itemId: "ugi_1", templateId: "hero_A" } }] });
    st.replies.push({ match: WOKEN, rows: [{ id: "hero_new" }] });
    st.failOn = RESTORE;
    await expect(
      spendPawnHero("w1", "acc1", "hero_any_rare", 1, "mkt-sell:3", pick),
    ).rejects.toThrow("market.hero_busy");
    expect(st.undoAlerts).toEqual([
      {
        wallet: "w1",
        account: "acc1",
        side: "sell",
        res: "hero",
        token: "hero_any_rare",
        amount: 1,
        spendRef: "mkt-sell:3",
        undoRef: "mkt-sell:3:woken",
      },
    ]);
  });
});

// Несколько копий одной сделкой (владелец, 23.10.2026): каждая — своим снятием
// и своим снимком, «всё или ничего».
describe("spendPawnHero — несколько копий", () => {
  const two = { heroItemIds: ["ugi_1", "ugi_2"] };
  /** Снятие копии id в сделке ref — по ключу её снимка в том же операторе. */
  const took = (ref: string, id: string, tpl: string) => ({
    match: `'${ref}:${id}', 'acc1'`,
    rows: [{ _row: { itemId: id, templateId: tpl } }],
  });

  it("сняты обе: у каждой свой снимок (ref:id), квитанция — на обе", async () => {
    st.replies.push(took("mkt-sell:5", "ugi_1", "hero_A"), took("mkt-sell:5", "ugi_2", "hero_B"));
    const r = await spendPawnHero("w1", "acc1", "hero_any_rare", 2, "mkt-sell:5", two);
    expect(r.paidHeroes).toEqual([
      { op: "mkt-sell:5:ugi_1", itemId: "ugi_1", templateId: "hero_A" },
      { op: "mkt-sell:5:ugi_2", itemId: "ugi_2", templateId: "hero_B" },
    ]);
    const takes = st.sqls.filter((x) => x.includes(TAKE));
    expect(takes).toHaveLength(2);
    expect(takes[0]).toContain("u.id = 'ugi_1'");
    expect(takes[1]).toContain("u.id = 'ugi_2'");
  });

  it("число с клиента без своих копий не проходит; дубли схлопнуты — до базы", async () => {
    await expect(spendPawnHero("w1", "acc1", "hero_any_rare", 3, "r", two)).rejects.toThrow(
      "market.bad_qty",
    );
    await expect(
      spendPawnHero("w1", "acc1", "hero_any_rare", 2, "r", { heroItemIds: ["ugi_1", "ugi_1"] }),
    ).rejects.toThrow("market.bad_qty");
    expect(st.sqls).toHaveLength(0);
  });

  it("вторая занята — сделки нет: первая возвращается из своего снимка", async () => {
    st.replies.push(took("mkt-sell:6", "ugi_1", "hero_A"));
    st.replies.push({ match: STATE, rows: [{ rarity: "rare", free: false }] });
    await expect(
      spendPawnHero("w1", "acc1", "hero_any_rare", 2, "mkt-sell:6", two),
    ).rejects.toThrow("market.hero_busy");
    const restores = st.sqls.filter((x) => x.includes(RESTORE));
    expect(restores).toHaveLength(1);
    expect(restores[0]).toContain("op = 'mkt-sell:6:ugi_1'");
    expect(st.undoAlerts).toHaveLength(0);
  });

  it("снятие второй упало после записи в базе — возвращаются обе по своим ключам", async () => {
    st.replies.push(took("mkt-sell:8", "ugi_1", "hero_A"));
    st.failOn = "u.id = 'ugi_2'";
    await expect(
      spendPawnHero("w1", "acc1", "hero_any_rare", 2, "mkt-sell:8", two),
    ).rejects.toThrow("db down");
    const restores = st.sqls.filter((x) => x.includes(RESTORE));
    expect(restores.map((x) => x.includes("'mkt-sell:8:ugi_1'"))).toEqual([true, false]);
    expect(restores[1]).toContain("op = 'mkt-sell:8:ugi_2'");
  });

  it("возврат снятых не прошёл — алерт с ключом сделки, игроку причина отказа", async () => {
    st.replies.push(took("mkt-sell:7", "ugi_1", "hero_A"));
    st.failOn = RESTORE;
    await expect(
      spendPawnHero("w1", "acc1", "hero_any_rare", 2, "mkt-sell:7", two),
    ).rejects.toThrow("market.hero_none");
    expect(st.undoAlerts).toEqual([
      expect.objectContaining({ amount: 1, spendRef: "mkt-sell:7", undoRef: "mkt-sell:7:partial" }),
    ]);
  });

  it("выбор: список важнее одиночного id; старый клиент — одна копия; пустое — ничего", () => {
    expect(pickedHeroIds({ heroItemIds: [" ugi_1", "ugi_2", "ugi_1"], heroItemId: "x" })).toEqual([
      "ugi_1",
      "ugi_2",
    ]);
    expect(pickedHeroIds({ heroItemId: "ugi_9" })).toEqual(["ugi_9"]);
    expect(pickedHeroIds({ heroItemIds: [], heroItemId: "  " })).toEqual([]);
    expect(pickedHeroIds(undefined)).toEqual([]);
  });
});

describe("markPawnHeroesPaid", () => {
  it("закрывает снимки сделок одним запросом; пусто — без базы", async () => {
    await markPawnHeroesPaid([
      { op: "mkt-sell:1", itemId: "ugi_1", templateId: "hero_A" },
      { op: "mkt-sell:1", itemId: "ugi_1", templateId: "hero_A" },
    ]);
    expect(st.sqls).toHaveLength(1);
    expect(st.sqls[0]).toContain("SET paid_at = now()");
    expect(st.sqls[0]).toContain("op IN ('mkt-sell:1')");
    await markPawnHeroesPaid([]);
    expect(st.sqls).toHaveLength(1);
  });
});

describe("restorePawnHeroes", () => {
  const heroes = [{ op: "mkt-sell:1", itemId: "ugi_1", templateId: "hero_A" }];

  it("откат — снимком по ключу сделки", async () => {
    await restorePawnHeroes(heroes, 1);
    expect(st.sqls).toHaveLength(1);
    expect(st.sqls[0]).toContain("op = 'mkt-sell:1'");
  });

  it("доля меньше героя — возвращать нечего (герой штучный)", async () => {
    await restorePawnHeroes(heroes, 0.5);
    expect(st.sqls).toHaveLength(0);
  });
});

describe("listFreeHeroes", () => {
  it("уровень — целое, мусор — ноль", async () => {
    st.replies.push({
      match: "LIMIT 200",
      rows: [
        { itemId: "u", templateId: "t", name: "n", imageUrl: null, rarity: "rare", level: "7" },
      ],
    });
    const [h] = await listFreeHeroes("acc1", "rare");
    expect(h?.level).toBe(7);
  });
});
