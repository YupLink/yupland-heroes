// Письмо «шахту отняли» (владелец одобрил 23.10.2026; мир, вид и «Показать» —
// 04.11, §8.106): строки отбирает база (raid_mine_lost_due — раз в минуту на
// игрока), здесь — одно событие живого канала и одно письмо ИГРОВОГО бота на
// игрока, язык игрока, кнопка «Показать» — на строку (одна) или в «Добычу»
// (несколько); кто отнял — нигде; сбой телеграма не роняет проход; повторный
// пинок за 5 с — один проход.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  due: [] as Array<Record<string, unknown>>,
  tg: [] as Array<{ account_id: string; telegram_id: number | null }>,
  sql: [] as string[],
  events: [] as Array<Record<string, unknown>>,
  sent: [] as Array<{ chat: number; text: string; button: string; mine?: string }>,
  worldless: false,
  failTg: false,
  lang: new Map<number, "ru" | "en">(),
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("raid_mine_lost_due")) {
      const out = s.due;
      s.due = [];
      return out;
    }
    if (sql.includes("FROM yuplink.accounts a")) return s.tg;
    if (sql.includes("raid_floor f") && !s.worldless) {
      return [...sql.matchAll(/'(mcl_[^']+)'/g)].map((m) => ({ id: m[1], world: "Асгард" }));
    }
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.events.push(e),
}));
vi.mock("@/server/tgGameBot", () => ({
  gameLinkButton: (text: string, params: Record<string, string>) => ({
    inline_keyboard: [[{ text, web_app: { url: "x" }, mine: params.mine }]],
  }),
  gameBotSendIfEnabled: async (
    chat: number,
    text: string,
    b: { inline_keyboard: Array<Array<{ text: string; mine?: string }>> },
  ) => {
    if (s.failTg) throw new Error("telegram down");
    s.sent.push({
      chat,
      text,
      button: b.inline_keyboard[0][0].text,
      mine: b.inline_keyboard[0][0].mine,
    });
    return true;
  },
}));
vi.mock("@/server/userLang", () => ({ getUserLang: async (id: number) => s.lang.get(id) ?? "ru" }));

const { notifyMineLosses, kickMineLostNotify, tgOfSql } = await import("./mine-lost-notify");
/** Письма уходят в фоне (динамические импорты бота и словаря) — ждём, пока лягут. */
const settle = () => new Promise((r) => setTimeout(r, 50));

const row = (acc: string, o: Record<string, unknown> = {}) => ({
  n_id: `mcl_${Math.random()}`,
  n_account: acc,
  n_kind: "capture",
  n_q: 5,
  n_r: -2,
  n_resource: "wood",
  n_token: null,
  n_amount: 30,
  n_hours: 3,
  ...o,
});

beforeEach(() => {
  s.due = [];
  s.tg = [];
  s.sql = [];
  s.events = [];
  s.sent = [];
  s.failTg = false;
  s.worldless = false;
  s.lang = new Map();
});
afterEach(() => vi.useRealTimers());

