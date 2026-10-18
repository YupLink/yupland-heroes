// Справочник построек: «ставим только то, что есть, и только с честным
// эффектом». Правило про meta.effect живёт в SQL — проверяем текст запроса,
// как affinity.test; разбор строк — на данных.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpExec = vi.fn();
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: (...a: unknown[]) => mcpExec(...a) }));

import {
  buildingsSql,
  dropBuildingCatalogCache,
  loadBuildingOptions,
  roadsSql,
  skinsSql,
  toOptions,
} from "./catalog-buildings";

describe("buildingsSql", () => {
  const sql = buildingsSql();

  it("берёт только живые постройки", () => {
    expect(sql).toContain("t.kind = 'building'");
    expect(sql).toContain("COALESCE(t.active, true)");
  });

  it("эффект читается из meta, а не угадывается по имени", () => {
    expect(sql).toContain("t.meta->>'effect'");
    expect(sql).not.toMatch(/ILIKE/i);
  });

  it("тиры не роняют панель, если в meta не массив", () => {
    expect(sql).toContain("jsonb_typeof(t.meta->'tiers') = 'array'");
    expect(sql).toContain("ELSE 0");
  });

  it("дороги — свой вид шаблона", () => {
    expect(roadsSql()).toContain("t.kind = 'road'");
  });
});

describe("toOptions", () => {
  it("эффект есть — считаем нужду в настройке по нему", () => {
    const opts = toOptions([
      { id: "b_mine", name: "Шахта", effect: "mine", tiers: 3 },
      { id: "b_market", name: "Маркет", effect: "market", tiers: 1 },
      { id: "b_sign", name: "Табличка", effect: "sign", tiers: "1" },
    ]);
    expect(opts.map((o) => o.needsConfig)).toEqual([true, false, true]);
    expect(opts[0].tiers).toBe(3);
    expect(opts[2].tiers).toBe(1);
  });

  it("эффекта нет — null, а не догадка по названию", () => {
    const [hall] = toOptions([{ id: "b_hall", name: "Ратуша", effect: null, tiers: 0 }]);
    expect(hall.effect).toBeNull();
    expect(hall.needsConfig).toBe(false);
    expect(hall.tiers).toBe(0);
  });

  it("пустая строка эффекта — тоже null, а имя без имени — это id", () => {
    const [x] = toOptions([{ id: "b_x", name: null, effect: "  ", tiers: -2 }]);
    expect(x).toEqual({
      id: "b_x",
      name: "b_x",
      effect: null,
      tiers: 0,
      needsConfig: false,
      skins: [],
    });
  });
});

describe("облики в справочнике", () => {
  it("SQL: облик едет к шаблону своей группы, группа без шаблона — мимо", () => {
    const sql = skinsSql();
    expect(sql).toContain("FROM yuplink.raid_building_skin s");
    expect(sql).toContain("JOIN yuplink.raid_building_group g ON g.id = s.group_id");
    expect(sql).toContain("g.template_id IS NOT NULL");
    expect(sql).toContain("s.id, s.name, g.template_id");
  });

  it("облики нескольких групп одного шаблона собираются вместе, чужие не липнут", () => {
    const [temple, shop] = toOptions(
      [
        { id: "b_temple", name: "Храм", effect: "boost", tiers: 2 },
        { id: "b_shop", name: "Лавка", effect: null, tiers: 0 },
      ],
      [
        { id: "s1", name: "Храм Юпик", template_id: "b_temple" },
        { id: 7, name: "Храм Кабан", template_id: "b_temple" },
        { id: "s3", name: null, template_id: "b_gone" },
        { id: "s4", name: "Сирота", template_id: null },
      ],
    );
    expect(temple.skins).toEqual([
      { id: "s1", name: "Храм Юпик" },
      { id: "7", name: "Храм Кабан" },
    ]);
    expect(shop.skins).toEqual([]);
  });

  describe("loadBuildingOptions", () => {
    beforeEach(() => {
      mcpExec.mockReset();
      dropBuildingCatalogCache();
    });

    it("три запроса: шаблоны, облики и метки; облики разложены по шаблонам", async () => {
      mcpExec.mockImplementation(async (sql: string) =>
        sql.includes("raid_asset_tags")
          ? [
              { ref_id: "s1", terrains: [], races: ["Дракон"], auto: true },
              { ref_id: "b_shop", terrains: ["t_grass"], races: [], auto: false },
            ]
          : sql.includes("raid_building_skin")
            ? [{ id: "s1", name: "Лавка Дракон", template_id: "b_shop" }]
            : [{ id: "b_shop", name: "Лавка", effect: null, tiers: 0 }],
      );
      const [shop] = await loadBuildingOptions();
      // Метки доехали: раса у облика, местность у шаблона.
      expect(shop.skins).toEqual([{ id: "s1", name: "Лавка Дракон", races: ["Дракон"] }]);
      expect(shop.terrains).toEqual(["t_grass"]);
      expect(mcpExec).toHaveBeenCalledTimes(3);
      // Кэш тот же: второе открытие панели базу не трогает.
      await loadBuildingOptions();
      expect(mcpExec).toHaveBeenCalledTimes(3);
    });

    it("таблиц обликов нет — справочник всё равно отдаётся, облики пустые", async () => {
      mcpExec.mockImplementation(async (sql: string) => {
        if (sql.includes("raid_building_skin")) throw new Error("relation does not exist");
        return [{ id: "b_shop", name: "Лавка", effect: null, tiers: 0 }];
      });
      const [shop] = await loadBuildingOptions();
      expect(shop.skins).toEqual([]);
    });
  });
});
