// Тексты записи мира: карта — черновик, клетка — по своему режиму, ратуша и
// лавка «если ещё нет», склад ратуши — норма пульта, недописанный мир убирается.
import { describe, expect, it } from "vitest";
import type { WorldCell } from "@/lib/raid/worldgen/spec";
import { cellsSql, dropWorldSql, insertMapSql, shopsSql, tiersSql, townsSql } from "./write-sql";

const cell = (o: Partial<WorldCell>): WorldCell => ({
  q: 1,
  r: 2,
  terrainId: "t_grass",
  decorationId: null,
  roadId: null,
  buildingId: null,
  buildingSkinId: null,
  buildingConfig: null,
  tier: null,
  objectId: null,
  objectConfig: null,
  mode: "base",
  ...o,
});

describe("запись мира", () => {
  it("новая карта — не активна", () => {
    expect(insertMapSql({ id: "rmap_x", name: "Тест", size: 128 })).toContain(
      "128, false, now(), now()",
    );
  });

  it("простая — только в пустое место; у дороги — снимает декор; дом — поверх целиком", () => {
    const [base, clear, built] = cellsSql("rmap_x", [
      cell({ decorationId: "d1" }),
      cell({ q: 2, mode: "clear" }),
      cell({
        q: 3,
        mode: "built",
        buildingId: "b1",
        buildingSkinId: "bskin_1",
        objectConfig: { a: "it's" },
      }),
    ]);
    expect(base).toContain(
      "('rmap_x', 1, 2, 't_grass', NULL, NULL, NULL, 'd1', NULL, NULL, NULL, now())",
    );
    expect(base).toContain("ON CONFLICT (map_id, q, r) DO NOTHING");
    expect(clear).toContain("DO UPDATE SET decoration_id = NULL");
    // Своя настройка постройки (храм, покои с образца) едет вместе с домом.
    expect(built).toContain(
      "building_id = EXCLUDED.building_id, building_config = EXCLUDED.building_config",
    );
    expect(built).toContain(`'{"a":"it''s"}'::jsonb`);
  });

  it("пачки по 400 строк", () => {
    const cells = Array.from({ length: 900 }, (_, i) => cell({ q: i }));
    expect(cellsSql("m", cells)).toHaveLength(3);
  });

  it("тир — только у домов с тиром", () => {
    const sql = tiersSql("m", [
      cell({ buildingId: "b", tier: 2 }),
      cell({ q: 5, buildingId: "b" }),
    ]);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("('m', 1, 2, 2, now(), 'worldgen')");
  });

  it("ратуша — «если нет», со складом по норме; лавка привязана к ратуше", () => {
    const goods = [
      {
        id: "g1",
        kind: "custom",
        refId: "cst_x",
        token: null,
        operation: "both",
        marketPrice: 2,
        consumePerResident: 0.1,
        producePerDay: 5,
      },
    ];
    const [town, stock] = townsSql("m", [
      { q: 4, r: 5, config: { name: "Ирий", residents: 100, goods } },
    ]);
    expect(town).toContain("ON CONFLICT (map_id, q, r) DO NOTHING");
    expect(town).toContain('"name":"Ирий"');
    // Норма склада — 10 дней расхода: 0.1 × 100 жителей × 10.
    expect(stock).toContain("('m', 4, 5, 'g1', 100, now())");
    expect(shopsSql("m", { shops: [{ q: 6, r: 5, hallQ: 4, hallR: 5 }] })[0]).toContain(
      "('m', 6, 5, 4, 5, now())",
    );
  });

  it("недописанный мир уходит целиком: склады, ратуши, лавки, тиры и сама карта", () => {
    const sql = dropWorldSql("rmap_x").join("\n");
    for (const t of [
      "raid_town_stock",
      "raid_town",
      "raid_market_shop",
      "beta_raid_building_state",
    ]) {
      expect(sql).toContain(`DELETE FROM yuplink.${t} WHERE map_id = 'rmap_x'`);
    }
    expect(sql).toContain("DELETE FROM yuplink.raid_maps WHERE id = 'rmap_x'");
  });
});
