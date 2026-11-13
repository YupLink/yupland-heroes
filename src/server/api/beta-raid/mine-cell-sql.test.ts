// Признак шахты в SQL обязан совпадать с JS (cellBuildingEffect) — иначе окно
// откроет шахту, а шаг пройдёт сквозь неё (или наоборот). Сверено и на живой
// базе (только чтение, 20.10): 1 472 клетки с постройкой, 211 шахт, ноль
// расхождений SQL с cellBuildingEffect. Здесь — то, что держит совпадение
// дальше: список эффектов, имена и лестница «клетка → шаблон → имя».
import { describe, expect, it } from "vitest";
import { buildingEffect, cellBuildingEffect, type BuildingEffect } from "@/lib/buildingEffect";
import {
  BEFORE_MINE_NAME_RE,
  KNOWN_EFFECTS,
  MINE_NAME_RE,
  mineCellSql,
} from "@/server/api/beta-raid/mine-cell-sql";

/**
 * Все эффекты союза BuildingEffect. Новый эффект в союзе без строки здесь —
 * ошибка tsc: тогда и KNOWN_EFFECTS пора дополнить (иначе SQL сочтёт его
 * «чужим» и пойдёт угадывать по имени).
 */
const ALL: Record<Exclude<BuildingEffect, null>, true> = {
  portal: true,
  building_shop: true,
  shipyard: true,
  watchtower: true,
  leveltree: true,
  sign: true,
  tavern: true,
  mine: true,
  field: true,
  warehouse: true,
  market: true,
  university: true,
  museum: true,
  town_hall: true,
  boost: true,
  spellbook: true,
  chambers: true,
  oblivion: true,
  tournament: true,
  casino: true,
  buckwheat: true,
  enchant: true,
  hero_enchant: true,
  art_gen: true,
};

/** Имя-шахта по SQL: совпало с шахтой и ничем из того, что BY_NAME смотрит раньше. */
const sqlNameMine = (name: string) =>
  new RegExp(MINE_NAME_RE, "i").test(name) && !new RegExp(BEFORE_MINE_NAME_RE, "i").test(name);

describe("mine-cell-sql: тот же признак, что cellBuildingEffect", () => {
  it("список явных эффектов — ровно тот, что признаёт buildingEffect", () => {
    expect([...KNOWN_EFFECTS].sort()).toEqual(Object.keys(ALL).sort());
    for (const e of KNOWN_EFFECTS) expect(buildingEffect({ effect: e }, null)).toBe(e);
    for (const junk of ["", "Mine", "mines", "шахта", "none"])
      expect(buildingEffect({ effect: junk }, null)).toBeNull();
  });

  it("по имени: шахта, если её не перехватил эффект из BY_NAME раньше", () => {
    const names = [
      "Каменная Шахта",
      "Золотой рудник",
      "Gold Mine",
      "Склад шахтёра",
      "Верфь у шахты",
      "Древняя шахта",
      "Табличка «Шахта»",
      "Обзорная вышка",
      "Лесопилка",
      "Ратуша",
    ];
    for (const name of names) {
      expect(sqlNameMine(name)).toBe(buildingEffect(null, name) === "mine");
    }
  });

  it("лестница: эффект клетки → эффект шаблона → «поле есть — ничего» → имя", () => {
    const sql = mineCellSql("c").replace(/\s+/g, " ");
    const at = (s: string) => sql.indexOf(s);
    const cell = at("WHEN c.building_config->>'effect' IN (");
    const tpl = at("WHEN jsonb_typeof(mine_t.meta) = 'object' AND mine_t.meta->>'effect' IN (");
    const empty = at(
      "WHEN jsonb_typeof(mine_t.meta) = 'object' AND mine_t.meta ? 'effect' THEN false",
    );
    const name = at(`ELSE COALESCE(mine_t.name, '') ~* '${MINE_NAME_RE}'`);
    expect(cell).toBeGreaterThan(0);
    expect(tpl).toBeGreaterThan(cell);
    expect(empty).toBeGreaterThan(tpl);
    expect(name).toBeGreaterThan(empty);
    expect(sql).toContain(`AND NOT COALESCE(mine_t.name, '') ~* '${BEFORE_MINE_NAME_RE}'`);
    // Удалённый шаблон или шаблон без имени — «постройки нет» (loadCellBuilding).
    expect(sql).toContain(
      "FROM yuplink.mystic_item_template mine_t WHERE mine_t.id = c.building_id",
    );
    expect(sql).toContain("AND COALESCE(mine_t.name, '') <> ''");
  });

  it("JS-лестница на тех же случаях: клетка главнее шаблона, пустое поле — не угадывать", () => {
    // Лавка Алхимика (75,89) и Золотой Карьер (95,−134) на проде — шахты эффектом клетки.
    expect(cellBuildingEffect({ effect: "mine" }, { effect: "market" }, "Лавка Алхимика")).toBe(
      "mine",
    );
    expect(cellBuildingEffect({ effect: "field" }, { effect: "mine" }, "Шахта")).toBe("field");
    // «Лесопилка» — шахта только по meta.effect.
    expect(cellBuildingEffect(null, { effect: "mine" }, "Лесопилка")).toBe("mine");
    expect(cellBuildingEffect(null, { effect: "" }, "Шахта")).toBeNull();
    expect(cellBuildingEffect({ effect: "чушь" }, null, "Шахта")).toBe("mine");
  });

  it("алиас клетки подставляется везде", () => {
    const sql = mineCellSql("u");
    expect(sql).toContain("u.building_id IS NOT NULL");
    expect(sql).toContain("u.building_config->>'effect'");
    expect(sql).not.toMatch(/\bc\.building/);
  });
});
