// Выдача выпавшего «куда надо»: в «Добычу» — только «бытовой» отказ стопки
// (нет героя/места), любой сбой — строка ждёт повторного ввода теми же
// ключами; отметка не легла — заход падает, активация не закрыта; обрыв
// посреди выдачи доделывается без второй выдачи.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closed, fresh, line, marks, redeem, resetPromoFake, s } from "./promo.fake";

vi.mock("@tanstack/react-start", async () => (await import("./promo.fake")).serverFn);
vi.mock("@/server/auth", async () => (await import("./promo.fake")).auth);
vi.mock("@/server/maintenance", async () => (await import("./promo.fake")).maintenance);
vi.mock("@/server/rateGate", async () => (await import("./promo.fake")).rateGate);
vi.mock("@/server/db/pg", async () => (await import("./promo.fake")).pgMod);
vi.mock("@/server/api/user-shared", async () => (await import("./promo.fake")).userShared);
vi.mock("@/server/db/mcpClient", async () => (await import("./promo.fake")).mcp);
vi.mock("@/server/api/gifts-deliver", async () => (await import("./promo.fake")).gifts);
vi.mock("@/server/api/beta-raid/stack-deposit", async () => (await import("./promo.fake")).stack);
vi.mock("@/server/api/beta-raid/reward-queue", async () => (await import("./promo.fake")).queue);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await import("./promo.fake")).where);

beforeEach(resetPromoFake);
const wheres = (r: { items: Array<{ where: string }> }) => r.items.map((i) => i.where);

describe("куда легло", () => {
  it("ресурс и токен — на счёт подарочной выдачей, товар — в рюкзак; всё отмечено", async () => {
    s.redeem = fresh([
      line(0, "resource", 250, "gold"),
      line(1, "token", 25000, "Darai"),
      line(2, "custom", 12, "cst_wheat"),
    ]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["balance", "balance", "backpack"]);
    expect(s.gifts.map((g) => g.id)).toEqual(["promo_prd_x_0", "promo_prd_x_1"]);
    expect(s.gifts[0]).toMatchObject({ kind: "resource", amount: 250, ref_id: "gold" });
    expect(s.stacks).toEqual([
      { kind: "custom", ref: "cst_wheat", qty: 12, nonce: "promo:prd_x:2" },
    ]);
    expect(marks()).toHaveLength(3);
    expect(closed()).toBe(true);
    expect(s.queued).toHaveLength(0);
  });

  it("бокс — в инвентарь", async () => {
    s.redeem = fresh([line(0, "pack", 3, "mp_autumn")]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["inventory"]);
  });
});

describe("«Добыча» — только бытовой отказ стопки", () => {
  it("рюкзак полон — в «Добычу» ключом строки, без метки, источник «promo»", async () => {
    s.stackFail = "market.backpack_need:1:0";
    s.redeem = fresh([line(0, "boss", 2, "boss_yeti")]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["harvest"]);
    expect(s.queued).toEqual([
      expect.objectContaining({
        account: "acc_1",
        mapId: "map_1",
        sourceName: "promo",
        kind: "boss",
        amount: 2,
        packId: "boss_yeti",
        key: "promo:prd_x:0",
        unlabeled: true,
      }),
    ]);
    expect(marks()[0]).toContain("'harvest'");
    expect(closed()).toBe(true);
  });

  it("нет героя — тоже «Добыча»", async () => {
    s.stackFail = "market.need_hero";
    s.redeem = fresh([line(0, "custom", 3, "cst_wheat")]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["harvest"]);
  });

  it("сбой стопки (не бытовой) — не в «Добычу»: ждёт, активация открыта", async () => {
    s.stackFail = "MCP POST 502";
    s.redeem = fresh([line(0, "custom", 3, "cst_wheat")]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["pending"]);
    expect(s.queued).toHaveLength(0);
    expect(marks()).toHaveLength(0);
    expect(closed()).toBe(false);
  });

  it("сбой бокса посреди штук — не в «Добычу» (выданные штуки легли бы дважды)", async () => {
    s.giftFail = "MCP POST 502";
    s.redeem = fresh([line(0, "pack", 3, "mp_autumn"), line(1, "likes", 50)]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["pending", "pending"]);
    expect(s.queued).toHaveLength(0);
    expect(closed()).toBe(false);
  });

  it("сбой токена — ждёт повторного ввода", async () => {
    s.giftFail = "MCP POST 502";
    s.redeem = fresh([line(0, "token", 100, "Darai")]);
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["pending"]);
    expect(closed()).toBe(false);
  });
});

describe("отметки и повтор", () => {
  it("отметка не легла — заход падает, активация не закрыта", async () => {
    s.markFail = true;
    s.redeem = fresh([line(0, "resource", 5, "gold")]);
    await expect(redeem({ code: "AUTUMN" })).rejects.toThrow("MCP POST 502");
    expect(closed()).toBe(false);
  });

  it("обрыв посреди выдачи: доделывается недоставленное теми же ключами", async () => {
    s.redeem = {
      ...fresh([line(0, "likes", 50), line(1, "pack", 2, "mp_autumn")]),
      was: true,
      same_op: false,
      delivered: { "0": "balance" },
    };
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["balance", "inventory"]);
    // Отмеченная строка не выдаётся; бокс — тем же id подарка (ключи штук прежние).
    expect(s.gifts.map((g) => g.id)).toEqual(["promo_prd_x_1"]);
    expect(closed()).toBe(true);
  });

  it("неотмеченная стопка уже в «Добыче» — ни рюкзака, ни второй строки «Добычи»", async () => {
    s.harvestN = 1;
    s.redeem = {
      ...fresh([line(0, "custom", 2, "cst_wheat")]),
      was: true,
      same_op: true,
    };
    expect(wheres(await redeem({ code: "AUTUMN" }))).toEqual(["harvest"]);
    expect(s.stacks).toHaveLength(0);
    expect(s.queued).toHaveLength(0);
    expect(closed()).toBe(true);
  });
});
