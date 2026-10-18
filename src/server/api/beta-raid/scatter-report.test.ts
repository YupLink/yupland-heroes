// Отчёт раздачи: «на карту поступило». Считается по ФАКТИЧЕСКИ разложенным, и
// это главное, что здесь проверяется: обещать в отчёте то, чего на карте нет,
// нельзя — под этим числом дальше сверяют остаток кошелька.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScatterDraft } from "./scatter-build";

const db = vi.hoisted(() => ({ names: [] as Array<{ id: string; name: string }>, fail: false }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: () => (db.fail ? Promise.reject(new Error("мост молчит")) : Promise.resolve(db.names)),
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

const { tokensOf, tallyResources } = await import("./scatter-report");

type Filler = {
  kind: "token" | "likes" | "energy" | "tickets";
  amount: number;
  token: string | null;
};

const boss = (fillers: Filler[], packs: string[] = [], items: string[] = []): ScatterDraft => ({
  group: "boss",
  objectId: "boss:b1",
  terrainId: null,
  objectConfig: {
    rewardConfig: {
      fillers,
      split: [100],
      packs: packs.map((packId) => ({ packId, toPlace: 1 })),
      items: items.map((itemTemplateId) => ({ itemTemplateId, toPlace: 1 })),
    },
  },
});

const artifact = (id: string): ScatterDraft => ({
  group: "artifact",
  objectId: `artifact:${id}`,
  terrainId: null,
  objectConfig: null,
});

const darai = (amount: number): Filler => ({ kind: "token", amount, token: "Darai" });

beforeEach(() => {
  db.names = [];
  db.fail = false;
});

describe("tokensOf", () => {
  it("считает только вид token", async () => {
    const out = tokensOf([
      boss([darai(100), { kind: "likes", amount: 900, token: null }]),
      boss([{ kind: "tickets", amount: 5, token: "USDT" }]),
    ]);
    expect(out).toEqual([{ symbol: "Darai", amount: 100 }]);
  });

  it("регистр символа не плодит вторую монету", async () => {
    const out = tokensOf([
      boss([darai(10)]),
      boss([{ kind: "token", amount: 5, token: "darai" }]),
      boss([{ kind: "token", amount: 1, token: " Darai " }]),
    ]);
    // Наружу отдаём написание, встреченное первым: им подписан кошелёк.
    expect(out).toEqual([{ symbol: "Darai", amount: 16 }]);
  });

  it("токен без символа и объект без награды пропускаются", async () => {
    const out = tokensOf([
      boss([{ kind: "token", amount: 50, token: "" }]),
      boss([{ kind: "token", amount: 50, token: null }]),
      artifact("a1"),
    ]);
    expect(out).toHaveLength(0);
  });

  it("копейки float-сложения не превращают 1000 в 1000.0000001", async () => {
    const out = tokensOf(Array.from({ length: 10 }, () => boss([darai(0.1)])));
    expect(out[0].amount).toBe(1);
  });
});

describe("tallyResources", () => {
  it("валюты подписаны по-человечески, токен — своим символом", async () => {
    const rows = await tallyResources([
      boss([darai(1000.005), { kind: "likes", amount: 40, token: null }]),
      boss([{ kind: "energy", amount: 3, token: null }]),
    ]);
    expect(rows).toEqual([
      { label: "Darai", amount: 1000.01 },
      { label: "Лайки", amount: 40 },
      { label: "Энергия", amount: 3 },
    ]);
  });

  it("считает по разложенному, а не по заказанному", async () => {
    // Заказали десять боссов с Darai, клеток хватило на четыре — в отчёт идут
    // четыре. Обещать десять значит обещать деньги, которых на карте нет.
    const ordered = Array.from({ length: 10 }, () => boss([darai(25)], ["cp_x"]));
    const placed = ordered.slice(0, 4);
    const rows = await tallyResources(placed);
    expect(rows.find((r) => r.label === "Darai")?.amount).toBe(100);
    expect(rows.find((r) => r.label.startsWith("Пак"))?.amount).toBe(4);
  });

  it("паки и артефакты подписаны названиями из базы", async () => {
    db.names = [
      { id: "cp_x", name: "Золотой пак" },
      { id: "it_1", name: "Меч" },
    ];
    const rows = await tallyResources([boss([], ["cp_x", "cp_x"], ["it_1"]), artifact("it_1")]);
    // Артефакт-объект и артефакт в награде босса — одна строка: с точки зрения
    // «что зашло на карту» это один и тот же предмет. Порядок — по количеству,
    // при равенстве по алфавиту.
    expect(rows).toEqual([
      { label: "Артефакт «Меч»", amount: 2 },
      { label: "Пак «Золотой пак»", amount: 2 },
    ]);
  });

  it("названия не приехали — в отчёте технический id, а не пустота", async () => {
    db.fail = true;
    const rows = await tallyResources([boss([], ["cp_x"])]);
    expect(rows).toEqual([{ label: "Пак «cp_x»", amount: 1 }]);
  });

  it("нули и минусы в отчёт не попадают", async () => {
    const rows = await tallyResources([
      boss([{ kind: "likes", amount: 0, token: null }, darai(-5)], [], []),
    ]);
    expect(rows).toHaveLength(0);
  });
});
