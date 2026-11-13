// Газеты на карте (§8.96, Кай 31.10.2026): открыть — вплотную и не прочитанный;
// прочитал — сохраняется в киоске, если он есть; «Прочитать позже» — не
// прочтение, можно без киоска, читать отложенное — только с киоском; полки — по неделям.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
// Как настоящий mcpExec: wrapJson кладёт запрос в подзапрос SELECT — запись
// там не парсится (прод 31.10: «syntax error at or near "INTO"»).
const { wrapCheck } = vi.hoisted(() => ({
  wrapCheck: (sql: string, opts?: { wrapJson?: boolean }) => {
    if (opts?.wrapJson && /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))
      throw new Error('syntax error at or near "INTO"');
  },
}));
const s = vi.hoisted(() => ({
  sql: [] as string[],
  pos: { q: 10, r: 10 } as { q: number; r: number } | null,
  kiosk: false,
  cfg: null as string | null,
  copy: null as Record<string, unknown> | null,
  readRow: null as Record<string, unknown> | null,
  deferOk: true,
  mark: null as Record<string, unknown> | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  activeBetaMapId: async () => "map_a",
  myMapId: async () => "map_a",
  ownCell: async () => s.pos,
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({
  canIgnoreVoid: () => false,
  requireNotVoid: async () => {},
}));
vi.mock("@/server/api/beta-raid/helpers", () => ({
  hexDistance: (q1: number, r1: number, q2: number, r2: number) =>
    (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2,
}));
vi.mock("@/server/api/newspaper-kiosk/kiosk-own", () => ({
  hasNewspaperKiosk: async () => s.kiosk,
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string, opts?: { wrapJson?: boolean }) => {
    wrapCheck(sql, opts);
    s.sql.push(sql);
    if (/newspaper_config/.test(sql)) return s.cfg ? [{ value: s.cfg }] : [];
    if (/FROM yuplink\.newspaper_copy x\s+JOIN/.test(sql)) return s.copy ? [s.copy] : [];
    if (/SET saved/.test(sql)) return s.readRow ? [s.readRow] : [];
    if (/SET deferred_at/.test(sql)) return s.deferOk ? [{ ok: true }] : [];
    if (/AS read\s+FROM yuplink\.newspaper_read/.test(sql)) return s.mark ? [s.mark] : [];
    if (/beta_raid_positions/.test(sql))
      return [{ id: "npc_1", issueId: "npi_aaaaaa", q: 11, r: 10, deferred: false }];
    return [];
  },
}));

const { getNewspapersNear, openNewspaper, markNewspaperRead, deferNewspaper } =
  await import("./paper-map");
const { dropNewspaperConfigCache, parseNewspaperConfig } = await import("./paper-config");
const { kioskShelves } = await import("@/server/api/newspaper-kiosk/kiosk-papers");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const issue = { issueId: "npi_aaaaaa" };
const copy = (patch: Record<string, unknown> = {}) => ({
  q: 11,
  r: 10,
  issueId: "npi_aaaaaa",
  date: "2026-10-31",
  title: "Вестник",
  imageUrl: "/n/1.webp",
  status: "published",
  deferred: false,
  read: false,
  decor: false,
  ...patch,
});

beforeEach(() => {
  Object.assign(s, { sql: [], pos: { q: 10, r: 10 }, kiosk: false, cfg: null, copy: copy() });
  Object.assign(s, { readRow: { saved: false }, deferOk: true, mark: null });
  dropNewspaperConfigCache();
});

describe("слой и «Открыть»", () => {
  it("слой — экземпляры вокруг героя без картинки", async () => {
    expect(await call(getNewspapersNear)).toEqual([
      { id: "npc_1", issueId: "npi_aaaaaa", q: 11, r: 10, deferred: false },
    ]);
  });
  it("вплотную — картинка, отметка «открыл», кнопки по киоску", async () => {
    expect(await call(openNewspaper, { copyId: "npc_1" })).toMatchObject({
      issueId: "npi_aaaaaa",
      imageUrl: "/n/1.webp",
      read: false,
      kiosk: false,
      canDefer: true,
    });
    expect(s.sql.some((q) => q.includes("INSERT INTO yuplink.newspaper_read"))).toBe(true);
    s.kiosk = true;
    expect(await call(openNewspaper, { copyId: "npc_1" })).toMatchObject({ kiosk: true });
  });
  it("отказы: далеко, нет героя, прочитан, снят, под декором", async () => {
    s.pos = { q: 13, r: 10 };
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.approach");
    s.pos = null;
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.approach");
    s.copy = copy({ read: true });
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow(
      "newspaper.already_read",
    );
    s.copy = copy({ status: "withdrawn" });
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.gone");
    s.copy = copy({ decor: true });
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.gone");
    s.copy = null;
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.gone");
  });
});

describe("«Прочитал» и «Прочитать позже»", () => {
  it("прочитал: киоск есть — сохранён (в SQL уходит true), нет — нет", async () => {
    s.kiosk = true;
    s.readRow = { saved: true };
    expect(await call(markNewspaperRead, issue)).toEqual({ read: true, saved: true });
    expect(s.sql.find((q) => /SET saved/.test(q))).toContain("THEN true ELSE");
    s.kiosk = false;
    s.readRow = { saved: false };
    expect(await call(markNewspaperRead, issue)).toEqual({ read: true, saved: false });
  });
  it("не открывал — отказ, без записи прочтения", async () => {
    s.readRow = null;
    await expect(call(markNewspaperRead, issue)).rejects.toThrow("newspaper.not_opened");
  });
  it("отложить можно и без киоска", async () => {
    expect(await call(deferNewspaper, issue)).toEqual({ deferred: true });
    expect(s.sql.some((q) => /SET deferred_at/.test(q))).toBe(true);
  });
  it("отложенный убран с карты; читать из киоска можно с киоском", async () => {
    s.copy = copy({ deferred: true });
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.gone");
    expect(s.sql.some((q) => q.includes("INSERT INTO yuplink.newspaper_read"))).toBe(false);
    s.readRow = null;
    s.mark = { deferred: true, read: false };
    await expect(call(markNewspaperRead, issue)).rejects.toThrow("newspaper.need_kiosk");
    expect(s.sql.find((q) => /SET saved/.test(q))).toContain("false OR rd.deferred_at IS NULL");
    s.kiosk = true;
    s.readRow = { saved: true };
    await expect(call(openNewspaper, { copyId: "npc_1" })).rejects.toThrow("newspaper.gone");
    expect(await call(markNewspaperRead, issue)).toEqual({ read: true, saved: true });
  });
  it("отложить прочитанный — отказ «уже прочитан»", async () => {
    s.kiosk = true;
    s.deferOk = false;
    s.mark = { read: true };
    await expect(call(deferNewspaper, issue)).rejects.toThrow("newspaper.already_read");
  });
});

describe("настройки и полки киоска", () => {
  it("число на карту — только целое ≥ 1", () => {
    expect(parseNewspaperConfig(null)).toEqual({ cellsPerCopy: null });
    expect(parseNewspaperConfig('{"cellsPerCopy":500}').cellsPerCopy).toBe(500);
    expect(parseNewspaperConfig({ cellsPerCopy: 0.5 })).toEqual({ cellsPerCopy: null });
  });
  it("прочитанное — в «Прочитанные», отложенное — в «Отложенные», по неделям", () => {
    const row = (date: string, read: boolean) => ({
      issueId: `npi_${date}`,
      date,
      title: null,
      imageUrl: "/n.webp",
      read,
      deferred: !read,
    });
    const k = kioskShelves([
      row("2026-10-31", true),
      row("2026-11-03", false),
      row("2026-10-27", true),
    ]);
    expect(k.read).toHaveLength(1);
    expect(k.read[0].issues.map((i) => i.date)).toEqual(["2026-10-31", "2026-10-27"]);
    expect(k.deferred).toEqual([
      { week: "2026-11-02", issues: [expect.objectContaining({ canDefer: true, read: false })] },
    ]);
  });
});
