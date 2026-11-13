// Снятие с грядки издалека: гонки (два нажатия, снятие рядом, смена героя) и
// случаи без отдыха — у самой грядки и когда грядки больше нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => (await import("./field-recall.fake")).reactStart);
vi.mock("../currency/move", async () => (await import("./field-recall.fake")).move);
vi.mock("../../db/mcpClient", async () => (await import("./field-recall.fake")).mcp);
vi.mock("./encounter-where", async () => (await import("./field-recall.fake")).where);
vi.mock("./building-action", async () => (await import("./field-recall.fake")).building);
vi.mock("./field-settle", async () => (await import("./field-recall.fake")).settle);
vi.mock("./warehouse-store", async () => (await import("./field-recall.fake")).warehouse);
vi.mock("../../raidLive", async () => (await import("./field-recall.fake")).live);
vi.mock("./hero-power", async () => (await import("./field-recall.fake")).heroPower);
vi.mock("./field-reward", () => ({ giveFieldReward: async () => {} }));
vi.mock("./item-alias", () => ({ canonRef: async (_k: string, id: string) => id }));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("../../db/pg", () => ({ sb: {} }));

import { resetFake, s } from "./field-recall.fake";

const { recallHeroFromField } = await import("./field-recall");
const recall = recallHeroFromField as unknown as (a: {
  data: { heroId: string; op: string };
}) => Promise<{ repeat: boolean; rested: boolean }>;
const go = (op = "op1abc") => recall({ data: { heroId: "hero_w", op } });
const CLAIM = "rcl:acc_me:op1abc";

beforeEach(resetFake);

describe("recallHeroFromField: гонки", () => {
  it("два нажатия (разные op) подряд — второе видит свободного героя", async () => {
    await go("op1abc");
    await expect(go("op2abc")).rejects.toThrow("braid.field_recall_free");
    expect(s.restWrites).toBe(1);
  });

  it("два нажатия разом — снял один, отдых один, хвоста нет", async () => {
    const res = await Promise.allSettled([go("op1abc"), go("op2abc")]);
    expect(res.map((x) => x.status).sort()).toEqual(["fulfilled", "rejected"]);
    const lost = res.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain("braid.field_recall_free");
    expect(s.restWrites).toBe(1);
    expect(s.dust).toBe(0);
  });

  it("сняли рядом, пока шли проверки — «уже свободен», без отдыха, ключ отпущен", async () => {
    s.onField = () => void (s.worker.heroId = null);
    await expect(go()).rejects.toThrow("braid.field_recall_free");
    expect(s.rest).toBeNull();
    expect(s.dust).toBe(0);
    expect(s.journal.has(CLAIM)).toBe(false);
  });

  it("героя сменили на грядке между проверкой и снятием — чужого не снимаем и не усыпляем", async () => {
    s.onField = () => void (s.worker.heroId = "hero_other");
    await expect(go()).rejects.toThrow("braid.field_recall_free");
    expect(s.worker.heroId).toBe("hero_other");
    expect(s.rest).toBeNull();
  });
});

describe("recallHeroFromField: без отдыха", () => {
  it("стоя у самой грядки — как в её окне: снят, не отдыхает, хвоста нет", async () => {
    s.pos = { q: 31, r: 90 };
    await expect(go()).resolves.toMatchObject({ repeat: false, rested: false });
    expect(s.worker.heroId).toBeNull();
    expect(s.rest).toBeNull();
    // Без отдыха основной остаётся основным.
    expect(s.deselected).toBe(false);
    expect(s.dust).toBe(0);
    expect(s.published).toBe(1);
  });

  it("грядки больше нет — героя отпускаем без отдыха и без хвоста", async () => {
    s.field = false;
    await expect(go()).resolves.toMatchObject({ repeat: false, rested: false });
    expect(s.worker.heroId).toBeNull();
    expect(s.rest).toBeNull();
    expect(s.dust).toBe(0);
  });

  it("у грядки, а героя уже сняли — «уже свободен», ключ отпущен", async () => {
    s.pos = { q: 30, r: 90 };
    s.onField = () => void (s.worker.heroId = null);
    await expect(go()).rejects.toThrow("braid.field_recall_free");
    expect(s.journal.has(CLAIM)).toBe(false);
  });
});
