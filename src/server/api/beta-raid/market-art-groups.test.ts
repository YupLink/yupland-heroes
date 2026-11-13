// Ломбард: несколько артефактов одной сделкой (владелец, 25.10.2026). Каждая
// группа проверяется как одиночный выбор, снимается всё одним запросом с одним
// ключом сделки; число артефактов обязано совпасть с тем, что просит сделка.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
let reply: unknown[] = [];
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    return reply;
  },
}));

const { takeArtifactGroups, takeArtifacts } = await import("./art-stock");
const { mergeArtGroups } = await import("./market-art-groups");

beforeEach(() => {
  sqls.length = 0;
  reply = [];
});

describe("mergeArtGroups", () => {
  it("одинаковые шаблон и износ — одна группа, сломанный того же шаблона — своя", () => {
    expect(
      mergeArtGroups([
        { templateId: "a", wear: 0, count: 1 },
        { templateId: "b", wear: 100, count: 2 },
        { templateId: " a ", wear: 0, count: 2 },
        { templateId: "a", wear: 100, count: 1 },
        { templateId: "", wear: 0, count: 5 },
        { templateId: "c", wear: 0, count: 0 },
      ]),
    ).toEqual([
      { templateId: "a", wear: 0, count: 3 },
      { templateId: "b", wear: 100, count: 2 },
      { templateId: "a", wear: 100, count: 1 },
    ]);
  });
});

describe("takeArtifactGroups — один запрос на все группы", () => {
  it("по группе свой LIMIT, заявка — только если набрались все, ключ сделки один", async () => {
    reply = [
      { id: "i1", templateId: "a", obtainedAt: null, wear: "0" },
      { id: "i2", templateId: "a", obtainedAt: null, wear: "0" },
      { id: "i3", templateId: "b", obtainedAt: null, wear: "100" },
    ];
    const got = await takeArtifactGroups({
      account: "acc",
      wallet: "w",
      groups: [
        { pick: { templateId: "a", rarity: "common", wear: 0 }, qty: 2 },
        { pick: { templateId: "b", rarity: "common", wear: 100 }, qty: 1 },
      ],
      op: "mkt-sell:x",
    });
    expect(got?.map((a) => a.id)).toEqual(["i1", "i2", "i3"]);
    expect(got?.[2]?.wear).toBe(100);
    const sql = sqls[0] ?? "";
    expect(sqls).toHaveLength(1);
    expect(sql).toContain("UNION ALL");
    expect(sql).toMatch(/u\.template_id = 'a'[\s\S]*u\.wear = 0[\s\S]*LIMIT 2\)/);
    expect(sql).toMatch(/u\.template_id = 'b'[\s\S]*u\.wear = 100[\s\S]*LIMIT 1\)/);
    expect(sql).toContain("(SELECT count(*) FROM free) = 3");
    expect(sql).toContain("'art:mkt-sell:x'");
    expect(sql).toContain("'art:mkt-sell:x#'");
  });

  it("одиночное снятие — прежний запрос, без UNION", async () => {
    reply = [{ id: "i1", templateId: "a", obtainedAt: null, wear: "0" }];
    await takeArtifacts({
      account: "acc",
      wallet: "w",
      qty: 1,
      pick: { templateId: "a" },
      op: "r",
    });
    expect(sqls[0]).not.toContain("UNION");
    expect(sqls[0]).toContain("LIMIT 1\n");
    expect(sqls[0]).toContain("(SELECT count(*) FROM free) = 1");
  });

  it("не набралось (и памятки нет) — null, ничего не снято", async () => {
    const got = await takeArtifactGroups({
      account: "acc",
      wallet: "w",
      groups: [
        { pick: { templateId: "a", wear: 0 }, qty: 1 },
        { pick: { templateId: "b", wear: 0 }, qty: 1 },
      ],
      op: "r2",
    });
    expect(got).toBeNull();
  });
});

describe("spendArt с группами ломбарда", () => {
  type Stat = { rarity: string | null; count: number } | null;
  const load = async (stats: Record<string, Stat>, taken: unknown) => {
    vi.resetModules();
    const calls: Array<{ fn: string; arg: unknown }> = [];
    vi.doMock("./art-stock", () => ({
      freeArtifactStat: async (_a: string, tpl: string, wear: number) => {
        calls.push({ fn: "stat", arg: { tpl, wear } });
        return stats[`${tpl}:${wear}`] ?? null;
      },
      takeArtifactGroups: async (o: { groups: unknown; op: string }) => {
        calls.push({ fn: "take", arg: { groups: o.groups, op: o.op } });
        return taken;
      },
    }));
    vi.doMock("./art-rarity", () => ({
      isArtAny: (t: string) => t.startsWith("art_any_"),
      artAnyRarity: (t: string) => t.replace("art_any_", ""),
    }));
    const { spendArt } = await import("./market-art-pay");
    return { spendArt, calls };
  };
  const groups = [
    { templateId: "a", wear: 0, count: 2 },
    { templateId: "b", wear: 100, count: 1 },
  ];

  it("каждая группа проверена, снято одним вызовом с ключом сделки", async () => {
    const arts = [
      { id: "i1", templateId: "a" },
      { id: "i2", templateId: "a" },
      { id: "i3", templateId: "b", wear: 100 },
    ];
    const { spendArt, calls } = await load(
      { "a:0": { rarity: "common", count: 5 }, "b:100": { rarity: "common", count: 1 } },
      arts,
    );
    const r = await spendArt("w", "acc", "art_any_common", 3, "ref1", { artGroups: groups });
    expect(r.paidArts).toEqual(arts);
    expect(calls).toEqual([
      { fn: "stat", arg: { tpl: "a", wear: 0 } },
      { fn: "stat", arg: { tpl: "b", wear: 100 } },
      {
        fn: "take",
        arg: {
          op: "ref1",
          groups: [
            { pick: { templateId: "a", rarity: "common", wear: 0 }, qty: 2 },
            { pick: { templateId: "b", rarity: "common", wear: 100 }, qty: 1 },
          ],
        },
      },
    ]);
  });

  it("число артефактов не совпало со сделкой — отказ до снятия", async () => {
    const { spendArt, calls } = await load({}, []);
    await expect(
      spendArt("w", "acc", "art_any_common", 2, "r", { artGroups: groups }),
    ).rejects.toThrow("market.bad_qty");
    expect(calls).toEqual([]);
  });

  it("чужая группа, нехватка штук или другая редкость — отказ, ничего не снято", async () => {
    const few = await load({ "a:0": { rarity: "common", count: 1 } }, []);
    await expect(
      few.spendArt("w", "acc", "art_any_common", 3, "r", { artGroups: groups }),
    ).rejects.toThrow("market.art_rarity_none");
    expect(few.calls.some((c) => c.fn === "take")).toBe(false);

    const wrong = await load(
      { "a:0": { rarity: "common", count: 2 }, "b:100": { rarity: "epic", count: 1 } },
      [],
    );
    await expect(
      wrong.spendArt("w", "acc", "art_any_common", 3, "r", { artGroups: groups }),
    ).rejects.toThrow("market.art_rarity_wrong");
    expect(wrong.calls.some((c) => c.fn === "take")).toBe(false);
  });

  it("снять не удалось (перехватила соседняя вкладка) — отказ", async () => {
    const { spendArt } = await load(
      { "a:0": { rarity: "common", count: 2 }, "b:100": { rarity: "common", count: 1 } },
      null,
    );
    await expect(
      spendArt("w", "acc", "art_any_common", 3, "r", { artGroups: groups }),
    ).rejects.toThrow("market.art_rarity_none");
  });
});
