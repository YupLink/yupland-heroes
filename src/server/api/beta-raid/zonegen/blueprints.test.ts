// Шаблоны городов: текст SQL, разбор строки из базы и два отказа
// (предустановленный не переписать и не удалить).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpExec = vi.fn();
/**
 * Отказ базы отдаём мимо vi.fn: отвергнутый промис в его mock.results раннер
 * считает необработанным и валит тест, хотя код его ловит. Мок возвращает
 * метку, а отказ делает обёртка.
 */
const FAIL = "__fail__";
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: (...a: unknown[]) => {
    const out = mcpExec(...a);
    return out === "__fail__" ? Promise.reject(new Error("relation does not exist")) : out;
  },
}));

import {
  deleteBlueprint,
  deleteBlueprintSql,
  listBlueprints,
  listBlueprintsSql,
  saveBlueprint,
  saveBlueprintInputSchema,
  toBlueprint,
  upsertBlueprintSql,
} from "./blueprints";
import type { TownBlueprint } from "@/lib/raid/zonegen/blueprint-types";

const bp = (over: Partial<TownBlueprint> = {}): TownBlueprint => ({
  id: "tbp_abc123",
  name: "Адский город",
  layout: "grid",
  size: 11,
  density: 0.3,
  slots: [{ buildingId: "b_hall", count: 1 }],
  roadId: null,
  built: true,
  note: null,
  updatedAt: null,
  auto: false,
  buildings: 12,
  kind: "auto",
  theme: "",
  ...over,
});

