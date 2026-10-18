// Окно турниров у Арены: участники на плашке — оплатившие запись до финиша
// (и у идущего: набравших очки может ещё не быть) и места после; таблица
// запланированного — записавшиеся, а не пустота.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = {
  tour: [] as Array<Record<string, unknown>>,
  calls: [] as unknown[][],
  admin: false,
};

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const o = { inputValidator: () => o, handler: (fn: unknown) => fn };
    return o;
  },
}));
vi.mock("../beta-raid/gate", () => ({ requireBetaRaid: async () => "w" }));
vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc" }));
vi.mock("../../auth", () => ({ isAdminWallet: () => st.admin }));
vi.mock("./tour-gate", () => ({ requireTourHere: async () => "map-1" }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => st.tour }));
vi.mock("./tour-board", () => ({
  loadLeaderPage: async (...a: unknown[]) => {
    st.calls.push(a);
    return { rows: [], mine: null, total: 0 };
  },
}));

const { getTourTable, platesSql, toPlate } = await import("./tour-read");

type PlateRow = Parameters<typeof toPlate>[0];
const plateRow = (status: PlateRow["status"], players: number, entries: number): PlateRow => ({
  id: "t1",
  name: "Фарм шахт",
  metric: "farm",
  days: 7,
  status,
  bands: [],
  fund: 0,
  created_ms: 0,
  started_ms: 0,
  ends_ms: 0,
  finished_ms: null,
  players,
  my_score: null,
  my_place: null,
  joined: true,
  entries,
});

beforeEach(() => {
  st.tour = [];
  st.calls = [];
  st.admin = false;
});

describe("участники на плашке", () => {
  it("до финиша — оплатившие запись, после — места", () => {
    expect(toPlate(plateRow("running", 0, 32)).players).toBe(32);
    expect(toPlate(plateRow("paying", 28, 41)).players).toBe(41);
    expect(toPlate(plateRow("draft", 0, 5)).players).toBe(5);
    expect(toPlate(plateRow("done", 7, 9)).players).toBe(7);
  });

  it("записи считаются только оплаченные; моё место — только с очками", () => {
    const sql = platesSql("acc").replace(/\s+/g, " ");
    expect(sql).toContain("WHERE e.tournament_id = t.id AND e.paid)::int AS entries");
    expect(sql).toContain("WHEN me.score > 0 THEN 1 + (SELECT count(*)");
    // Равные по счёту — на одном месте: выше меня только набравшие больше.
    expect(sql).toContain("WHERE o.tournament_id = t.id AND o.score > me.score)");
  });
});

describe("таблица турнира", () => {
  const ask = (id = "t1") => getTourTable({ data: { q: 0, r: 0, id, offset: 20 } });

  it("запланированный — таблица записавшихся", async () => {
    st.tour = [{ status: "draft", dry: true, planned: true }];
    await ask();
    expect(st.calls).toEqual([["t1", "draft", 20, "acc"]]);
  });

  it("черновик без времени и чужая проверка — не найдено", async () => {
    st.tour = [{ status: "draft", dry: true, planned: false }];
    await expect(ask()).rejects.toThrow("tour.err.not_found");
    st.tour = [{ status: "running", dry: true, planned: false }];
    await expect(ask()).rejects.toThrow("tour.err.not_found");
    st.tour = [];
    await expect(ask()).rejects.toThrow("tour.err.not_found");
    expect(st.calls).toEqual([]);
  });

  it("идущий боевой — игроку; проверку — админу", async () => {
    st.tour = [{ status: "running", dry: false, planned: false }];
    await ask();
    st.tour = [{ status: "running", dry: true, planned: false }];
    st.admin = true;
    await ask();
    expect(st.calls.map((c) => c[1])).toEqual(["running", "running"]);
  });
});
