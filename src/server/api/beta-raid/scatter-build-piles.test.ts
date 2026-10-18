// Сборка плана раздачи: КУЧКИ (сундуки, монетки) и артефакты-объекты.
//
// У кучек два тонких места. Первое — потолок шаблона: монетка с проектным
// номиналом 10 не должна набрать миллионы. Второе — пустое поле «сколько»: оно
// значит не ноль, а «посчитай от фонда», и на большом фонде счёт обязан
// упираться в потолок группы, а не просить сто миллионов заготовок.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PER_GROUP } from "@/lib/raid/scatterPlan";
import { seeded } from "@/test/seeded";
import { answerTplSql, emptyPlan, pileCfg, type FakeTables } from "@/test/scatterFixtures";

const db = vi.hoisted(() => ({ tables: {} as FakeTables }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: (sql: string) => Promise.resolve(answerTplSql(sql, db.tables)),
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

const { buildScatter } = await import("./scatter-build");

const DARAI = { kind: "token" as const, token: "Darai", amount: 500 };
/** Монетка с номиналом 10 и монетка с номиналом 100 — разные потолки. */
const coins = [
  { id: "c10", land: "grass", cfg: pileCfg("token", "Darai", 10) },
  { id: "c100", land: null, cfg: pileCfg("token", "Darai", 100) },
];

/** Мухомор с боевой карты: номинал 0,1 USDT — на нём раздача и споткнулась. */
const usdtCoins = [{ id: "cUsdt", land: null, cfg: pileCfg("token", "USDT", 0.1) }];
const USDT = { kind: "token" as const, token: "USDT", amount: 250 };

const sumOf = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
const amountsOf = (
  drafts: { objectConfig: { rewardConfig: { fillers: { amount: number }[] } } | null }[],
) => drafts.flatMap((d) => (d.objectConfig?.rewardConfig.fillers ?? []).map((f) => f.amount));

async function coinsBuild(patch: Partial<ReturnType<typeof emptyPlan>["coins"]>) {
  const plan = emptyPlan();
  plan.coins = { ...plan.coins, enabled: true, count: 20, funds: [DARAI], ...patch };
  const builds = await buildScatter(plan);
  return builds.find((b) => b.group === "coin") ?? { group: "coin", drafts: [], notes: [] };
}

beforeEach(() => {
  db.tables = { coin: coins };
  vi.spyOn(Math, "random").mockImplementation(seeded(77));
});
afterEach(() => vi.restoreAllMocks());

describe("buildScatter: кучки", () => {
  it("фонд не превышен, а номинал не выше потолка шаблона", async () => {
    const { drafts } = await coinsBuild({ count: 20 });
    expect(drafts).toHaveLength(20);
    let placed = 0;
    for (const d of drafts) {
      // Вид у монетки и сундука общий, поэтому и префикс общий: chest:<шаблон>.
      expect(d.objectId.startsWith("chest:"), d.objectId).toBe(true);
      expect(d.objectConfig, `${d.objectId} без своей награды`).not.toBeNull();
      const cap = d.objectId === "chest:c10" ? 10 : 100;
      for (const f of d.objectConfig?.rewardConfig.fillers ?? []) {
        expect(
          f.amount,
          `${d.objectId}: номинал ${f.amount} выше потолка ${cap}`,
        ).toBeLessThanOrEqual(cap);
        expect(f.amount).toBeGreaterThanOrEqual(1);
        placed += f.amount;
      }
    }
    expect(placed).toBeLessThanOrEqual(DARAI.amount + 1e-9);
    expect(placed).toBeGreaterThan(0);
  });

  it("шаблон без этой валюты в её раздаче не участвует", async () => {
    // Нулевой потолок rollPiles читает как «потолка нет», и монетка с
    // номиналом 10 набрала бы миллионы. Значит такие шаблоны просто без денег.
    db.tables = { coin: [coins[0], { id: "cLikes", land: null, cfg: pileCfg("likes", null, 50) }] };
    const build = await coinsBuild({ count: 20 });
    const rich = build.drafts.filter((d) => (d.objectConfig?.rewardConfig.fillers.length ?? 0) > 0);
    expect(rich.length).toBeGreaterThan(0);
    expect(rich.every((d) => d.objectId === "chest:c10")).toBe(true);
    expect(build.drafts.length).toBe(20);
    expect(build.notes.join(" ")).toContain("прописан не у всех шаблонов");
  });

  it("валюты нет ни у одного шаблона — раздаём всем и без потолка", async () => {
    // Фонд админ вписал осознанно: молча его не разложить хуже, чем разложить
    // крупно.
    db.tables = { coin: [{ id: "cLikes", land: null, cfg: pileCfg("likes", null, 50) }] };
    const { drafts } = await coinsBuild({
      count: 5,
      funds: [{ kind: "token", token: "USDT", amount: 1_000 }],
    });
    const amounts = drafts.flatMap((d) =>
      (d.objectConfig?.rewardConfig.fillers ?? []).map((f) => f.amount),
    );
    expect(amounts).toHaveLength(5);
    expect(sumOf(amounts)).toBeLessThanOrEqual(1_000 + 1e-9);
  });

  it("пустое «сколько» считается от фонда и говорит об этом", async () => {
    const build = await coinsBuild({
      count: null,
      funds: [{ kind: "token", token: "Darai", amount: 45_000 }],
    });
    // 45 000 / 10 000 = 4,5 → четыре кучки: лучше покрупнее, чем лишняя пылинка.
    expect(build.drafts).toHaveLength(4);
    expect(build.notes.join(" ")).toContain("число посчитано от фонда");
  });

  it("автосчёт упирается в потолок группы, а не роняет предпросмотр", async () => {
    const build = await coinsBuild({
      count: null,
      funds: [{ kind: "token", token: "Darai", amount: 6e7 }],
    });
    expect(build.drafts).toHaveLength(MAX_PER_GROUP);
    expect(build.notes.join(" ")).toContain("следующим заходом");
  });

  it("подходящих шаблонов нет — пусто и сказано вслух", async () => {
    db.tables = { coin: [] };
    const build = await coinsBuild({ count: 10 });
    expect(build.drafts).toHaveLength(0);
    expect(build.notes.join(" ")).toContain("подходящих шаблонов не нашлось");
  });

  it("сундуки и монетки — разные группы одного вида шаблонов", async () => {
    db.tables = { coin: coins, chest: [{ id: "ch1", land: "swamp", cfg: null }] };
    const plan = emptyPlan();
    plan.coins = { ...plan.coins, enabled: true, count: 3, funds: [DARAI] };
    plan.chests = { ...plan.chests, enabled: true, count: 2, funds: [] };
    const builds = await buildScatter(plan);
    expect(builds.map((b) => b.group)).toEqual(["chest", "coin"]);
    expect(builds[0].drafts.every((d) => d.objectId === "chest:ch1")).toBe(true);
    expect(builds[0].drafts.every((d) => d.terrainId === "swamp")).toBe(true);
    expect(builds[1].drafts).toHaveLength(3);
  });
});

describe("buildScatter: артефакты-объекты", () => {
  it("ставятся штучно и своей награды не получают", async () => {
    db.tables = { art: [{ id: "a1", land: "rainbow" }] };
    const plan = emptyPlan();
    plan.artifacts = { ...plan.artifacts, enabled: true, count: 7, rarities: ["rare"] };
    const build = (await buildScatter(plan))[0];
    expect(build.drafts).toHaveLength(7);
    for (const d of build.drafts) {
      expect(d.objectId).toBe("artifact:a1");
      // Артефакт отдаёт сам себя: своя награда ему не нужна и вредна.
      expect(d.objectConfig).toBeNull();
      expect(d.terrainId).toBe("rainbow");
    }
  });

  it("шаблонов нет — ноль объектов, а не ноль без объяснений", async () => {
    db.tables = { art: [] };
    const plan = emptyPlan();
    plan.artifacts = { ...plan.artifacts, enabled: true, count: 7 };
    const build = (await buildScatter(plan))[0];
    expect(build.drafts).toHaveLength(0);
    expect(build.notes.join(" ")).toContain("подходящих шаблонов не нашлось");
  });
});

describe("buildScatter: дробный токен и среднее значение", () => {
  it("250 USDT при номинале шаблона 0,1 раскладываются, а не пропадают", async () => {
    // Боевой случай: фонд назначили, а не создалось ни одной кучки — счёт
    // требовал номинал не меньше единицы, и потолок 0,1 не проходил.
    db.tables = { coin: usdtCoins };
    const build = await coinsBuild({ count: null, point: 0.1, funds: [USDT] });
    expect(build.drafts.length, "ни одной кучки на 250 USDT").toBeGreaterThan(0);
    const amounts = amountsOf(build.drafts);
    expect(amounts).toHaveLength(build.drafts.length);
    for (const v of amounts) {
      expect(v, `номинал ${v} выше потолка шаблона`).toBeLessThanOrEqual(0.1);
      expect(v, `номинал ${v} мельче копейки`).toBeGreaterThanOrEqual(0.01);
    }
    expect(sumOf(amounts)).toBeLessThanOrEqual(USDT.amount + 1e-9);
    expect(build.notes.join(" ")).toContain("число посчитано от фонда и среднего значения");
  });

  it("заданы все три поля — фонд остаётся жёстким потолком", async () => {
    // 5 000 кучек по 0,1 из фонда 250 не выходит: часть не встанет, и это
    // обязано попасть в отчёт числом, а не тихо ужать номиналы до пыли.
    db.tables = { coin: usdtCoins };
    const build = await coinsBuild({ count: 5000, point: 0.1, funds: [USDT] });
    expect(build.drafts.length).toBeGreaterThan(0);
    expect(build.drafts.length).toBeLessThan(5000);
    expect(sumOf(amountsOf(build.drafts))).toBeLessThanOrEqual(USDT.amount + 1e-9);
    expect(build.notes.join(" ")).toContain("не поставили");
  });

  it("среднее значение при двух фондах не применяется — и это сказано вслух", async () => {
    // Одна точка на Darai и USDT сразу — это либо копейки, либо тысячи.
    db.tables = { coin: [...coins, ...usdtCoins] };
    const build = await coinsBuild({ count: 10, point: 0.1, funds: [DARAI, USDT] });
    expect(build.drafts).toHaveLength(10);
    expect(build.notes.join(" ")).toContain("не применили");
  });
});

describe("buildScatter: кучки открываются одним тапом", () => {
  it("сундукам и монеткам раздача пишет maxHp 1 и цену в одну энергию", async () => {
    // Пишем на клетку (cell-override), а не в шаблон: шаблоны админ настраивал
    // руками, и правка задела бы все уже стоящие объекты.
    db.tables = { coin: coins, chest: [{ id: "ch1", land: null, cfg: null }] };
    const plan = emptyPlan();
    plan.coins = { ...plan.coins, enabled: true, count: 3, funds: [DARAI] };
    plan.chests = { ...plan.chests, enabled: true, count: 2, funds: [] };
    const builds = await buildScatter(plan);
    const piles = builds.flatMap((b) => b.drafts);
    expect(piles).toHaveLength(5);
    for (const d of piles) {
      expect(d.objectConfig?.maxHp, `${d.objectId}: не один тык`).toBe(1);
      expect(d.objectConfig?.interactionCost, `${d.objectId}: не одна энергия`).toBe(1);
    }
  });

  it("боссам ничего такого не приписывается — у них свой бой", async () => {
    db.tables = { boss: [{ id: "b1", land: null, level: 5, reward_tiers: null }] };
    const plan = emptyPlan();
    plan.boss = { ...plan.boss, enabled: true, count: 2 };
    const build = (await buildScatter(plan))[0];
    expect(build.drafts).toHaveLength(2);
    for (const d of build.drafts) {
      expect(d.objectConfig?.maxHp).toBeUndefined();
      expect(d.objectConfig?.interactionCost).toBeUndefined();
    }
  });
});
