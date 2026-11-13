// Админка взаимодействия с декором: инструмент. Только админ; инструмент —
// существующий свой товар; старая вкладка без поля не снимает инструмент
// (иначе одно «Сохранить» делало декор бесплатным). Надпись действия (29.09) —
// так же: чистится, длина проверяется, старая вкладка её не стирает.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  admin: true,
  stored: "cst_axe",
  /** meta.interact.toolItemIds: undefined — поля нет (старая запись). */
  list: undefined as string[] | undefined,
  respawn: "45" as string | null,
  label: null as unknown,
  meta: null as Record<string, unknown> | null,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_custom_item")) {
      return ["cst_axe", "cst_pick"].filter((id) => sql.includes(`'${id}'`)).map((id) => ({ id }));
    }
    if (sql.includes("SELECT meta->'interact' AS interact")) return [{ interact: s.meta }];
    if (sql.includes("UPDATE yuplink.mystic_item_template")) {
      // Прежнее значение из meta, если поле не пришло; иначе — присланное.
      const was = s.stored;
      s.stored = /jsonb_build_object\('toolItemId', '([^']*)'\)/.exec(sql)?.[1] ?? was;
      // Список: JSON-литерал пишется, COALESCE (без полей) — прежний; CASE
      // (старая вкладка с одним) — прежний, если прислан его первый, иначе [он].
      const lm2 = /jsonb_build_object\('toolItemIds', '([^']*)'::jsonb\)/.exec(sql)?.[1];
      const one = /ELSE jsonb_build_array\('([^']*)'\) END\)/.exec(sql)?.[1];
      if (lm2 !== undefined) s.list = JSON.parse(lm2) as string[];
      else if (one && !(s.list && [was, s.list[0]].includes(one))) s.list = [one];
      // «Респавн, мин»: число, «снять» или прежнее (старая вкладка).
      const rm = /'respawnMin', to_jsonb\((\d+)\)/.exec(sql)?.[1];
      const cleared = sql.includes("jsonb_build_object('respawnMin', 'null'::jsonb)");
      s.respawn = rm ?? (cleared ? null : s.respawn);
      // Надпись: JSON-литерал или 'null' пишутся; COALESCE (старая вкладка) — прежняя.
      const lm = /jsonb_build_object\('label', '((?:[^']|'')*)'::jsonb\)/.exec(sql)?.[1];
      if (lm !== undefined) s.label = JSON.parse(lm.replace(/''/g, "'"));
      const row = { toolItemId: s.stored, toolItemIds: s.list, respawnMin: s.respawn };
      return [{ id: "decoration_pine", ...row, label: s.label }];
    }
    return [];
  },
}));
vi.mock("../../auth", () => ({
  getCurrentWallet: () => "w1",
  isAdminWallet: () => s.admin,
}));
vi.mock("./decor-interact", () => ({ dropInteractiveDecorCache: () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

type Input = {
  id: string;
  on: boolean;
  cost: number;
  itemId: string;
  amount: string;
  toolItemId?: string;
  toolItemIds?: string[];
  respawnMin?: number;
  label?: { ru?: string; en?: string };
};
type Label = { ru: string; en: string };
const mod = await import("./decor-interact-admin");
const save = mod.adminSetDecorInteract as unknown as (a: {
  data: Input;
}) => Promise<{ toolItemId: string; toolItemIds: string[]; respawnMin: number; label: Label }>;
const load = mod.adminGetDecorInteract as unknown as (a: {
  data: { id: string };
}) => Promise<{ label: Label; toolItemId: string; toolItemIds: string[] }>;
const base: Input = { id: "decoration_pine", on: true, cost: 1, itemId: "cst_wood", amount: "2" };
const updates = () => s.sql.filter((x) => x.includes("UPDATE yuplink.mystic_item_template"));

const fresh = () => ({ sql: [], admin: true, stored: "cst_axe", respawn: "45", label: null });
beforeEach(() => Object.assign(s, fresh(), { list: undefined, meta: null }));

describe("adminSetDecorInteract — инструмент", () => {
  it("не админ — отказ, в базу ничего", async () => {
    s.admin = false;
    // Не админ без права catalogs (справочники без денег, 04.11.2026) — «Нет доступа».
    await expect(save({ data: { ...base, toolItemId: "cst_axe" } })).rejects.toThrow(
      "Нет доступа",
    );
    expect(s.sql).toHaveLength(0);
  });

  it("несуществующий товар-инструмент — отказ, meta не тронута", async () => {
    await expect(save({ data: { ...base, toolItemId: "cst_missing" } })).rejects.toThrow(
      "Инструмент не найден",
    );
    expect(updates()).toHaveLength(0);
  });

  it("мусор вместо id — отказ до базы", async () => {
    await expect(save({ data: { ...base, toolItemId: "x' OR 1=1" } })).rejects.toThrow(
      "только свой товар",
    );
    expect(s.sql).toHaveLength(0);
  });

  it("существующий инструмент сохраняется", async () => {
    s.stored = "";
    const res = await save({ data: { ...base, toolItemId: "cst_axe" } });
    expect(res.toolItemId).toBe("cst_axe");
    expect(s.stored).toBe("cst_axe");
  });

  it("пустая строка — инструмент снят", async () => {
    const res = await save({ data: { ...base, toolItemId: "" } });
    expect(res.toolItemId).toBe("");
    expect(s.stored).toBe("");
  });

  it("старая вкладка без поля — инструмент остаётся прежним", async () => {
    const res = await save({ data: base });
    expect(updates()[0]).toContain("COALESCE(meta->'interact'->>'toolItemId', '')");
    expect(res.toolItemId).toBe("cst_axe");
    expect(s.stored).toBe("cst_axe");
  });
});

describe("adminSetDecorInteract — «Респавн, мин»", () => {
  it("число сохраняется, 0 — снят, старая вкладка без поля — прежнее", async () => {
    expect((await save({ data: { ...base, respawnMin: 30 } })).respawnMin).toBe(30);
    expect((await save({ data: base })).respawnMin).toBe(30);
    expect(updates()[1]).toContain("COALESCE(meta->'interact'->'respawnMin', 'null'::jsonb)");
    expect((await save({ data: { ...base, respawnMin: 0 } })).respawnMin).toBe(0);
    expect(s.respawn).toBeNull();
  });
});

describe("adminSetDecorInteract — надпись действия", () => {
  it("сохраняется очищенной, ответ — тем, что легло в базу", async () => {
    const res = await save({ data: { ...base, label: { ru: "  Срубить   ель ", en: " Chop " } } });
    expect(s.label).toEqual({ ru: "Срубить ель", en: "Chop" });
    expect(res.label).toEqual({ ru: "Срубить ель", en: "Chop" });
  });

  it("только ru — en не пишется", async () => {
    const res = await save({ data: { ...base, label: { ru: "Срубить", en: "" } } });
    expect(s.label).toEqual({ ru: "Срубить" });
    expect(res.label).toEqual({ ru: "Срубить", en: "" });
  });

  it("пустые строки — надпись снята", async () => {
    s.label = { ru: "Срубить" };
    const res = await save({ data: { ...base, label: { ru: "  ", en: "" } } });
    expect(updates()[0]).toContain("jsonb_build_object('label', 'null'::jsonb)");
    expect(s.label).toBeNull();
    expect(res.label).toEqual({ ru: "", en: "" });
  });

  it("длиннее потолка — отказ до базы", async () => {
    await expect(
      save({ data: { ...base, label: { ru: "я".repeat(21), en: "" } } }),
    ).rejects.toThrow("до 20 знаков");
    expect(s.sql).toHaveLength(0);
  });

  it("старая вкладка без поля — надпись прежняя", async () => {
    s.label = { ru: "Срубить", en: "Chop" };
    const res = await save({ data: base });
    expect(updates()[0]).toContain("COALESCE(meta->'interact'->'label', 'null'::jsonb)");
    expect(s.label).toEqual({ ru: "Срубить", en: "Chop" });
    expect(res.label).toEqual({ ru: "Срубить", en: "Chop" });
  });

  it("кавычка в надписи не ломает SQL", async () => {
    await save({ data: { ...base, label: { ru: "Рубить д'ерево", en: 'Chop "it"' } } });
    expect(updates()[0]).toContain("д''ерево");
    expect(s.label).toEqual({ ru: "Рубить д'ерево", en: 'Chop "it"' });
  });

  it("форма открывается с надписью из meta; без неё — пустые поля", async () => {
    s.meta = { on: true, label: { ru: " Добыть ", en: "Mine" } };
    expect((await load({ data: { id: "decoration_pine" } })).label).toEqual({
      ru: "Добыть",
      en: "Mine",
    });
    s.meta = { on: true };
    expect((await load({ data: { id: "decoration_pine" } })).label).toEqual({ ru: "", en: "" });
  });
});

describe("adminSetDecorInteract — несколько инструментов (05.10)", () => {
  it("список пишется целиком, первый — в toolItemId; повторы схлопываются", async () => {
    const res = await save({ data: { ...base, toolItemIds: ["cst_pick", "cst_axe", "cst_pick"] } });
    expect(updates()[0]).toContain(`jsonb_build_object('toolItemId', 'cst_pick')`);
    expect(s.list).toEqual(["cst_pick", "cst_axe"]);
    expect(res).toMatchObject({ toolItemId: "cst_pick", toolItemIds: ["cst_pick", "cst_axe"] });
  });

  it("один из списка не найден или мусор — отказ, meta не тронута", async () => {
    await expect(save({ data: { ...base, toolItemIds: ["cst_axe", "cst_gone"] } })).rejects.toThrow(
      "Инструмент не найден",
    );
    await expect(
      save({ data: { ...base, toolItemIds: ["cst_axe", "x' OR 1=1"] } }),
    ).rejects.toThrow("только свой товар");
    expect(updates()).toHaveLength(0);
  });

  it("пустой список — инструменты сняты; старая вкладка без полей — список прежний", async () => {
    s.list = ["cst_axe", "cst_pick"];
    const kept = await save({ data: base });
    expect(updates()[0]).toContain("COALESCE(meta->'interact'->'toolItemIds', 'null'::jsonb)");
    expect(kept.toolItemIds).toEqual(["cst_axe", "cst_pick"]);
    const res = await save({ data: { ...base, toolItemIds: [] } });
    expect([s.stored, s.list]).toEqual(["", []]);
    expect(res).toMatchObject({ toolItemId: "", toolItemIds: [] });
  });

  it("старая вкладка шлёт первый из списка — список цел; другой — [он]", async () => {
    s.list = ["cst_axe", "cst_pick"];
    const kept = await save({ data: { ...base, cost: 5, toolItemId: "cst_axe" } });
    expect(updates()[0]).toMatch(
      /IN \(meta->'interact'->>'toolItemId', meta->'interact'->'toolItemIds'->>0\)/,
    );
    expect(kept).toMatchObject({ toolItemId: "cst_axe", toolItemIds: ["cst_axe", "cst_pick"] });
    const res = await save({ data: { ...base, toolItemId: "cst_pick" } });
    expect(res).toMatchObject({ toolItemId: "cst_pick", toolItemIds: ["cst_pick"] });
    expect((await save({ data: { ...base, toolItemId: "" } })).toolItemIds).toEqual([]);
  });

  it("форма открывается со списком; старая настройка — списком из одного", async () => {
    s.meta = { on: true, toolItemId: "cst_pick", toolItemIds: ["cst_pick", "cst_axe"] };
    expect((await load({ data: { id: "decoration_pine" } })).toolItemIds).toEqual([
      "cst_pick",
      "cst_axe",
    ]);
    s.meta = { on: true, toolItemId: "cst_axe" };
    expect(await load({ data: { id: "decoration_pine" } })).toMatchObject({
      toolItemId: "cst_axe",
      toolItemIds: ["cst_axe"],
    });
  });
});
