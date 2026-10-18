// Снять героя с грядки издалека — даром, но с отдыхом (владелец 29.09.2026):
// отдых ложится тем же оператором, что и снятие, — ровно тогда, когда героя
// сняли, и ровно один раз при любых повторах моста и нажатия.
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
import { FIELD_RECALL_REST_MS } from "@/lib/fieldRecall";

const { recallHeroFromField } = await import("./field-recall");
const recall = recallHeroFromField as unknown as (a: {
  data: { heroId: string; op: string };
}) => Promise<{ repeat: boolean; rested: boolean; heroName: string | null; at: unknown }>;
const go = (op = "op1abc") => recall({ data: { heroId: "hero_w", op } });
const CLAIM = "rcl:acc_me:op1abc";
const RESTED = { heroId: "hero_w", ms: FIELD_RECALL_REST_MS };

beforeEach(resetFake);

describe("recallHeroFromField: даром, с отдыхом", () => {
  it("издалека: герой снят, отдыхает 3 часа, хвост выдан, карта оповещена", async () => {
    const res = await go();
    expect(res).toMatchObject({
      repeat: false,
      rested: true,
      heroName: "Воин",
      at: { q: 30, r: 90 },
    });
    expect(FIELD_RECALL_REST_MS).toBe(3 * 3600_000);
    expect(s.worker.heroId).toBeNull();
    expect(s.rest).toEqual(RESTED);
    expect(s.dust).toBe(1);
    expect(s.published).toBe(1);
  });

  it("основной на грядке, сняли издалека — отдыхает и больше не основной", async () => {
    await expect(go()).resolves.toMatchObject({ rested: true });
    // Отметка основного снимается тем же оператором, что и отдых, а кэш силы
    // героя сброшен: отдыхающим не ходят и не дерутся.
    expect(s.deselected).toBe(true);
    expect(s.powerReset).toBe(1);
  });

  it("чужой герой — отказ до всего остального", async () => {
    s.hero.owner = "acc_other";
    await expect(go()).rejects.toThrow("braid.field_recall_not_yours");
    expect(s.journal.size).toBe(0);
    expect(s.rest).toBeNull();
  });

  it("герой не на грядке — отказ, отдыха нет, ключ отпущен", async () => {
    s.worker.heroId = null;
    await expect(go()).rejects.toThrow("braid.field_recall_free");
    expect(s.rest).toBeNull();
    expect(s.journal.has(CLAIM)).toBe(false);
  });

  it("снятие сорвалось до записи — «попробуй ещё», герой на месте, не отдыхает", async () => {
    s.casThrows = true;
    await expect(go()).rejects.toThrow("braid.field_recall_retry");
    expect(s.worker.heroId).toBe("hero_w");
    expect(s.rest).toBeNull();
    expect(s.journal.has(CLAIM)).toBe(false);
    expect(s.published).toBe(0);
  });

  it("ответ потерялся уже после коммита — герой снят и отдыхает", async () => {
    s.casCommitThenThrow = true;
    await expect(go()).resolves.toMatchObject({ repeat: false, rested: true });
    expect(s.worker.heroId).toBeNull();
    expect(s.rest).toEqual(RESTED);
  });

  it("повтор моста после снятия узнаёт свой ключ: хвост и отдых — по разу", async () => {
    s.casRetryAfterCommit = true;
    await expect(go()).resolves.toMatchObject({ repeat: false, rested: true });
    expect(s.dust).toBe(1);
    expect(s.restWrites).toBe(1);
  });

  it("повтор догнал незакрытую первую попытку — ключ найден отдельным чтением", async () => {
    s.casStaleSnapshot = true;
    await expect(go()).resolves.toMatchObject({ repeat: false, rested: true });
    expect(s.dust).toBe(1);
    expect(s.restWrites).toBe(1);
  });

  it("повтор с тем же op — ничего второй раз", async () => {
    await go();
    await expect(go()).resolves.toMatchObject({ repeat: true, rested: false });
    expect(s.restWrites).toBe(1);
    expect(s.published).toBe(1);
  });

  it("два запроса с одним op разом — одно снятие", async () => {
    const [a, b] = await Promise.all([go(), go()]);
    expect([a.repeat, b.repeat].sort()).toEqual([false, true]);
    expect(s.restWrites).toBe(1);
  });
});
