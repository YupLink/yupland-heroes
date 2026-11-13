// Сверка порталов (30.10.2026): вид каждого портала тем же правилом, что у
// прохода; страница — только редактору замка (отказ до чтения базы); счёт
// игроков по любой клетке блока; в ответе нет ни id игроков, ни их позиций.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ editor: true, sql: [] as string[] }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/auth", () => ({
  requireCastleEditor: async () => {
    if (!s.editor) throw new Error("Доступ запрещён: редактор внутрянки замка");
    return "w";
  },
}));
vi.mock("./encounter-where", () => ({ activeBetaMapId: async () => "alpha" }));

const P = (map: string, q: number, r: number, group: string | null, tm?: string) => ({
  map_id: map,
  q,
  r,
  portal: group === null ? null : { group, ...(tm ? { targetMap: tm } : {}) },
  grp: group,
  room_map: tm || map,
  void_fog: false,
  block: null as string | null,
});
const NET = [
  { ...P("alpha", 37, 89, "1", "hell"), block: "38,88;37,89" },
  P("hell", 32, 63, "1", "hell"),
  P("alpha", 10, 10, "2"),
  P("alpha", 11, 11, "2"),
  P("alpha", 12, 12, "3"), // без пары
  P("alpha", 13, 13, "0"),
  P("alpha", 14, 14, null),
  P("alpha", 15, 15, "4", "draft"), // этаж закрыт
];

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("WITH e(k")) {
      return [
        { k: 0, on_map: 238, seen_by: 91 },
        { k: 1, on_map: 3, seen_by: 3 },
      ];
    }
    if (sql.includes("COALESCE(f.name, m.name)")) {
      return [
        { id: "alpha", name: "Мир Альфа" },
        { id: "hell", name: "Муспельхейм" },
      ];
    }
    if (sql.includes("isle")) return [{ n: 5 }];
    return NET;
  },
}));

const { classifyPortals } = await import("./portal-classify");
const { getPortalCheck } = await import("./portal-check");
const run = getPortalCheck as unknown as () => Promise<{
  worlds: Array<Record<string, unknown> & { name: string; cross: Array<Record<string, unknown>> }>;
  islands: { count: number; to: string };
}>;

beforeEach(() => Object.assign(s, { editor: true, sql: [] }));

describe("classifyPortals", () => {
  it("дверь, этаж закрыт, без пары, внутри мира, межмировой", () => {
    const kinds = classifyPortals(NET, new Set(["alpha", "hell"])).map((v) => v.kind);
    expect(kinds).toEqual(["cross", "cross", "inner", "inner", "alone", "door", "door", "closed"]);
  });
});

describe("getPortalCheck", () => {
  it("не редактор замка — отказ до чтения базы", async () => {
    s.editor = false;
    await expect(run()).rejects.toThrow("Доступ запрещён");
    expect(s.sql).toEqual([]);
  });

  it("счёт по мирам, межмировые с клетками блока и сколько видят", async () => {
    const out = await run();
    expect(out.worlds.map((w) => w.name)).toEqual(["Мир Альфа", "Муспельхейм"]);
    expect(out.worlds[0]).toMatchObject({ total: 7, doors: 2, closed: 1, alone: 1, inner: 2 });
    expect(out.worlds[0].cross).toEqual([
      {
        q: 37,
        r: 89,
        others: [[38, 88]],
        to: ["Муспельхейм"],
        alsoHere: false,
        void: false,
        onMap: 238,
        seenBy: 91,
      },
    ]);
    expect(out.worlds[1].cross[0]).toMatchObject({ to: ["Мир Альфа"], onMap: 3, seenBy: 3 });
    expect(out.islands).toEqual({ count: 5, to: "Мир Альфа" });
    // «Видят» — по любой клетке блока; в ответе только счёт.
    expect(s.sql.find((q) => q.includes("WITH e(k"))).toContain("ARRAY['38,88', '37,89']");
    expect(JSON.stringify(out)).not.toMatch(/acc_|account|wallet/);
  });
});
