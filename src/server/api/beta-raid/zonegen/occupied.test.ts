// Занятые клетки: правило «что нельзя перекрашивать» — в SQL, отбор по зоне — в JS.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpExec = vi.fn();
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: (...a: unknown[]) => mcpExec(...a) }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POS_MAP_SQL } from "@/server/api/beta-raid/pos-map-sql";

import { addBusy, boundingBox, loadOccupied, loadRoads, occupiedSql, roadsSql } from "./occupied";

describe("occupiedSql", () => {
  const sql = occupiedSql("rmap_x", { q0: -3, q1: 5, r0: 10, r1: 12 });

  it("объект, постройка, блок, купол — по своей карте и в прямоугольнике", () => {
    expect(sql).toContain("c.map_id = 'rmap_x'");
    expect(sql).toContain("c.q BETWEEN -3 AND 5 AND c.r BETWEEN 10 AND 12");
    for (const col of [
      "c.object_id IS NOT NULL",
      "c.building_id IS NOT NULL",
      "c.group_id IS NOT NULL",
      "c.void_fog IS TRUE",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("игроки (позиция без карты — главный мир), беглецы и корабли — по карте", () => {
    expect(sql).toContain(`${POS_MAP_SQL("p")} = 'rmap_x' AND p.q BETWEEN`);
    expect(sql).toContain("beta_raid_runner rr\n     WHERE rr.map_id = 'rmap_x'");
    expect(sql).toContain("beta_raid_ship s\n     WHERE s.map_id = 'rmap_x'");
  });

  it("сундук игрока (магический и обычный) держит клетку — поселение на него не встаёт", () => {
    expect(sql).toContain(
      "raid_magic_chest mc\n     WHERE mc.map_id = 'rmap_x' AND mc.q BETWEEN -3 AND 5 AND mc.r BETWEEN 10 AND 12",
    );
    expect(sql).toContain(
      "raid_plain_chest pc\n     WHERE pc.map_id = 'rmap_x' AND pc.q BETWEEN -3 AND 5 AND pc.r BETWEEN 10 AND 12",
    );
  });

  it("дорога и декор занятостью не считаются — их генератор трогает сам", () => {
    expect(sql).not.toContain("road_id");
    expect(sql).not.toContain("decoration_id");
  });
});

describe("boundingBox", () => {
  it("охватывает все клетки, включая отрицательные координаты", () => {
    expect(
      boundingBox([
        { q: 2, r: -1 },
        { q: -4, r: 7 },
        { q: 0, r: 0 },
      ]),
    ).toEqual({
      q0: -4,
      q1: 2,
      r0: -1,
      r1: 7,
    });
  });
});

describe("loadOccupied", () => {
  beforeEach(() => mcpExec.mockReset());

  it("возвращает только клетки зоны; прямоугольник шире зоны — лишнее отсекается", async () => {
    mcpExec.mockResolvedValue([
      { q: 1, r: 1 },
      { q: "2", r: "2" },
      { q: 3, r: 3 },
    ]);
    const got = await loadOccupied("rmap_x", [
      { q: 1, r: 1 },
      { q: 2, r: 2 },
      { q: 1, r: 3 },
    ]);
    expect([...got].sort()).toEqual(["1,1", "2,2"]);
    expect(mcpExec).toHaveBeenCalledTimes(1);
  });

  it("пустая зона — пустой ответ без похода в базу", async () => {
    expect(await loadOccupied("rmap_x", [])).toEqual(new Set());
    expect(mcpExec).not.toHaveBeenCalled();
  });
});

describe("дороги", () => {
  beforeEach(() => mcpExec.mockReset());

  it("roadsSql — та же карта и прямоугольник, только клетки с road_id", () => {
    const sql = roadsSql("rmap_x", { q0: -3, q1: 5, r0: 10, r1: 12 });
    expect(sql).toContain("c.map_id = 'rmap_x'");
    expect(sql).toContain("c.q BETWEEN -3 AND 5 AND c.r BETWEEN 10 AND 12");
    expect(sql).toContain("c.road_id IS NOT NULL");
  });

  it("loadRoads отдаёт дороги только из зоны", async () => {
    mcpExec.mockResolvedValue([
      { q: 1, r: 1 },
      { q: 9, r: 9 },
    ]);
    const got = await loadRoads("rmap_x", [
      { q: 1, r: 1 },
      { q: 2, r: 2 },
    ]);
    expect([...got]).toEqual(["1,1"]);
    expect(String(mcpExec.mock.calls[0][0])).toContain("road_id IS NOT NULL");
  });
});

describe("очередь кисти", () => {
  it("невыгруженные правки добавляются к занятым", () => {
    const occupied = new Set(["1,1"]);
    expect(
      [
        ...addBusy(occupied, [
          { q: 2, r: 2 },
          { q: 1, r: 1 },
        ]),
      ].sort(),
    ).toEqual(["1,1", "2,2"]);
  });

  it("очереди нет — набор не меняется", () => {
    expect([...addBusy(new Set(["1,1"]), undefined)]).toEqual(["1,1"]);
  });

  it("ручка учитывает очередь ДО обоих проходов", () => {
    // Порядок и есть починка: узнай генератор про очередь после себя — он бы
    // снова покрасил клетку под домом из прошлого прогона, а планировщик снова
    // поставил бы дом вплотную (владелец, 24.09: «здание на здание»).
    const src = readFileSync(
      join(process.cwd(), "src/server/api/beta-raid/zonegen/generate-api.ts"),
      "utf8",
    );
    expect(src).toContain("busy: z.array(cellSchema)");
    const merge = src.indexOf("addBusy(");
    expect(merge, "generate-api не сводит очередь в занятые").toBeGreaterThan(0);
    expect(merge).toBeLessThan(src.indexOf("generateZone({"));
    expect(merge).toBeLessThan(src.indexOf("planZoneSettlements("));
  });
});
