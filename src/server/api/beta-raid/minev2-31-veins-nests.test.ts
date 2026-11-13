// Миграция minev2-31 (жилы гнёздами по 1–2 клетки, ПРАВИЛА §8.59 п. 13) и
// поколение снимка: жилы едут только в полном снимке, версия карты от
// перерисовки не меняется — значит ASSEMBLY_GEN и GEN mapCache подняты вместе.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${rel}`, import.meta.url)), "utf8");

const m31 = read("migrations/minev2-31-veins-nests.sql");
const m30 = read("migrations/minev2-30-veins.sql");

/** Правила «где может лежать жила» — кусок запроса от FROM до декора. */
function eligibility(src: string): string {
  const i = src.indexOf(
    "      FROM yuplink.raid_map_cells c\n      JOIN yuplink.mystic_item_template t",
  );
  const j = src.indexOf("= 'true'));", i);
  if (i < 0 || j < 0) throw new Error("нет запроса подходящих клеток");
  return src.slice(i, j);
}

describe("миграция minev2-31: оформление", () => {
  it("шапка, BEGIN/COMMIT, lock_timeout", () => {
    expect(m31.trimStart().startsWith("--")).toBe(true);
    expect(m31).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(m31.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(m31).not.toMatch(/DROP TABLE|TRUNCATE/i);
  });

  it("повтор ничего не трогает: отметка проверяется до удаления и пишется в той же транзакции", () => {
    const guard = m31.indexOf("IF EXISTS (SELECT 1 FROM yuplink.settings WHERE key = v_mark)");
    const del = m31.indexOf("DELETE FROM yuplink.raid_map_vein");
    expect(guard).toBeGreaterThan(0);
    expect(del).toBeGreaterThan(guard);
    expect(m31).toContain("v_mark  constant text := 'veins_nests_31:rmap_UthOURxc'");
    expect(m31).toMatch(/INSERT INTO yuplink\.settings \(key, value\)\s+VALUES \(v_mark,/);
  });

  it("жила под шахтой остаётся: удаление обходит raid_mine_state, resource и блок шахты", () => {
    const del = m31.slice(
      m31.indexOf("DELETE FROM yuplink.raid_map_vein"),
      m31.indexOf("CREATE TEMP TABLE nest_pick"),
    );
    expect(del).toContain("WHERE v.map_id = v_map");
    expect(del).toContain("NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_state s");
    expect(del).toContain("c.building_config ? 'resource'");
    expect(del).toContain("g.group_id = c.group_id");
    // Оставленные считаются гнёздами и в базу заново не пишутся.
    expect(m31).toContain(
      "INSERT INTO nest_pick VALUES (rec.q, rec.r, rec.kind, rec.rot, v_nest, true);",
    );
    expect(m31).toContain("SELECT v_map, q, r, kind, rot FROM nest_pick WHERE NOT kept");
  });
});

describe("миграция minev2-31: раскладка", () => {
  it("правила подходящих клеток — те же, что в minev2-30", () => {
    expect(eligibility(m31)).toBe(eligibility(m30));
  });

  it("по 100 гнёзд каждого вида, гнездо 1–2 клетки, между гнёздами не меньше 3", () => {
    expect(m31).toContain("v_quota constant int  := 100;");
    expect(m31).toContain("v_sep   constant int  := 3;");
    // Вторая клетка — только сосед зерна, третьей нет.
    expect(m31.match(/INSERT INTO nest_pick\n/g)).toHaveLength(2);
    expect(m31).toContain("JOIN nest_ok o ON o.q = rec.q + d.dq AND o.r = rec.r + d.dr");
    expect(m31).toMatch(/x\.nest <> v_nest[\s\S]*?\/ 2 < v_sep/);
    // Зерно — не ближе GAP к любой жиле; GAP не опускается ниже SEP.
    expect(m31).toMatch(/FROM nest_pick p\s+WHERE \(abs[\s\S]*?\/ 2 < v_gap\);/);
    expect(m31).toContain("OR v_gap <= v_sep;");
  });

  it("детерминировано и без недобора: setseed на проход, нехватка места — исключение", () => {
    expect(m31).toContain("PERFORM setseed(");
    expect(m31).toMatch(/RAISE EXCEPTION 'veins: на % не хватило места/);
    expect(m31).toContain("(floor(random() * 6))::int * 60");
  });
});

describe("поколение снимка после перерисовки жил", () => {
  const gen = (src: string, name: string): number => {
    const m = src.match(new RegExp(`const ${name} = (\\d+);`));
    if (!m) throw new Error(`нет ${name}`);
    return Number(m[1]);
  };
  const blob = read("src/routes/api.beta-raid.map-blob.ts");
  const cache = read("src/components/beta-raid/mapCache.ts");

  // 6 — 23.10: новая картинка золотого гриба (облик в базе), поднято вместе.
  it("ASSEMBLY_GEN и GEN mapCache — не ниже 5 (перерисовка жил), вместе", () => {
    expect(gen(blob, "ASSEMBLY_GEN")).toBeGreaterThanOrEqual(5);
    expect(gen(cache, "GEN")).toBe(gen(blob, "ASSEMBLY_GEN"));
  });

  it("прежние ключи кэша устройства (g2..GEN−1) удаляются при записи", () => {
    for (let g = 2; g < gen(cache, "GEN"); g++) {
      expect(cache).toContain(`\`\${mapId}:\${variant}:g${g}\`,`);
    }
  });
});
