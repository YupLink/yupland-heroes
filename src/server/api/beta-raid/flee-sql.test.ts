// Правила побега (владелец, 21.09): под живой объект и постройку МОЖНО — там
// беглец прячется (ТЗ); под судно, к другому беглецу и на шахту (20.10, §8.59
// п. 9) — нет; СКВОЗЬ живой объект, шахту, скалу или воду на промежуточной
// клетке — нельзя. Условия утверждаем по экспортированным константам, а не по
// подстрокам в собранном запросе:
// «не содержит object_id» иначе давал бы ложный проход, когда та же строка
// появляется в проверке via.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: vi.fn() }));

import {
  CAN_PASS_DRY,
  CAN_STAND_DRY,
  LANDING,
  PASSAGE,
  canPassSql,
  canStandSql,
  fleeGridSql,
  landingSql,
  type FleeStep,
} from "./flee-sql";
import { fleeMovesSql } from "./flee-sql-moves";
import { RUNNER_LAYER, CELL_LAYER } from "./runners";
import { hexDist, pickFleeCell, type Hex } from "./flee-rules";
import { mineCellSql } from "./mine-cell-sql";

/** Условие без проверки шахты — чтобы судить об остальных постройках. */
const noMine = (sql: string) => sql.replace(mineCellSql("c"), "");

describe("flee-sql: посадка и проход", () => {
  it("посадка: под объект и постройку можно, под судно, к беглецу и на шахту — нет", () => {
    expect(noMine(CAN_STAND_DRY)).not.toContain("object_id");
    expect(noMine(CAN_STAND_DRY)).not.toContain("building_id");
    // Шахта — тем же признаком, что держит игрока (step-facts).
    expect(CAN_STAND_DRY).toContain(`AND NOT ${mineCellSql("c")}`);
    expect(CAN_STAND_DRY).toContain("yuplink.beta_raid_ship");
    expect(CAN_STAND_DRY).toContain("yuplink.beta_raid_runner");
    // Физика: земля есть, декора нет, купола нет.
    expect(CAN_STAND_DRY).toContain("c.terrain_id IS NOT NULL");
    expect(CAN_STAND_DRY).toContain("c.decoration_id IS NULL");
    expect(CAN_STAND_DRY).toContain("c.void_fog IS NOT TRUE");
  });

  it("проход: строже посадки ровно на живой объект; постройка не держит, шахта держит", () => {
    expect(CAN_PASS_DRY.startsWith(CAN_STAND_DRY)).toBe(true);
    expect(CAN_PASS_DRY).toContain("c.object_id IS NULL OR");
    // Поверженный, но ещё не убранный объект проход не закрывает (как игроку).
    expect(CAN_PASS_DRY).toContain("h.killed_at IS NOT NULL OR h.current_hp <= 0");
    expect(noMine(CAN_PASS_DRY)).not.toContain("building_id");
    expect(CAN_PASS_DRY).toContain(`AND NOT ${mineCellSql("c")}`);
  });

  it("шахта закрыта и в разведке, и в записи переезда (цель и via)", () => {
    const grid = fleeGridSql("rmap_x", [{ q: 0, r: 0 }]);
    expect(grid).toContain(`COALESCE(${CAN_STAND_DRY}, false) AS free`);
    for (const swims of [false, true]) {
      expect(LANDING("rmap_x", { q: 1, r: 0 }, swims)).toContain(mineCellSql("c"));
      expect(PASSAGE("rmap_x", { q: 1, r: 0 }, swims)).toContain(mineCellSql("c"));
    }
  });

  it("вода — преграда сухопутному и в посадке, и в проходе; пловцу — нет", () => {
    for (const rule of [canStandSql, canPassSql]) {
      expect(rule(false)).toContain("AND NOT EXISTS (SELECT 1 FROM yuplink.mystic_item_template");
      // Шаблон в условии пловца — только у признака шахты, воды там нет.
      expect(noMine(rule(true))).not.toContain("mystic_item_template");
    }
  });

  it("разведка отдаёт обе колонки: free (посадка) и pass (проход)", () => {
    const sql = fleeGridSql("rmap_x", [{ q: 0, r: 0 }]);
    expect(sql).toContain(`${CAN_STAND_DRY}, false) AS free`);
    expect(sql).toContain(`${CAN_PASS_DRY}, false) AS pass`);
  });

  it("запись: посадка на цель всегда; проход через via — только при побеге на две", () => {
    const one: FleeStep = {
      from: { q: 0, r: 0 },
      to: { q: 1, r: 0 },
      via: null,
      objectId: "boss:a",
      layer: CELL_LAYER,
      swims: false,
    };
    const two: FleeStep = {
      from: { q: 5, r: 5 },
      to: { q: 7, r: 5 },
      via: { q: 6, r: 5 },
      objectId: "boss:b",
      layer: RUNNER_LAYER,
      swims: true,
    };
    expect(landingSql("rmap_x", one)).toBe(LANDING("rmap_x", one.to, false));
    expect(landingSql("rmap_x", one)).not.toContain("6, 5");
    expect(landingSql("rmap_x", two)).toContain(PASSAGE("rmap_x", two.via as Hex, true));
    // Оба вида CTE (первый побег из клетки и побег из слоя) читают то же условие.
    const sql = fleeMovesSql("rmap_x", [one, two]);
    expect(sql.split(LANDING("rmap_x", one.to, false)).length - 1).toBe(1);
    expect(sql.split(landingSql("rmap_x", two)).length - 1).toBe(1);
    // На via запись проверяет и игрока — план его обходил, а запись раньше нет.
    expect(PASSAGE("rmap_x", two.via as Hex, true)).toContain("beta_raid_positions");
  });
});

