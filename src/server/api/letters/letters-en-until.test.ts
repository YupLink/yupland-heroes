// Письма в админке: английская версия и «показывать до» — что уходит в базу,
// что приходит в список, когда прошедший срок — ошибка, а когда его можно
// оставить (правка уже истёкшего письма). База подменена, время заморожено.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[] }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../../auth", () => ({ requireAdmin: () => "admin.near" }));
vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc_admin" }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    db.sql.push(flat);
    if (flat.startsWith("INSERT INTO yuplink.player_letter ")) return [{ id: "letter_new" }];
    if (flat.startsWith("UPDATE yuplink.player_letter")) return [{ id: "l1" }];
    if (flat.startsWith("SELECT")) return db.rows;
    return [];
  },
}));

const { adminLetterList, adminLetterSave } = await import("./letters-admin");

const NOW = Date.parse("2026-10-05T12:00:00Z");
const END = "2026-10-11T23:59:00.000Z";
const PAST = "2026-10-01T00:00:00.000Z";
const base = { title: "Объявлен турнир", body: "Текст", audience: "all" as const, accounts: [] };
const sqlOf = (head: string) => db.sql.find((s) => s.startsWith(head)) ?? "";

beforeEach(() => {
  Object.assign(db, { sql: [], rows: [] });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("сохранение", () => {
  it("английская версия и срок — в новую строку, срок — timestamptz", async () => {
    const data = { ...base, titleEn: " Tournament ", bodyEn: "Text en", showUntil: END };
    await expect(adminLetterSave({ data })).resolves.toEqual({ id: "letter_new" });
    expect(sqlOf("INSERT")).toContain(
      `'admin.near', 'Tournament', 'Text en', '${END}'::timestamptz) RETURNING id`,
    );
  });

  it("без английской и без срока — NULL (бессрочно, русский всем)", async () => {
    await adminLetterSave({ data: { ...base, titleEn: " ", bodyEn: null } });
    expect(sqlOf("INSERT")).toContain("'admin.near', NULL, NULL, NULL) RETURNING id");
  });

  it("правка: английская версия и срок — в UPDATE; срок в будущем — без лишнего запроса", async () => {
    await adminLetterSave({
      data: { ...base, id: "l1", titleEn: "T", bodyEn: "B", showUntil: END },
    });
    expect(sqlOf("UPDATE")).toContain(
      `title_en = 'T', body_en = 'B', show_until = '${END}'::timestamptz WHERE id = 'l1'`,
    );
    expect(db.sql.some((s) => s.startsWith("SELECT"))).toBe(false);
  });

  it("половина перевода — ошибка и ни одного запроса", async () => {
    await expect(adminLetterSave({ data: { ...base, titleEn: "Only title" } })).rejects.toThrow(
      "letter.err.en_half",
    );
    expect(db.sql).toEqual([]);
  });

  it("мусор и дата без пояса — неверная дата", async () => {
    for (const showUntil of ["завтра", "2026-10-11T23:59"])
      await expect(adminLetterSave({ data: { ...base, showUntil } })).rejects.toThrow(
        /^letter\.err\.until$/,
      );
    expect(db.sql).toEqual([]);
  });

  it("новое письмо с прошедшим сроком — ошибка, письмо не пишется", async () => {
    await expect(adminLetterSave({ data: { ...base, showUntil: PAST } })).rejects.toThrow(
      "letter.err.until_past",
    );
    expect(db.sql.some((s) => s.startsWith("INSERT"))).toBe(false);
  });

  it("правка истёкшего: тот же срок — можно, другой прошедший — нельзя", async () => {
    db.rows = [{ until_ms: String(Date.parse(PAST)) }];
    await expect(
      adminLetterSave({ data: { ...base, id: "l1", showUntil: PAST } }),
    ).resolves.toEqual({ id: "l1" });
    expect(sqlOf("SELECT")).toBe(
      "SELECT extract(epoch from l.show_until) * 1000 AS until_ms FROM yuplink.player_letter l WHERE l.id = 'l1'",
    );
    const data = { ...base, id: "l1", showUntil: "2026-10-02T00:00:00.000Z" };
    await expect(adminLetterSave({ data })).rejects.toThrow("letter.err.until_past");
  });
});

describe("список", () => {
  it("английская версия и срок → поля админки; без срока — null", async () => {
    const row = { id: "l1", title: "T", body: "B", image: null, audience: "all", accounts: [] };
    db.rows = [
      { ...row, title_en: "T en", body_en: "B en", until_ms: String(Date.parse(END)), seen: 0 },
      { ...row, id: "l2", title_en: null, body_en: null, until_ms: null, seen: 1 },
    ];
    const { letters } = await adminLetterList();
    expect(letters[0]).toMatchObject({ titleEn: "T en", bodyEn: "B en", showUntil: END });
    expect(letters[1]).toMatchObject({ titleEn: null, bodyEn: null, showUntil: null });
    expect(db.sql[0]).toContain("extract(epoch from l.show_until) * 1000 AS until_ms");
  });
});
