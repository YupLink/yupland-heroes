// Облик и настройки постройки — только поверх постройки (владелец, 05.10.2026:
// табличка «Город - Вихоток» на карте, которую не прочитать и не удалить).
// «Призрак» — облик без постройки — база больше не примет ни одним путём.
import { describe, expect, it } from "vitest";
import { cellStatements } from "./admin-cell-sql";

/** Оператор апсерта клетки и его SET после ON CONFLICT. */
function upsert(stmts: string[]): { values: string; set: string } {
  const sql = stmts.find((s) => s.includes("INSERT INTO yuplink.raid_map_cells"));
  if (!sql) throw new Error("нет апсерта клетки");
  const [head, set] = sql.split("DO UPDATE SET");
  return { values: head.slice(head.indexOf("VALUES")), set };
}

const at = { q: -34, r: 101 };

describe("колонки постройки в правке клетки", () => {
  it("убрать — уносит облик и настройки, даже если постройки уже нет", () => {
    const { set } = upsert(cellStatements("m", { ...at, buildingId: null }));
    expect(set).toContain("building_id = NULL");
    expect(set).toContain("building_skin_id = NULL");
    expect(set).toContain("building_config = NULL");
    // Прежнее правило снимало облик только при СМЕНЕ постройки — призрак, где
    // её и так нет, оставался на месте.
    expect(set).not.toContain("c.building_skin_id END");
  });

  it("убрать вместе с выбранным до выгрузки обликом — облик не пишется", () => {
    const { set } = upsert(
      cellStatements("m", { ...at, buildingId: null, buildingSkinId: "bskin_x" }),
    );
    expect(set).not.toContain("bskin_x");
    expect(set).toContain("building_skin_id = NULL");
  });

  it("облик без постройки в правке — только поверх уже стоящей", () => {
    const { values, set } = upsert(cellStatements("m", { ...at, buildingSkinId: "bskin_x" }));
    expect(set).toContain(
      "building_skin_id = CASE WHEN c.building_id IS NOT NULL THEN 'bskin_x' END",
    );
    // Новой клетке (строки ещё нет) облик без постройки не достаётся.
    expect(values).not.toContain("bskin_x");
  });

  it("облик, просочившийся в buildingId как «skin:<id>», — по тому же правилу", () => {
    const { set } = upsert(cellStatements("m", { ...at, buildingId: "skin:bskin_x" }));
    expect(set).not.toMatch(/building_id = 'skin:/);
    expect(set).toContain("CASE WHEN c.building_id IS NOT NULL THEN 'bskin_x' END");
  });

  it("настройки без постройки (текст таблички) — только поверх стоящей", () => {
    const { values, set } = upsert(
      cellStatements("m", { ...at, buildingConfig: { text: "Город - Вихоток" } }),
    );
    expect(set).toMatch(
      /building_config = CASE WHEN c\.building_id IS NOT NULL THEN '.*Вихоток.*'::jsonb END/,
    );
    expect(values).not.toContain("Вихоток");
  });

  it("постройка с обликом и текстом одной правкой — пишутся как есть", () => {
    const { values, set } = upsert(
      cellStatements("m", {
        ...at,
        buildingId: "building_sign",
        buildingSkinId: "bskin_x",
        buildingConfig: { text: "Город - Вихоток" },
      }),
    );
    expect(set).toContain("building_id = 'building_sign'");
    expect(set).toContain("building_skin_id = 'bskin_x'");
    expect(set).not.toContain("CASE WHEN c.building_id IS NOT NULL");
    expect(values).toContain("'bskin_x'");
    expect(values).toContain("Вихоток");
  });

  it("смена постройки без облика — облик и текст прежней снимаются, покраска той же — нет", () => {
    const { set } = upsert(cellStatements("m", { ...at, buildingId: "building_market" }));
    expect(set).toContain(
      "building_skin_id = CASE WHEN c.building_id IS DISTINCT FROM 'building_market'::text",
    );
    expect(set).toContain(
      "building_config = CASE WHEN c.building_id IS DISTINCT FROM 'building_market'::text",
    );
  });
});
