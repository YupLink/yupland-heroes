// Вход и кошельки — только при проверенном Telegram (владелец, 18.10.2026):
// без подписи — только пересесть на свой кошелёк; новый — с подписью к своему
// Telegram; чужой Telegram — отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ users: [] as Array<Record<string, unknown>> }));
const spies = vi.hoisted(() => ({ setCurrentWallet: vi.fn() }));
const match = (row: Record<string, unknown>, f: Record<string, unknown>) =>
  Object.entries(f).every(([k, v]) => row[k] === v);

vi.mock("../db/pg", () => ({
  pg: {
    users: {
      // Как настоящий maybeSingle: больше одной строки — ошибка.
      findOne: async (f: Record<string, unknown>) => {
        const hit = db.users.filter((r) => match(r, f));
        if (hit.length > 1) throw new Error("pg.users.findOne: multiple rows");
        return hit[0] ?? null;
      },
      findFirst: async (f: Record<string, unknown>) => db.users.find((r) => match(r, f)) ?? null,
      insert: async (row: Record<string, unknown>) => {
        db.users.push({ ...row });
      },
      update: async (f: Record<string, unknown>, patch: Record<string, unknown>) => {
        for (const r of db.users) if (match(r, f)) Object.assign(r, patch);
      },
    },
  },
}));
vi.mock("../auth", () => ({ setCurrentWallet: spies.setCurrentWallet }));

const { linkSignedWallet, switchToLinkedWallet } = await import("./wallet-link");

const YAR = 100000002;
beforeEach(() => {
  db.users = [
    {
      wallet: "yupland_nfts.near",
      telegram_id: YAR,
      telegram_username: "player03",
      disconnected: false,
    },
    {
      wallet: "darai_collection.near",
      telegram_id: null,
      telegram_username: null,
      disconnected: false,
    },
    {
      wallet: "owner.example.tg",
      telegram_id: 100000001,
      telegram_username: "player61",
      disconnected: false,
    },
    { wallet: "old.near", telegram_id: YAR, telegram_username: "player03", disconnected: true },
  ];
  spies.setCurrentWallet.mockClear();
});

describe("без подписи — только свой кошелёк", () => {
  it("кошелёк своего Telegram — пересадка", async () => {
    await expect(switchToLinkedWallet("Yupland_NFTS.near", YAR)).resolves.toEqual({
      wallet: "yupland_nfts.near",
    });
    expect(spies.setCurrentWallet).toHaveBeenCalledWith("yupland_nfts.near", YAR);
  });

  it("кошелёк без Telegram, чужой или отключённый — отказ, сессия не меняется", async () => {
    await expect(switchToLinkedWallet("darai_collection.near", YAR)).rejects.toThrow(/не привязан/);
    await expect(switchToLinkedWallet("owner.example.tg", YAR)).rejects.toThrow(/не привязан/);
    await expect(switchToLinkedWallet("old.near", YAR)).rejects.toThrow(/не привязан/);
    await expect(switchToLinkedWallet("nobody.near", YAR)).rejects.toThrow(/не привязан/);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });
});

describe("с подписью — пристёгивается к Telegram сессии", () => {
  it("кошелёк без Telegram пристёгивается и становится сессией", async () => {
    await linkSignedWallet("darai_collection.near", YAR);
    const row = db.users.find((r) => r.wallet === "darai_collection.near")!;
    expect(row.telegram_id).toBe(YAR);
    expect(row.telegram_username).toBe("player03");
    expect(spies.setCurrentWallet).toHaveBeenCalledWith("darai_collection.near", YAR);
  });

  it("новый кошелёк заводится сразу на Telegram, отключённый свой — включается", async () => {
    await linkSignedWallet("fresh.near", YAR);
    expect(db.users.find((r) => r.wallet === "fresh.near")).toMatchObject({
      telegram_id: YAR,
      hallway_onboarding: false,
      wallet_kind: "external",
    });
    await linkSignedWallet("old.near", YAR);
    expect(db.users.find((r) => r.wallet === "old.near")?.disconnected).toBe(false);
  });

  it("у Telegram уже несколько кошельков — третий пристёгивается", async () => {
    db.users.push({ wallet: "tg100000002", telegram_id: YAR, telegram_username: "player03" });
    await linkSignedWallet("third.near", YAR);
    expect(db.users.find((r) => r.wallet === "third.near")?.telegram_id).toBe(YAR);
  });

  it("stay: пристегнуть, но сессию не переводить", async () => {
    await linkSignedWallet("quiet.near", YAR, { stay: true });
    expect(db.users.find((r) => r.wallet === "quiet.near")?.telegram_id).toBe(YAR);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });

  it("кошелёк чужого Telegram — отказ даже с подписью", async () => {
    await expect(linkSignedWallet("owner.example.tg", YAR)).rejects.toThrow(/другому Telegram/);
    expect(db.users.find((r) => r.wallet === "owner.example.tg")?.telegram_id).toBe(100000001);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });
});