describe("уведомления «шахту отняли»", () => {
  it("один игрок — одно событие (только ему) и одно письмо игрового бота на его языке", async () => {
    s.due = [
      row("acc_a"),
      row("acc_a", { n_q: 6, n_resource: "token", n_token: "Darai", n_amount: 10000 }),
      row("acc_b", { n_kind: "take", n_amount: 0, n_hours: 0 }),
    ];
    s.tg = [
      { account_id: "acc_a", telegram_id: 111 },
      { account_id: "acc_b", telegram_id: 222 },
    ];
    s.lang.set(222, "en");
    expect(await notifyMineLosses()).toBe(2);
    await vi.waitFor(() => expect(s.sent).toHaveLength(2), { timeout: 3_000 });
    expect(s.sql[0]).toBe("SELECT * FROM yuplink.raid_mine_lost_due(300)");
    expect(s.events.map((e) => [e.type, e.to, e.mapId])).toEqual([
      ["mineLost", "acc_a", null],
      ["mineLost", "acc_b", null],
    ]);
    expect(JSON.stringify(s.events)).not.toMatch(/new_?account/i);
    expect(s.sent).toHaveLength(2);
    // Две потери — «Показать» ведёт в «Добычу» (list); вид шахты и мир — в строке.
    expect(s.sent[0]).toEqual({
      chat: 111,
      text: "Лесопилку захватили — Асгард (5, -2)\nШахту захватили — Асгард (6, -2)",
      button: "Показать",
      mine: "list",
    });
    expect(s.sent[1].chat).toBe(222);
    expect(s.sent[1].text).toBe("Your mushroom was picked up — Асгард (5, -2)");
    // Одна потеря — «Показать» ведёт на её строку журнала.
    expect(s.sent[1].button).toBe("Show");
    expect(s.sent[1].mine).toMatch(/^mcl_/);
  });

  it("гриб — с видом по строке журнала (DARAI, золотой, алмазный), кто поднял — нигде", async () => {
    s.due = [
      row("acc_a", { n_kind: "take", n_q: -96, n_r: 74, n_resource: "token", n_token: "Darai" }),
      row("acc_a", { n_kind: "take", n_resource: "gold" }),
      row("acc_a", { n_kind: "expire", n_resource: "diamonds" }),
      row("acc_b", { n_kind: "take", n_resource: "gold", new_account: "thief" }),
    ];
    s.tg = [
      { account_id: "acc_a", telegram_id: 111 },
      { account_id: "acc_b", telegram_id: 222 },
    ];
    s.lang.set(222, "en");
    await notifyMineLosses();
    await vi.waitFor(() => expect(s.sent).toHaveLength(2), { timeout: 3_000 });
    expect(s.sent[0].text).toBe(
      "Гриб DARAI подняли — Асгард (-96, 74)\nЗолотой гриб подняли — Асгард (5, -2)\nАлмазный гриб сгнил — Асгард (5, -2)",
    );
    expect(s.sent[1].text).toBe("Your gold mushroom was picked up — Асгард (5, -2)");
    const notes = (s.events[0].digest as { notes: Array<Record<string, unknown>> }).notes;
    expect(notes.map(({ id: _id, ...n }) => n)).toEqual([
      { kind: "take", q: -96, r: 74, mushroom: "darai", resource: "token", world: "Асгард" },
      { kind: "take", q: 5, r: -2, mushroom: "gold", resource: "gold", world: "Асгард" },
      { kind: "expire", q: 5, r: -2, mushroom: "diamonds", resource: "diamonds", world: "Асгард" },
    ]);
    expect(JSON.stringify(s.events)).not.toContain("thief");
  });

  it("пусто — ни событий, ни писем, ни запроса телеграмов", async () => {
    expect(await notifyMineLosses()).toBe(0);
    expect(s.events).toEqual([]);
    expect(s.sql).toHaveLength(1);
  });

  it("телеграм упал — проход не падает, тост уже ушёл", async () => {
    s.due = [row("acc_a")];
    s.tg = [{ account_id: "acc_a", telegram_id: 111 }];
    s.failTg = true;
    await expect(notifyMineLosses()).resolves.toBe(1);
    await settle();
    expect(s.events).toHaveLength(1);
    expect(s.sent).toEqual([]);
  });

  it("без Telegram — только тост", async () => {
    s.due = [row("acc_a")];
    s.tg = [{ account_id: "acc_a", telegram_id: null }];
    await notifyMineLosses();
    await settle();
    expect(s.events).toHaveLength(1);
    expect(s.sent).toEqual([]);
    expect(tgOfSql(["a'b"])).toContain("'a''b'");
  });

  it("пинки подряд — один проход через 5 с", async () => {
    vi.useFakeTimers();
    kickMineLostNotify();
    kickMineLostNotify();
    kickMineLostNotify();
    expect(s.sql).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.sql.filter((q) => q.includes("raid_mine_lost_due"))).toHaveLength(1);
  });

  it("мир не нашёлся — письмо без мира, но письмо", async () => {
    s.worldless = true;
    s.due = [row("acc_a", { n_resource: "stone" })];
    s.tg = [{ account_id: "acc_a", telegram_id: 111 }];
    await notifyMineLosses();
    await vi.waitFor(() => expect(s.sent).toHaveLength(1), { timeout: 3_000 });
    expect(s.sent[0].text).toBe("Каменную шахту захватили (5, -2)");
  });
});
