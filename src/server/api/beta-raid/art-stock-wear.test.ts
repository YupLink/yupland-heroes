// Износ живёт в самом артефакте и едет с ним: списание пишет его в памятку,
// откат возвращает предмет таким же; маркет и ломбард берут только целые.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sqls: string[] = [];
let reply: unknown[] = [];
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    return reply;
  },
}));

const { takeArtifacts, restoreArtifacts, listFreeArtifacts, grantArtifacts } =
  await import("./art-stock");
const { parseMemo } = await import("./art-memo");

beforeEach(() => {
  sqls.length = 0;
  reply = [];
});

describe("износ при передаче артефакта", () => {
  it("списание пишет износ в памятку и отдаёт его в квитанции", async () => {
    reply = [{ id: "it_1", templateId: "tpl_a", obtainedAt: "2026-10-01", wear: "37.5" }];
    const got = await takeArtifacts({
      account: "acc",
      wallet: "w",
      qty: 1,
      pick: { templateId: "tpl_a", wear: 37.5 },
      op: "gauclot:x",
    });
    expect(got).toEqual([
      { id: "it_1", templateId: "tpl_a", obtainedAt: "2026-10-01", wear: 37.5 },
    ]);
    expect(sqls[0]).toContain("u.wear = 37.5");
    expect(sqls[0]).toContain("|| '=' || g.wear::text");
  });

  it("откат возвращает тот же предмет с тем же износом — «починить» откатом нельзя", async () => {
    await restoreArtifacts({
      wallet: "w",
      account: "acc",
      arts: [
        { id: "it_1", templateId: "tpl_a", obtainedAt: null, wear: 62.5 },
        { id: "it_2", templateId: "tpl_a", obtainedAt: null },
      ],
    });
    expect(sqls[0]).toContain(
      "(id, wallet, account_id, template_id, kind, source, obtained_at, wear)",
    );
    expect(sqls[0]).toMatch(/'it_1'[\s\S]*now\(\), 62\.5\)/);
    expect(sqls[0]).toMatch(/'it_2'[\s\S]*now\(\), 0\)/);
  });

  it("памятка: новая строка несёт износ, строка до износа — целый (0)", () => {
    const p = "art:gauclot:x#";
    expect(
      parseMemo([`${p}it_1=tpl_a=2026-10-01 10:00:00.000000+00=37.50000000000000000000`], p),
    ).toEqual([
      { id: "it_1", templateId: "tpl_a", obtainedAt: "2026-10-01 10:00:00.000000+00", wear: 37.5 },
    ]);
    expect(parseMemo([`${p}it_2=tpl_b=2026-10-01`, `${p}it_3=tpl_c`], p)).toEqual([
      { id: "it_2", templateId: "tpl_b", obtainedAt: "2026-10-01", wear: 0 },
      { id: "it_3", templateId: "tpl_c", obtainedAt: null, wear: 0 },
    ]);
  });

  it("список свободных — группами по износу (своя полоса у каждой)", async () => {
    reply = [
      { templateId: "tpl_a", name: "Меч", imageUrl: null, rarity: "common", count: 2, wear: 12 },
    ];
    const list = await listFreeArtifacts("acc");
    expect(list[0]).toMatchObject({ templateId: "tpl_a", count: 2, wear: 12 });
    expect(sqls[0]).toContain("GROUP BY u.template_id, t.name, t.image_url, t.rarity, u.wear");
    expect(sqls[0]).not.toContain("u.wear = ");
  });
});

describe("маркет — только целые, ломбард — выбранную группу", () => {
  it("список для сдачи и оплата артефактом без выбора износа берут только wear = 0", async () => {
    await listFreeArtifacts("acc", "common", 0);
    expect(sqls[0]).toContain("u.wear = 0");

    sqls.length = 0;
    vi.resetModules();
    const calls: Array<{ fn: string; arg: unknown }> = [];
    vi.doMock("./art-stock", () => ({
      freeArtifactStat: async (_a: string, tpl: string, wear: number) => {
        calls.push({ fn: "stat", arg: { tpl, wear } });
        return { rarity: "common", count: 5 };
      },
      takeArtifacts: async (o: { pick: unknown }) => {
        calls.push({ fn: "take", arg: o.pick });
        return [{ id: "it_1", templateId: "tpl_a" }];
      },
    }));
    vi.doMock("./art-rarity", () => ({
      isArtAny: (t: string) => t.startsWith("art_any_"),
      artAnyRarity: (t: string) => t.replace("art_any_", ""),
    }));
    const { spendArt } = await import("./market-art-pay");
    await spendArt("w", "acc", "art_any_common", 1, "ref1", { artTemplateId: "tpl_a" });
    expect(calls).toEqual([
      { fn: "stat", arg: { tpl: "tpl_a", wear: 0 } },
      { fn: "take", arg: { templateId: "tpl_a", rarity: "common", wear: 0 } },
    ]);
  });

  it("скупка ломбарда снимает ровно выбранный износ — и сломанный (100)", async () => {
    vi.resetModules();
    const calls: Array<{ fn: string; arg: unknown }> = [];
    vi.doMock("./art-stock", () => ({
      freeArtifactStat: async (_a: string, tpl: string, wear: number) => {
        calls.push({ fn: "stat", arg: { tpl, wear } });
        return { rarity: "common", count: 1 };
      },
      takeArtifacts: async (o: { pick: unknown }) => {
        calls.push({ fn: "take", arg: o.pick });
        return [{ id: "it_1", templateId: "tpl_a", wear: 100 }];
      },
    }));
    vi.doMock("./art-rarity", () => ({
      isArtAny: (t: string) => t.startsWith("art_any_"),
      artAnyRarity: (t: string) => t.replace("art_any_", ""),
    }));
    const { spendArt } = await import("./market-art-pay");
    const r = await spendArt("w", "acc", "art_any_common", 1, "ref2", {
      artTemplateId: "tpl_a",
      artWear: 100,
    });
    expect(calls).toEqual([
      { fn: "stat", arg: { tpl: "tpl_a", wear: 100 } },
      { fn: "take", arg: { templateId: "tpl_a", rarity: "common", wear: 100 } },
    ]);
    // Квитанция несёт износ: сорвётся выплата — вернётся тот же сломанный.
    expect(r.paidArts).toEqual([{ id: "it_1", templateId: "tpl_a", wear: 100 }]);
  });
});

describe("перепродажа ломбарда — починенной", () => {
  it("покупатель получает новый экземпляр шаблона: износ не переносится (0 по умолчанию)", async () => {
    // Перепродажа ломбарда выставляет шаблон (market-pawn.relistPawned), выдача
    // идёт этим трактом: колонки износа в вставке нет — у строки он 0, как у новой.
    reply = [{ inserted: 1, already: 0 }];
    const n = await grantArtifacts({
      wallet: "w",
      account: "buyer",
      templateId: "tpl_a",
      qty: 1,
      nonce: "n1",
    });
    expect(n).toBe(1);
    const sql = sqls.at(-1) ?? "";
    expect(sql).toContain("(id, wallet, account_id, template_id, kind, source, obtained_at)");
    expect(sql).not.toContain("wear");
  });
});
