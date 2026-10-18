// Входы через Telegram после сведения в одну копию (13.10.2026): Прихожая
// (/join), мини-апп игры, виджет на сайте и проверка initData — все ходят в
// user-drops-hallway и ведут себя одинаково: новичок → tg<id> + реферал +
// пропуск Прихожей; знакомый → его кошелёк (последний выбранный); подделка →
// отказ без записи в базу.
import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BOT = "123456:TEST-bot-token";
process.env.TELEGRAM_BOT_TOKEN = BOT;
delete process.env.TELEGRAM_HALLWAY_BOT_TOKEN;

type UserRow = {
  wallet: string;
  telegram_id: number | null;
  telegram_linked_at?: string | null;
  disconnected?: boolean;
};
const db = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  accounts: [] as Array<Record<string, unknown>>,
}));
const spies = vi.hoisted(() => ({
  setCurrentWallet: vi.fn(),
  attachReferral: vi.fn(async () => {}),
  skipHallway: vi.fn(async () => {}),
}));

const match = (row: Record<string, unknown>, f: Record<string, unknown>) =>
  Object.entries(f).every(([k, v]) => row[k] === v);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    users: {
      findMany: async (f: Record<string, unknown>) => db.users.filter((r) => match(r, f)),
      findOne: async (f: Record<string, unknown>) => db.users.find((r) => match(r, f)) ?? null,
      insert: async (row: Record<string, unknown>) => {
        if (db.users.some((r) => r.wallet === row.wallet)) throw new Error("dup");
        db.users.push(row);
      },
    },
    accounts: {
      findOne: async (f: Record<string, unknown>) => db.accounts.find((r) => match(r, f)) ?? null,
    },
  },
}));
vi.mock("../auth", () => ({
  setCurrentWallet: spies.setCurrentWallet,
  getCurrentWallet: () => null,
}));
vi.mock("../referralAttach", () => ({ attachReferral: spies.attachReferral }));
vi.mock("./hallway-skip", () => ({ skipHallwayForNewPlayer: spies.skipHallway }));

const hallway = await import("./user-drops-hallway");
const tg = await import("./user-telegram");
type Fn = (a: {
  data: unknown;
}) => Promise<{ ok: boolean; wallet?: string; newbie?: boolean; error?: string }>;
const startHallwaySession = hallway.startHallwaySession as unknown as Fn;
const loginViaTelegramInitData = tg.loginViaTelegramInitData as unknown as Fn;
const loginViaTelegramWidget = tg.loginViaTelegramWidget as unknown as Fn;

/** initData мини-аппа, подписанный как это делает Telegram (WebAppData). */
function initData(id: number, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: "T", username: `u${id}` }),
    ...extra,
  });
  const check = [...p.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT).digest();
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return p.toString();
}

/** Поля Login Widget, подписанные как у Telegram (sha256 токена). */
function widget(id: number) {
  const tgFields = { id, first_name: "T", auth_date: Math.floor(Date.now() / 1000) };
  const check = Object.entries(tgFields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHash("sha256").update(BOT).digest();
  return { ...tgFields, hash: createHmac("sha256", secret).update(check).digest("hex") };
}

const knownPlayer = () => {
  db.users.push(
    { wallet: "old.near", telegram_id: 77, telegram_linked_at: "2026-01-01" } satisfies UserRow,
    { wallet: "picked.near", telegram_id: 77, telegram_linked_at: "2026-02-01" } satisfies UserRow,
  );
  // Последний выбранный кошелёк «липнет» между входами.
  db.accounts.push({ telegram_id: 77, active_wallet: "old.near" });
};

beforeEach(() => {
  db.users.length = 0;
  db.accounts.length = 0;
  vi.clearAllMocks();
});

describe("новичок: tg<id>, реферал, Прихожая пропущена", () => {
  it.each([
    [
      "Прихожая /join",
      () => startHallwaySession({ data: { initData: initData(501), ref: "tg9" } }),
    ],
    [
      "мини-апп игры",
      () => loginViaTelegramInitData({ data: { initData: initData(501), ref: "tg9" } }),
    ],
    ["виджет сайта", () => loginViaTelegramWidget({ data: { ...widget(501), ref: "tg9" } })],
  ])("%s", async (_name, run) => {
    const res = await run();
    expect(res.ok).toBe(true);
    expect(res.wallet).toBe("tg501");
    expect(db.users.map((u) => u.wallet)).toEqual(["tg501"]);
    expect(spies.attachReferral).toHaveBeenCalledWith(
      expect.objectContaining({ friendWallet: "tg501", friendTgId: 501, ref: "tg9" }),
    );
    expect(spies.skipHallway).toHaveBeenCalledWith("tg501", 501);
    expect(spies.setCurrentWallet).toHaveBeenCalledWith("tg501", 501);
  });
});

describe("знакомый игрок: свой кошелёк, ничего не создаём", () => {
  it.each([
    ["Прихожая /join", () => startHallwaySession({ data: { initData: initData(77) } })],
    ["мини-апп игры", () => loginViaTelegramInitData({ data: { initData: initData(77) } })],
    ["виджет сайта", () => loginViaTelegramWidget({ data: widget(77) })],
  ])("%s", async (_name, run) => {
    knownPlayer();
    const res = await run();
    expect(res.ok).toBe(true);
    expect(res.wallet).toBe("old.near");
    expect(db.users).toHaveLength(2);
    expect(spies.skipHallway).not.toHaveBeenCalled();
    expect(spies.setCurrentWallet).toHaveBeenCalledWith("old.near", 77);
  });
});

describe("подделка: отказ, база не тронута", () => {
  it.each([
    ["Прихожая /join", () => startHallwaySession({ data: { initData: initData(501) + "0" } })],
    ["мини-апп игры", () => loginViaTelegramInitData({ data: { initData: initData(501) + "0" } })],
    ["виджет сайта", () => loginViaTelegramWidget({ data: { ...widget(501), id: 502 } })],
  ])("%s", async (_name, run) => {
    const res = await run();
    expect(res.ok).toBe(false);
    expect(res.error).toBe("bad_signature");
    expect(db.users).toHaveLength(0);
    expect(spies.setCurrentWallet).not.toHaveBeenCalled();
  });
});

describe("verifyTelegramInitData — проверка для подключения кошелька", () => {
  it("настоящая подпись → id игрока; чужая или протухшая — отказ", async () => {
    const ok = await hallway.verifyTelegramInitData(initData(77));
    expect(ok).toMatchObject({ ok: true, telegramId: 77 });
    expect(await hallway.verifyTelegramInitData(initData(77) + "0")).toEqual({
      ok: false,
      error: "bad_signature",
    });
    const old = initData(77, { auth_date: String(Math.floor(Date.now() / 1000) - 90_000) });
    expect(await hallway.verifyTelegramInitData(old)).toEqual({ ok: false, error: "stale" });
  });
});
