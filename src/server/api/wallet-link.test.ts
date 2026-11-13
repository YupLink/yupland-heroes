// Вход и кошельки — только при проверенном Telegram (владелец, 18.10.2026):
// без подписи — только пересесть на свой кошелёк; новый — с подписью к своему
// Telegram; чужой Telegram — отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ users: [] as Array<Record<string, unknown>> }));
const spies = vi.hoisted(() => ({ setCurrentWallet: vi.fn(), admins: new Set<string>() }));
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
vi.mock("../auth", () => ({
  setCurrentWallet: spies.setCurrentWallet,
  isAdminWalletLinked: async (w: string) => spies.admins.has(w),
}));

const released = vi.hoisted(() => ({ calls: [] as Array<[number, number]>, adopted: [] as number[] }));
vi.mock("./wallet-login/walletLoginStore", () => ({
  releaseWalletTg: async (syn: number, tg: number) => {
    released.calls.push([syn, tg]);
    for (const r of db.users) if (r.telegram_id === syn) r.telegram_id = tg;
  },
}));
vi.mock("./user-account-adopt", () => ({ adoptTelegramAccount: async (tg: number) => void released.adopted.push(tg) }));

const { linkSignedWallet, switchToLinkedWallet } = await import("./wallet-link");

const YAR = 700000002;
beforeEach(() => {
  db.users = [
    {
      wallet: "yupland_nfts.near",
      telegram_id: YAR,
      telegram_username: "partnernick",
      disconnected: false,
    },
    {
      wallet: "darai_collection.near",
      telegram_id: null,
      telegram_username: null,
      disconnected: false,
    },
    {
      wallet: "owner.tg",
      telegram_id: 700000001,
      telegram_username: "owner_tg",
      disconnected: false,
    },
    { wallet: "old.near", telegram_id: YAR, telegram_username: "partnernick", disconnected: true },
  ];
  spies.setCurrentWallet.mockClear();
  spies.admins = new Set<string>();
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
    await expect(switchToLinkedWallet("owner.tg", YAR)).rejects.toThrow(/не привязан/);
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
    expect(row.telegram_username).toBe("partnernick");
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
    db.users.push({ wallet: "tg700000002", telegram_id: YAR, telegram_username: "partnernick" });
    await linkSignedWallet("third.near", YAR);
    expect(db.users.find((r) => r.wallet === "third.near")?.telegram_id).toBe(YAR);
  });

  it("stay: пристегнуть, но сессию не переводить", async () => {
    await linkSignedWallet("quiet.near", YAR, { stay: true });
    expect(db.users.find((r) => r.wallet === "quiet.near")?.telegram_id).toBe(YAR);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });

  it("кошелёк чужого Telegram — отказ даже с подписью", async () => {
    await expect(linkSignedWallet("owner.tg", YAR)).rejects.toThrow(/другому Telegram/);
    expect(db.users.find((r) => r.wallet === "owner.tg")?.telegram_id).toBe(700000001);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });
});

describe("из другого аккаунта того же Telegram (sameAccountAs)", () => {
  const TG = 111222333;
  beforeEach(() => {
    db.users.push(
      { wallet: "darai_collection.near", telegram_id: TG, account_id: "acc_A", disconnected: false },
      { wallet: "darai_nft.near", telegram_id: TG, account_id: "acc_B", disconnected: false },
    );
    // в общем наборе darai_collection.near без Telegram — убираем, чтобы не было двух строк
    db.users = db.users.filter((r) => !(r.wallet === "darai_collection.near" && r.telegram_id === null));
  });

  it("обычный кошелёк чужого аккаунта — отказ", async () => {
    await expect(
      switchToLinkedWallet("darai_collection.near", TG, { sameAccountAs: "darai_nft.near" }),
    ).rejects.toThrow(/не привязан/);
  });

  it("админский кошелёк — пересадка из любого аккаунта своего Telegram (владелец 21.10)", async () => {
    spies.admins.add("darai_collection.near");
    await expect(
      switchToLinkedWallet("darai_collection.near", TG, { sameAccountAs: "darai_nft.near" }),
    ).resolves.toEqual({ wallet: "darai_collection.near" });
  });

  it("админский кошелёк чужого Telegram — всё равно отказ", async () => {
    spies.admins.add("darai_collection.near");
    await expect(switchToLinkedWallet("darai_collection.near", YAR)).rejects.toThrow(/не привязан/);
  });

  it("кошелёк с номером входа по кошельку — настоящий Telegram забирает его с подписью", async () => {
    const SYN = 6755399441055745;
    db.users.push({ wallet: "solo.near", telegram_id: SYN, disconnected: false });
    released.calls = [];
    released.adopted = [];
    await linkSignedWallet("solo.near", YAR);
    expect(released.calls).toEqual([[SYN, YAR]]);
    expect(released.adopted).toEqual([YAR]);
    expect(db.users.find((r) => r.wallet === "solo.near")?.telegram_id).toBe(YAR);
  });

  it("кошелёк чужого настоящего Telegram — по-прежнему отказ", async () => {
    db.users.push({ wallet: "other.near", telegram_id: 111, disconnected: false });
    await expect(linkSignedWallet("other.near", YAR)).rejects.toThrow("другому Telegram");
  });
});

describe("Google-аккаунт без кошельков (владелец, 09.11.2026)", () => {
  const GOOGLE = 2 ** 52 + 7;
  it("подписанный кошелёк к Google-аккаунту не пристёгивается, база не трогается", async () => {
    const before = db.users.length;
    spies.setCurrentWallet.mockClear();
    await expect(linkSignedWallet("fresh.near", GOOGLE)).rejects.toThrow("google.noWallet");
    expect(db.users.length).toBe(before);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });

  it("номер входа по кошельку (≥ 2^52 + 2^51) — не Google, правило его не задевает", async () => {
    const { assertWalletLinkAllowed } = await import("./wallet-link");
    expect(() => assertWalletLinkAllowed(2 ** 52 + 2 ** 51 + 3)).not.toThrow();
    expect(() => assertWalletLinkAllowed(YAR)).not.toThrow();
    expect(() => assertWalletLinkAllowed(GOOGLE)).toThrow("google.noWallet");
  });
});
