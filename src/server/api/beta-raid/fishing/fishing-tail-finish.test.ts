// Финиш «Улова» зовёт досчёт (fishing-tail-run) после захвата выплаты и ДО мест:
// иначе места посчитались бы без клюнувшего до конца. Места — под замком поздних
// очков категории: поздняя выдача ляжет либо в них, либо никуда. Другим
// категориям досчёт рыбалки не нужен.
import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ steps: [] as string[], metric: "fish_catch" }));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("SET status = 'paying'")) log.steps.push("захват");
    if (sql.includes("INSERT INTO yuplink.tournament_place"))
      log.steps.push(
        sql.includes(`hashtext('tour-late:${log.metric}')`) ? "места под замком" : "места",
      );
    return sql.includes("SET status = 'paying'") ? [{ id: "t1" }] : [];
  },
}));
vi.mock("@/server/api/tournament/tour-sync", () => ({
  loadTourWork: async (id: string) => ({ id, metric: log.metric, endsMs: 1_000 }),
  syncTournament: async () => {},
}));
vi.mock("@/server/api/tournament/tour-res-tail", () => ({ settleResourceTail: async () => {} }));
vi.mock("@/server/api/tournament/tour-note", () => ({ dropTourCache: () => {} }));
vi.mock("@/server/api/gifts-create", () => ({ createGifts: async () => [] }));
vi.mock("@/server/api/darai-pools-move", () => ({
  insertPoolMove: async () => ({ inserted: false }),
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-tail-run", () => ({
  settleFishTail: async (w: { id: string; metric: string; endsMs: number }) =>
    void log.steps.push(`хвост ${w.id} ${w.metric} ${w.endsMs}`),
}));

const { finishTournament } = await import("@/server/api/tournament/tour-finish");

beforeEach(() => {
  log.steps = [];
  log.metric = "fish_catch";
});

describe("финиш «Улова»", () => {
  it("досчёт — после захвата выплаты и до мест; места под замком категории", async () => {
    await finishTournament("t1");
    expect(log.steps).toEqual(["захват", "хвост t1 fish_catch 1000", "места под замком"]);
  });

  it("другие категории досчёт рыбалки не зовут", async () => {
    log.metric = "wood";
    await finishTournament("t1");
    expect(log.steps).toEqual(["захват", "места под замком"]);
  });
});
