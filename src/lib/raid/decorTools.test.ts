// Несколько инструментов у декора (05.10): чтение старой и новой настройки,
// выбор инструмента (в руках из списка / в руках другое / в руках пусто / нет
// ни одного) и «Требуется Топор или Кирка».
import { describe, expect, it } from "vitest";
import {
  chooseDecorTool,
  decorToolsOf,
  orList,
  TOOLS_MAX,
  toolIdsOf,
  type DecorToolView,
} from "@/lib/raid/decorTools";
import { parseDecorInteract } from "@/lib/raid/decorInteract";
import { pickMain, type ToolStack } from "@/lib/raid/mainTool";

const tool = (id: string, name: string, wear: number | null = null): DecorToolView => ({
  id,
  name,
  image: `${id}.png`,
  wear,
  key: `custom:${id}`,
});
const AXE = tool("cst_axe", "Топор", 34);
const PICK = tool("cst_pick", "Кирка", 20);
const SAW = tool("cst_saw", "Пила");
const stack = (t: DecorToolView, count = 1): ToolStack => ({ stackKey: t.key, count });
const SHOVEL: ToolStack = { stackKey: "custom:cst_sh", count: 1, shovel: true };

describe("список инструментов из meta.interact", () => {
  it("старая настройка — один toolItemId читается списком из одного", () => {
    expect(toolIdsOf({ toolItemId: "cst_axe" })).toEqual(["cst_axe"]);
    expect(toolIdsOf({ toolItemId: "" })).toEqual([]);
    expect(toolIdsOf({})).toEqual([]);
  });

  it("новая — порядок списка; toolItemId (первый) его не меняет", () => {
    const o = { toolItemId: "cst_pick", toolItemIds: ["cst_pick", "cst_axe", "cst_saw"] };
    expect(toolIdsOf(o)).toEqual(["cst_pick", "cst_axe", "cst_saw"]);
    expect(toolIdsOf({ toolItemIds: ["cst_axe", "cst_pick"], toolItemId: "cst_pick" })).toEqual([
      "cst_axe",
      "cst_pick",
    ]);
  });

  it("toolItemId вне списка (запись мимо админки) — встаёт первым: даром не рубится", () => {
    expect(toolIdsOf({ toolItemId: "cst_axe", toolItemIds: [] })).toEqual(["cst_axe"]);
    expect(toolIdsOf({ toolItemId: "cst_axe", toolItemIds: ["cst_pick"] })).toEqual([
      "cst_axe",
      "cst_pick",
    ]);
  });

  it("мусор выпадает, повторы схлопываются, не больше 10, строка моста читается", () => {
    const junk = ["cst_axe", "res:wood", 42, "cst_x' OR 1=1", "cst_axe", null, "cst_pick"];
    expect(toolIdsOf({ toolItemIds: junk })).toEqual(["cst_axe", "cst_pick"]);
    const many = Array.from({ length: 15 }, (_, i) => `cst_t${i}`);
    expect(toolIdsOf({ toolItemIds: many })).toHaveLength(TOOLS_MAX);
    expect(toolIdsOf({ toolItemIds: '["cst_saw","cst_axe"]' })).toEqual(["cst_saw", "cst_axe"]);
    expect(toolIdsOf({ toolItemIds: "не json" })).toEqual([]);
  });

  it("настройка декора: toolItemIds и первый из них в toolItemId", () => {
    const base = { on: true, cost: 1, itemId: "cst_wood", amount: "2" };
    expect(parseDecorInteract({ ...base, toolItemIds: ["cst_pick", "cst_axe"] })).toMatchObject({
      toolItemId: "cst_pick",
      toolItemIds: ["cst_pick", "cst_axe"],
    });
    expect(parseDecorInteract({ ...base, toolItemId: "cst_axe" })?.toolItemIds).toEqual([
      "cst_axe",
    ]);
    expect(parseDecorInteract({ ...base, toolItemIds: [] })).not.toHaveProperty("toolItemIds");
  });

  it("ответ прошлой версии (один инструмент) — список из одного; новый — как есть", () => {
    const old = {
      toolItemId: "cst_axe",
      toolName: "Топор",
      toolWear: 34,
      toolKey: "custom:cst_axe",
    };
    expect(decorToolsOf(old)).toEqual([{ ...AXE, image: null }]);
    expect(decorToolsOf({ toolItemId: "cst_axe" })[0].key).toBe("custom:cst_axe");
    expect(decorToolsOf({ tools: [AXE, PICK], toolItemId: "cst_axe" })).toEqual([AXE, PICK]);
    expect(decorToolsOf({})).toEqual([]);
    expect(decorToolsOf(undefined)).toEqual([]);
  });
});

describe("какой инструмент берёт рубка", () => {
  const list = [AXE, PICK, SAW];

  it("в руках инструмент из списка — он, даже не первый", () => {
    const stacks = [stack(AXE), stack(PICK)];
    expect(chooseDecorTool(PICK.key, stacks, list)).toEqual({ state: "ok", tool: PICK });
  });

  it("в руках пусто — первый по порядку списка, который есть", () => {
    expect(chooseDecorTool(null, [stack(PICK), stack(SAW)], list)).toEqual({
      state: "ok",
      tool: PICK,
    });
    expect(chooseDecorTool(null, [stack(SAW), stack(AXE)], list).tool).toBe(AXE);
  });

  it("в руках не из списка — «Взять» первый по списку, который есть", () => {
    const stacks = [SHOVEL, stack(SAW), stack(PICK)];
    expect(chooseDecorTool(SHOVEL.stackKey, stacks, list)).toEqual({ state: "idle", tool: PICK });
  });

  it("нет ни одного (или штуки кончились) — none", () => {
    expect(chooseDecorTool(null, [SHOVEL], list)).toEqual({ state: "none", tool: null });
    expect(chooseDecorTool(null, [stack(AXE, 0)], list)).toEqual({ state: "none", tool: null });
  });

  it("список из одного — то же правило, что у одного инструмента", () => {
    for (const main of [null, AXE.key, PICK.key]) {
      const stacks = [stack(AXE), stack(PICK)];
      expect(pickMain(main, stacks, { kind: "items", keys: [AXE.key] })).toEqual(
        pickMain(main, stacks, { kind: "item", key: AXE.key }),
      );
    }
  });
});

describe("«Требуется …» со списком допустимых", () => {
  it("один — имя, два — через «или», больше — запятые и «или» перед последним", () => {
    expect(orList(["Топор"], "или")).toBe("Топор");
    expect(orList(["Топор", "Кирка"], "или")).toBe("Топор или Кирка");
    expect(orList(["Axe", "Pickaxe", "Saw"], "or")).toBe("Axe, Pickaxe or Saw");
  });

  it("пустые и повторы не пишутся", () => {
    expect(orList([], "или")).toBe("");
    expect(orList(["Топор", "", "Топор"], "или")).toBe("Топор");
  });
});
