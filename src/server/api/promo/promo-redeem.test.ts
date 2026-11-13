// Ввод промокода: гейт и проверки до базы, ответ promo_redeem (в том числе
// «тот же Telegram с другого аккаунта»), закрытая активация — повтор карточки
// без единой выдачи. Выдача по строкам — promo-deliver.test.ts.
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

describe("до базы", () => {
  it("ключ нажатия обязателен и по форме; пустой код — отказ схемы", async () => {
    await expect(redeem({ code: "X", opId: "bad op" })).rejects.toThrow();
    await expect(redeem({ code: "" })).rejects.toThrow();
    expect(s.sql).toHaveLength(0);
  });

  it("без кошелька и без Telegram — ключи словаря, база не тронута", async () => {
    s.wallet = null;
    await expect(redeem({ code: "AUTUMN" })).rejects.toThrow("promo.err_no_wallet");
    s.wallet = "w1.tg";
    s.tg = null;
    await expect(redeem({ code: "AUTUMN" })).rejects.toThrow("promo.err_need_tg");
    expect(s.sql).toHaveLength(0);
    expect(s.gates).toEqual(["promo"]);
  });
});

describe("ответ базы", () => {
  it("код нормализуется; ключ нажатия — по аккаунту; Telegram — в базу числом", async () => {
    s.redeem = fresh([]);
    await redeem({ code: "  autumn " });
    expect(s.sql[0]).toContain("promo_redeem('AUTUMN', 'acc_1', 'w1.tg',");
    expect(s.sql[0]).toContain("'acc_1:op123456', 42::bigint)");
  });

  it("нет среди новых — not_found (профиль спросит коды на лайки)", async () => {
    s.redeem = { error: "not_found" };
    await expect(redeem({ code: "OLDLIKES" })).resolves.toEqual({ status: "not_found" });
  });

  it("миграцию ещё не накатили — тоже not_found, а не поломка старых кодов", async () => {
    s.redeemFail = "function yuplink.promo_redeem(unknown) does not exist";
    await expect(redeem({ code: "OLDLIKES" })).resolves.toEqual({ status: "not_found" });
  });

  it("выключен, закончился, тот же Telegram с другого аккаунта — ключи словаря", async () => {
    s.redeem = { error: "inactive" };
    await expect(redeem({ code: "A1B" })).rejects.toThrow("promo.err_inactive");
    s.redeem = { error: "exhausted" };
    await expect(redeem({ code: "A1B" })).rejects.toThrow("promo.err_exhausted");
    s.redeem = { error: "used" };
    await expect(redeem({ code: "A1B" })).rejects.toThrow("promo.err_used");
    expect(s.gifts).toHaveLength(0);
  });

  it("ничего не выпало — пустая карточка, активация закрыта", async () => {
    s.redeem = fresh([]);
    await expect(redeem({ code: "LUCKY" })).resolves.toEqual({
      status: "ok",
      code: "AUTUMN",
      items: [],
    });
    expect(closed()).toBe(true);
  });
});

describe("закрытая активация", () => {
  const done = (same: boolean) => ({
    ...fresh([line(0, "resource", 250, "gold"), line(1, "custom", 2, "cst_wheat")]),
    status: "done",
    was: true,
    same_op: same,
    delivered: { "0": "balance", "1": "harvest" },
  });

  it("тот же ключ нажатия — та же карточка, ни выдачи, ни отметок, ни «Добычи»", async () => {
    s.redeem = done(true);
    const res = await redeem({ code: "AUTUMN" });
    expect(res.items.map((i) => i.where)).toEqual(["balance", "harvest"]);
    expect(s.sql).toHaveLength(1);
    expect(s.gifts).toHaveLength(0);
    expect(s.stacks).toHaveLength(0);
    expect(s.queued).toHaveLength(0);
    expect(marks()).toHaveLength(0);
  });

  it("другим нажатием — «уже активирован»", async () => {
    s.redeem = done(false);
    await expect(redeem({ code: "AUTUMN" })).rejects.toThrow("promo.err_used");
    expect(s.sql).toHaveLength(1);
  });
});