describe("flee-rules.pickFleeCell: сквозь преграду нельзя, под объект можно", () => {
  const from: Hex = { q: 0, r: 0 };
  const scarer: Hex = { q: -1, r: 0 };
  // Цель (2,0) достижима из (0,0) через ЕДИНСТВЕННУЮ промежуточную (1,0).
  const only = (keys: string[]) => (h: Hex) => keys.includes(`${h.q},${h.r}`);
  const all = () => true;

  it("все соседи заняты — бежать некуда, принимает бой", () => {
    expect(pickFleeCell(from, scarer, () => false, [], 2)).toBeNull();
  });

  it("свободна только одна клетка на расстоянии 1 — уходит туда и при желании двух", () => {
    expect(pickFleeCell(from, scarer, only(["1,0"]), [], 2)).toEqual({
      to: { q: 1, r: 0 },
      via: null,
    });
  });

  it("по умолчанию проход = посадка: сквозь занятую промежуточную не прыгает", () => {
    expect(pickFleeCell(from, scarer, only(["2,0"]), [], 2)).toBeNull();
  });

  it("(а) скала на единственной via — цель за ней недостижима, уходит на одну в сторону", () => {
    // (1,0) — скала (ни встать, ни пройти), (2,0) свободна, (0,1) свободна.
    const stand = only(["2,0", "0,1"]);
    expect(pickFleeCell(from, scarer, stand, [], 2, stand)).toEqual({
      to: { q: 0, r: 1 },
      via: null,
    });
  });

  it("(е) живой объект на via: пройти сквозь нельзя, встать под него можно", () => {
    const stand = only(["1,0", "2,0"]);
    // Проход закрыт везде — под объект на (1,0) садится, до (2,0) не бежит.
    expect(pickFleeCell(from, scarer, stand, [], 2, () => false)).toEqual({
      to: { q: 1, r: 0 },
      via: null,
    });
    // Проход через (1,0) открыт — бежит на две, via названа.
    expect(pickFleeCell(from, scarer, stand, [], 2, only(["1,0"]))).toEqual({
      to: { q: 2, r: 0 },
      via: { q: 1, r: 0 },
    });
  });

  it("(г) via — сосед и клетки from, и клетки to; (д) при одном шаге via нет", () => {
    const two = pickFleeCell(from, scarer, all, [], 2, all);
    expect(two).not.toBeNull();
    expect(hexDist(two!.to, from)).toBe(2);
    expect(two!.via).not.toBeNull();
    expect(hexDist(two!.via!, from)).toBe(1);
    expect(hexDist(two!.via!, two!.to)).toBe(1);
    const one = pickFleeCell(from, scarer, all, [], 1, all);
    expect(one).not.toBeNull();
    expect(hexDist(one!.to, from)).toBe(1);
    expect(one!.via).toBeNull();
  });
});
