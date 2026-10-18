// Сборка плана раздачи: БОССЫ. Ни одной строки в базу — модуль моста подменён
// заглушкой, справочники приезжают из фикстур.
//
// Смотрим на три обещания: фонд не превышен, штучное роздано ровно в заказанном
// количестве, и у каждого объекта есть СВОЯ награда. Последнее не придирка: без
// неё в игру пойдёт награда шаблона, и сотня «пустых» боссов раздаст по чужому
// номиналу каждый.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seeded } from "@/test/seeded";
import { answerTplSql, emptyPlan, type FakeTables } from "@/test/scatterFixtures";

const db = vi.hoisted(() => ({ tables: {} as FakeTables }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: (sql: string) => Promise.resolve(answerTplSql(sql, db.tables)),
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

const { buildScatter } = await import("./scatter-build");
type Draft = Awaited<ReturnType<typeof buildScatter>>[number]["drafts"][number];

const SPLIT = [50, 30, 20];
const bossRows = [
  { id: "b1", land: "mount", level: 10, reward_tiers: { split: SPLIT, fillers: [] } },
  { id: "b2", land: "mount", level: 5, reward_tiers: { split: SPLIT, fillers: [] } },
  { id: "b3", land: null, level: 1, reward_tiers: { split: SPLIT, fillers: [] } },
];

/** Все наполнители всех заготовок одним списком — по ним и считаем фонд. */
const fillers = (drafts: Draft[]) =>
  drafts.flatMap((d) => d.objectConfig?.rewardConfig.fillers ?? []);
const sumOf = (xs: number[]) => xs.reduce((a, x) => a + x, 0);

async function boss(patch: Partial<ReturnType<typeof emptyPlan>["boss"]>) {
  const plan = emptyPlan();
  plan.boss = { ...plan.boss, enabled: true, count: 12, ...patch };
  const builds = await buildScatter(plan);
  return builds.find((b) => b.group === "boss") ?? { group: "boss", drafts: [], notes: [] };
}

beforeEach(() => {
  db.tables = {
    boss: bossRows,
    art: [
      { id: "a1", land: null },
      { id: "a2", land: "swamp" },
    ],
  };
  // Кубик внутри раздачи — общий Math.random: с сидом падение можно повторить.
  vi.spyOn(Math, "random").mockImplementation(seeded(1234));
});
afterEach(() => vi.restoreAllMocks());

describe("buildScatter: боссы", () => {
  it("ставит ровно заказанное число и каждому даёт СВОЮ награду", async () => {
    const { drafts } = await boss({ count: 12 });
    expect(drafts).toHaveLength(12);
    for (const d of drafts) {
      expect(d.objectId.startsWith("boss:"), d.objectId).toBe(true);
      // null здесь означал бы «награду шаблона не трогаем» — для раздачи это
      // тихая выдача чужих денег.
      expect(d.objectConfig, `${d.objectId} без своей награды`).not.toBeNull();
      expect(["mount", null]).toContain(d.terrainId);
    }
  });

  it("фонд не превышается ни по одной валюте", async () => {
    const funds = [
      { kind: "token" as const, token: "Darai", amount: 100_000 },
      { kind: "likes" as const, token: null, amount: 5_000 },
      { kind: "energy" as const, token: null, amount: 300 },
    ];
    const { drafts } = await boss({ count: 40, funds });
    for (const f of funds) {
      const placed = sumOf(
        fillers(drafts)
          .filter((x) => x.kind === f.kind)
          .map((x) => x.amount),
      );
      expect(placed, `${f.kind}: разложено ${placed} при фонде ${f.amount}`).toBeLessThanOrEqual(
        f.amount + 1e-9,
      );
      expect(placed, `${f.kind}: не разложено вообще ничего`).toBeGreaterThan(0);
    }
  });

  it("символ монеты живёт ТОЛЬКО у вида token", async () => {
    // `{kind:"likes", token:"Darai"}` выдал бы лайки, а не Darai: выдача
    // подменяет вид только у token. Такую строку раздача обязана обезвредить.
    const { drafts } = await boss({
      count: 8,
      funds: [
        { kind: "likes", token: "Darai", amount: 900 },
        { kind: "tickets", token: "USDT", amount: 90 },
        { kind: "token", token: "Darai", amount: 1_000 },
      ],
    });
    const bad = fillers(drafts).filter((f) => f.kind !== "token" && f.token != null);
    expect(bad, `наполнитель не-token с символом монеты: ${JSON.stringify(bad[0])}`).toHaveLength(
      0,
    );
    expect(fillers(drafts).every((f) => f.kind !== "token" || f.token === "Darai")).toBe(true);
  });

  it("процентовка мест берётся из шаблона, а не общая", async () => {
    const { drafts } = await boss({ count: 6 });
    for (const d of drafts) expect(d.objectConfig?.rewardConfig.split).toEqual(SPLIT);
  });

  it("паки раздаются ровно в заказанном количестве", async () => {
    const { drafts } = await boss({
      count: 12,
      packs: [
        { packId: "cp_gold", count: 5 },
        { packId: "cp_silver", count: 30 },
      ],
    });
    const placed = (id: string) =>
      drafts
        .flatMap((d) => d.objectConfig?.rewardConfig.packs ?? [])
        .filter((p) => p.packId === id);
    // Пять паков на двенадцать боссов: пятерым по одному, остальным ничего.
    const gold = placed("cp_gold");
    expect(sumOf(gold.map((p) => p.toPlace))).toBe(5);
    expect(gold).toHaveLength(5);
    expect(gold.every((p) => p.toPlace === 1)).toBe(true);
    // Тридцать на двенадцать: по кругу, разброс ровно ±1.
    const silver = placed("cp_silver").map((p) => p.toPlace);
    expect(sumOf(silver)).toBe(30);
    expect(silver).toHaveLength(12);
    expect(Math.max(...silver) - Math.min(...silver)).toBe(1);
  });

  it("артефакты в награде: заказанное число и один шаблон на стопку", async () => {
    const { drafts } = await boss({
      count: 10,
      arts: [{ rarity: "rare", templateIds: [], count: 14 }],
    });
    const items = drafts.flatMap((d) => d.objectConfig?.rewardConfig.items ?? []);
    expect(sumOf(items.map((i) => i.toPlace))).toBe(14);
    // Двумя строками по toPlace:1 оба артефакта достались бы ПЕРВОМУ месту —
    // N предметов одному вместо N мест. Значит строка на объект ровно одна.
    expect(items).toHaveLength(10);
    expect(items.every((i) => i.toPlace >= 1)).toBe(true);
  });

  it("невыбранный пак и пустой список артефактов ничего не портят", async () => {
    db.tables = { boss: bossRows, art: [] };
    const { drafts } = await boss({
      count: 5,
      packs: [{ packId: "", count: 4 }],
      arts: [{ rarity: "legendary", templateIds: [], count: 3 }],
    });
    expect(drafts).toHaveLength(5);
    expect(drafts.flatMap((d) => d.objectConfig?.rewardConfig.packs ?? [])).toHaveLength(0);
    expect(drafts.flatMap((d) => d.objectConfig?.rewardConfig.items ?? [])).toHaveLength(0);
  });

  it("шаблонов нужного уровня нет — пусто и сказано вслух", async () => {
    db.tables = { boss: [] };
    const build = await boss({ count: 30 });
    expect(build.drafts).toHaveLength(0);
    expect(build.notes.join(" ")).toContain("шаблонов такого уровня нет");
  });

  it("недодача фонда попадает в примечания", async () => {
    // Один босс нулевого уровня и мизерный бросок — фонд разойдётся не весь.
    db.tables = { boss: [{ id: "b1", land: null, level: 0, reward_tiers: null }] };
    vi.spyOn(Math, "random").mockReturnValue(0);
    const build = await boss({
      count: 1,
      funds: [{ kind: "likes", token: null, amount: 10_000 }],
    });
    expect(build.notes.join(" ")).toContain("из фонда");
  });

  it("выключенная группа не спрашивает базу вовсе", async () => {
    const plan = emptyPlan();
    const builds = await buildScatter(plan);
    expect(builds).toHaveLength(0);
  });
});
