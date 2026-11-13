// Редакция газет (§8.96): только админ и дизайнер замка; размещение — не по
// расписанию, а по кнопке и только когда число на карту задано в settings;
// размещённый выпуск не правится; повтор «Разместить» ничего не задваивает.
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
  editor: true,
  cfg: null as string | null,
  status: "draft" as string | null,
  saved: true,
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
vi.mock("@/server/auth", () => ({
  requireCastleEditor: async () => {
    if (!s.editor) throw new Error("Доступ запрещён: редактор внутрянки замка");
    return "w_ed";
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string, opts?: { wrapJson?: boolean }) => {
    wrapCheck(sql, opts);
    s.sql.push(sql);
    if (/newspaper_config/.test(sql)) return s.cfg ? [{ value: s.cfg }] : [];
    if (/^SELECT status FROM/.test(sql)) return s.status ? [{ status: s.status }] : [];
    if (/INSERT INTO yuplink\.newspaper_issue/.test(sql)) return s.saved ? [{ id: "x" }] : [];
    if (/INSERT INTO yuplink\.newspaper_copy/.test(sql)) {
      s.status = "published";
      return [];
    }
    if (/GROUP BY m\.name/.test(sql)) return [{ map: "Мидгард", copies: "21" }];
    return [];
  },
}));

const { saveNewspaperIssue, publishNewspaperIssue, withdrawNewspaperIssue } =
  await import("./paper-editor");
const { dropNewspaperConfigCache } = await import("./paper-config");
const call = (f: unknown, data?: unknown) => (f as Fn)({ data });
const draft = { date: "2026-10-31", title: "Вестник", imageUrl: "/n/1.webp" };
const id = { id: "npi_abcdef123" };

beforeEach(() => {
  Object.assign(s, { sql: [], editor: true, cfg: null, status: "draft", saved: true });
  dropNewspaperConfigCache();
});

describe("черновик", () => {
  it("новый — id npi_, автор — редактор; чужая картинка — отказ", async () => {
    const r = (await call(saveNewspaperIssue, draft)) as { id: string };
    expect(r.id).toMatch(/^npi_[0-9a-f]{20}$/);
    expect(s.sql[0]).toContain("'w_ed'");
    await expect(
      call(saveNewspaperIssue, { ...draft, imageUrl: "https://evil.example/1.png" }),
    ).rejects.toThrow();
  });
  it("размещённый не правится", async () => {
    s.saved = false;
    s.status = "published";
    await expect(call(saveNewspaperIssue, { ...draft, ...id })).rejects.toThrow(
      "newspaper.not_draft",
    );
  });
  it("не редактор — отказ до базы", async () => {
    s.editor = false;
    await expect(call(saveNewspaperIssue, draft)).rejects.toThrow("Доступ запрещён");
    expect(s.sql).toEqual([]);
  });
});

describe("Разместить и Снять", () => {
  it("число на карту не задано — отказ, на карты ничего не легло", async () => {
    await expect(call(publishNewspaperIssue, id)).rejects.toThrow("newspaper.count_not_set");
    expect(s.sql.some((q) => q.includes("newspaper_copy (id"))).toBe(false);
  });
  it("задано — раскладка с этим числом, итог по картам; повтор не раскладывает", async () => {
    s.cfg = JSON.stringify({ cellsPerCopy: 500 });
    expect(await call(publishNewspaperIssue, id)).toEqual({
      status: "published",
      maps: [{ map: "Мидгард", copies: 21 }],
    });
    expect(s.sql.find((q) => q.includes("INSERT INTO yuplink.newspaper_copy"))).toContain(
      "floor(f.total / 500)",
    );
    s.sql = [];
    await call(publishNewspaperIssue, id);
    expect(s.sql.some((q) => q.includes("INSERT INTO yuplink.newspaper_copy"))).toBe(false);
  });
  it("снятый — не размещается снова; снять — статус из базы", async () => {
    s.cfg = JSON.stringify({ cellsPerCopy: 500 });
    s.status = "withdrawn";
    await expect(call(publishNewspaperIssue, id)).rejects.toThrow("newspaper.not_draft");
    expect(await call(withdrawNewspaperIssue, id)).toEqual({ status: "withdrawn" });
  });
});
