// Источник генератора письма о турнирах: какие турниры берём (запланированные
// и идущие), чьё время у идущего (фактическое), цена записи из базы и арены —
// только стоящие на карте постройки «Турнир». База подменена.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  sql: [] as string[],
  tours: [] as unknown[],
  arenas: [] as unknown[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => () => fn() }),
}));
vi.mock("../../auth", () => ({ requireAdmin: () => "admin.near" }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    db.sql.push(flat);
    return flat.includes("mystic_item_template") ? db.arenas : db.tours;
  },
}));

const { adminTourLetterSource } = await import("./letters-tour");

const MS = (iso: string) => Date.parse(iso);
const dbRow = (over: Record<string, unknown>) => ({
  id: "t1",
  name: "Урон",
  metric: "damage",
  days: 7,
  status: "draft",
  bands: [{ places: "1", prizes: [{ kind: "token", amount: 1000, refId: "Darai" }] }],
  fund: "1000",
  dry: false,
  created_ms: MS("2026-10-04T10:00:00Z"),
  started_ms: null,
  ends_ms: null,
  finished_ms: null,
  start_ms: MS("2026-10-05T00:00:00Z"),
  end_ms: MS("2026-10-11T23:59:00Z"),
  last_error: null,
  entry_price: [{ resource: "gold", amount: 5 }],
  players: 0,
  ...over,
});

beforeEach(() => Object.assign(db, { sql: [], tours: [], arenas: [] }));

describe("источник письма о турнирах", () => {
  it("выборка: черновик с началом впереди и идущие; арены — эффект tournament на карте", async () => {
    await adminTourLetterSource();
    const [tours, arenas] = db.sql;
    expect(tours).toContain("(t.status = 'draft' AND t.start_at > now()) OR t.status = 'running'");
    expect(arenas).toContain("t.meta->>'effect' = 'tournament'");
    expect(arenas).toContain("t.kind = 'building' AND t.active");
    expect(arenas).toContain("FROM yuplink.raid_map_cells c WHERE c.building_id = t.id");
  });

  it("запланированный — расписание; идущий — фактические начало и конец", async () => {
    db.tours = [
      dbRow({ id: "plan", end_ms: null }),
      dbRow({
        id: "live",
        status: "running",
        started_ms: MS("2026-10-03T12:00:00Z"),
        ends_ms: MS("2026-10-10T12:00:00Z"),
        start_ms: null,
        end_ms: null,
        entry_price: [],
      }),
      dbRow({ id: "old", status: "done" }),
    ];
    db.arenas = [{ name: "Арена" }, { name: " " }, { name: null }];
    const src = await adminTourLetterSource();
    expect(src.arenas).toEqual(["Арена"]);
    expect(src.tours.map((t) => t.id)).toEqual(["plan", "live"]);
    expect(src.tours[0]).toMatchObject({
      status: "draft",
      startAt: "2026-10-05T00:00:00.000Z",
      endAt: null,
      days: 7,
      fundDarai: 1000,
      entryPrice: [{ resource: "gold", amount: 5 }],
    });
    expect(src.tours[1]).toMatchObject({
      status: "running",
      startAt: "2026-10-03T12:00:00.000Z",
      endAt: "2026-10-10T12:00:00.000Z",
      entryPrice: [],
    });
  });

  it("пустая база — пустые списки, не падаем", async () => {
    Object.assign(db, { tours: null, arenas: null });
    expect(await adminTourLetterSource()).toEqual({ tours: [], arenas: [] });
  });
});
