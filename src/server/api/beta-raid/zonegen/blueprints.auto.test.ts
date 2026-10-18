// Автоподбор в своих шаблонах (25.09): масштаб и тема живут в колонках
// миграции town-06, а код переживает базу, где её ещё не накатили — список
// читается через to_jsonb, запись автоподбора идёт отдельным UPDATE.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpExec = vi.fn();
/** Отказ базы — мимо vi.fn, как в blueprints.test: иначе раннер ловит его сам. */
const FAIL = "__fail__";
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: (...a: unknown[]) => {
    const out = mcpExec(...a);
    return out === "__fail__" ? Promise.reject(new Error("column auto does not exist")) : out;
  },
}));

import { blueprintAutoSql, listBlueprintsSql, saveBlueprint, toBlueprint } from "./blueprints";
import type { TownBlueprint } from "@/lib/raid/zonegen/blueprint-types";

const bp = (over: Partial<TownBlueprint> = {}): TownBlueprint => ({
  id: "tbp_abc123",
  name: "Кабаний городок",
  layout: "organic",
  size: 12,
  density: 0.3,
  slots: [],
  roadId: null,
  built: true,
  note: null,
  updatedAt: null,
  auto: true,
  buildings: 24,
  kind: "port",
  theme: "Кабан",
  ...over,
});

describe("чтение и запись автоподбора", () => {
  it("список читает колонки через to_jsonb: до town-06 не падает", () => {
    const sql = listBlueprintsSql();
    expect(sql).toContain("to_jsonb(b)->'auto' AS auto");
    expect(sql).toContain("to_jsonb(b)->'buildings' AS buildings");
    expect(sql).toContain("to_jsonb(b)->>'theme' AS theme");
    expect(sql).toContain("to_jsonb(b)->>'kind' AS kind");
  });

  it("масштаб и тема — отдельным UPDATE своей строки", () => {
    const sql = blueprintAutoSql(bp());
    expect(sql).toContain("UPDATE yuplink.raid_town_blueprint SET auto = true, buildings = 24");
    expect(sql).toContain("theme = 'Кабан'");
    expect(sql).toContain("kind = 'port'");
    expect(sql).toContain("WHERE id = 'tbp_abc123'");
  });

  it("строка из базы: масштаб в границах рецепта, тема как есть", () => {
    const got = toBlueprint({
      id: "tbp_3",
      name: "Кабаний городок",
      layout: "organic",
      size: 12,
      density: 0.3,
      roadId: null,
      built: true,
      slots: [],
      note: null,
      updatedAt: null,
      auto: true,
      buildings: 99,
      theme: "Кабан",
      kind: "port",
    });
    expect(got.layout).toBe("organic");
    expect(got.auto).toBe(true);
    expect(got.buildings).toBe(40);
    expect(got.theme).toBe("Кабан");
    expect(got.kind).toBe("port");
  });

  it("заказ не из списка или нет колонки — auto", () => {
    const row = { id: "t", name: "x", layout: "organic", size: 7, density: 0.3, roadId: null };
    const base = { ...row, built: true, slots: [], note: null, updatedAt: null };
    expect(toBlueprint({ ...base, kind: "castle" }).kind).toBe("auto");
    expect(toBlueprint(base).kind).toBe("auto");
  });
});

describe("saveBlueprint с автоподбором", () => {
  const { id: _id, name: _n, note: _note, updatedAt: _u, ...settlement } = bp();
  const input = { name: "Кабаний городок", settlement };

  beforeEach(() => mcpExec.mockReset());

  it("шаблон, потом его автоподбор — двумя запросами", async () => {
    mcpExec.mockResolvedValue([]);
    const saved = await saveBlueprint(input, "wallet.near");
    expect(String(mcpExec.mock.calls[0][0])).toContain("INSERT INTO yuplink.raid_town_blueprint");
    expect(String(mcpExec.mock.calls[1][0])).toContain(`SET auto = true, buildings = 24`);
    expect(String(mcpExec.mock.calls[1][0])).toContain(`'${saved.id}'`);
  });

  it("нет миграции town-06 — шаблон всё равно сохранён", async () => {
    mcpExec.mockImplementation((sql?: string) => (String(sql).startsWith("UPDATE") ? FAIL : []));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const saved = await saveBlueprint(input, "w");
    expect(saved.name).toBe("Кабаний городок");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