describe("listBlueprintsSql", () => {
  const sql = listBlueprintsSql();

  it("берёт состав и планировку, свежие сверху", () => {
    expect(sql).toContain("FROM yuplink.raid_town_blueprint");
    for (const col of ["layout", "size", "density", "slots", "built"]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("ORDER BY b.updated_at DESC, b.name");
  });
});

describe("upsertBlueprintSql", () => {
  it("перезапись по id, автора строки не переписывает", () => {
    const sql = upsertBlueprintSql(bp({ roadId: "r_stone", note: "под вулкан" }), "wallet.near");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(sql).toContain("updated_at = now()");
    expect(sql).not.toContain("created_by = EXCLUDED");
    expect(sql).toContain("'r_stone'");
    expect(sql).toContain("'под вулкан'");
    expect(sql).toContain(`'[{"buildingId":"b_hall","count":1}]'::jsonb`);
  });

  it("кавычка в имени не ломает запрос", () => {
    expect(upsertBlueprintSql(bp({ name: "Д'Артаньян" }), "w")).toContain("'Д''Артаньян'");
  });

  it("без дороги и пометки — NULL, а не пустая строка", () => {
    const sql = upsertBlueprintSql(bp(), "w");
    expect(sql).toContain("NULL");
    expect(sql).not.toContain("''");
  });
});

describe("toBlueprint", () => {
  it("читает строку базы, слоты приезжают текстом", () => {
    const got = toBlueprint({
      id: "tbp_1",
      name: "Порт",
      layout: "cross",
      size: "9",
      density: "0.26",
      roadId: null,
      built: "t",
      slots: '[{"buildingId":"b_dock","count":2,"fill":false}]',
      note: null,
      updatedAt: "2026-09-24T10:00:00Z",
    });
    expect(got.layout).toBe("cross");
    expect(got.size).toBe(9);
    expect(got.density).toBeCloseTo(0.26);
    expect(got.built).toBe(true);
    expect(got.slots).toEqual([{ buildingId: "b_dock", count: 2, fill: false }]);
    // Строка до 25.09: ручной набор владельца, автоподбор его не трогает.
    expect(got.auto).toBe(false);
    expect(got.buildings).toBe(12);
    expect(got.theme).toBe("");
  });

  it("строку правили руками — чиним на месте, а не роняем панель", () => {
    const got = toBlueprint({
      id: "tbp_2",
      name: null,
      layout: "кольцо",
      size: 900,
      density: 40,
      roadId: null,
      built: null,
      slots: "не json",
      note: null,
      updatedAt: null,
    });
    expect(got.name).toBe("tbp_2");
    expect(got.layout).toBe("organic");
    expect(got.size).toBe(25);
    expect(got.density).toBe(0.8);
    expect(got.slots).toEqual([]);
  });
});

describe("вход adminSaveTownBlueprint", () => {
  const body = {
    layout: "ring",
    size: 7,
    density: 0.26,
    slots: [{ buildingId: "b_hall", count: 1 }],
    roadId: null,
    built: true,
  };

  it("имя обязательно и не длиннее шестидесяти", () => {
    expect(saveBlueprintInputSchema.safeParse({ name: "", settlement: body }).success).toBe(false);
    expect(
      saveBlueprintInputSchema.safeParse({ name: "x".repeat(61), settlement: body }).success,
    ).toBe(false);
    expect(saveBlueprintInputSchema.safeParse({ name: " Порт ", settlement: body }).success).toBe(
      true,
    );
  });

  it("состав проверяется схемой рецепта: чужой слот не пройдёт", () => {
    const bad = { ...body, slots: [{ buildingId: "b", count: 500 }] };
    expect(saveBlueprintInputSchema.safeParse({ name: "Порт", settlement: bad }).success).toBe(
      false,
    );
  });

  it("сид, число поселений и поля старого клиента в шаблон не попадают", () => {
    // Лишнее схема молча отбрасывает: старая вкладка шлёт поля, которых в
    // шаблоне больше нет, — сохранение от этого не падает.
    const settlement = { ...body, seed: 7, count: 3, retired: true };
    const parsed = saveBlueprintInputSchema.parse({ name: "Порт", settlement });
    expect(Object.keys(parsed.settlement).sort()).toEqual([
      "auto",
      "buildings",
      "built",
      "density",
      "kind",
      "layout",
      "roadId",
      "size",
      "slots",
      "theme",
    ]);
  });
});

describe("запись и удаление", () => {
  const input = {
    name: "Адский",
    settlement: {
      layout: "grid" as const,
      size: 9,
      density: 0.3,
      slots: [{ buildingId: "b_hall", count: 1 }],
      roadId: null,
      built: true,
      auto: false,
      buildings: 12,
      kind: "auto" as const,
      theme: "",
    },
  };

  beforeEach(() => mcpExec.mockReset());

  it("без id заводит свой id с префиксом tbp_", async () => {
    mcpExec.mockResolvedValue([]);
    const saved = await saveBlueprint(input, "wallet.near");
    expect(saved.id.startsWith("tbp_")).toBe(true);
    expect(String(mcpExec.mock.calls[0][0])).toContain(`'${saved.id}'`);
  });

  it("предустановленный не переписать и не удалить", async () => {
    await expect(saveBlueprint({ ...input, id: "preset:town-organic" }, "w")).rejects.toThrow(
      /сохрани его как свой/,
    );
    await expect(deleteBlueprint("preset:town-organic")).rejects.toThrow(/удалить нельзя/);
    expect(mcpExec).not.toHaveBeenCalled();
  });

  it("чужой id не принимаем — перезапись только своей строки", async () => {
    await expect(saveBlueprint({ ...input, id: "raid_map_cells" }, "w")).rejects.toThrow(
      /Непонятный id/,
    );
    expect(mcpExec).not.toHaveBeenCalled();
  });

  it("удаление — одна строка по id", async () => {
    mcpExec.mockResolvedValue([]);
    await deleteBlueprint("tbp_abc123");
    expect(deleteBlueprintSql("tbp_abc123")).toContain(
      "DELETE FROM yuplink.raid_town_blueprint WHERE id = 'tbp_abc123'",
    );
  });

  it("базы ещё нет — список пуст, а не отказ на всю панель", async () => {
    mcpExec.mockReturnValue(FAIL);
    expect(await listBlueprints()).toEqual([]);
  });
});
