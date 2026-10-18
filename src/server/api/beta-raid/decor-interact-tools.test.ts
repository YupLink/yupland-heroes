// Несколько инструментов у декора (05.10) на сервере: список из справочника
// одним запросом по порядку шаблона; рубит инструмент в руках из списка, иначе
// первый по списку, который есть; износ — у взятого; турнир и ответ получают
// имя реально использованного; нечем — «Нужен …», декор и энергия на месте.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  onCell: true,
  main: null as string | null,
  stacks: [] as string[],
  hits: [] as Array<{ stackKey: string; step: number }>,
  payCalls: 0,
  chops: [] as Array<{ tool: string | null | undefined; item: string | null }>,
}));

const T = (id: string, name: string, wear: number | null) => ({
  id,
  name,
  image: `${id}.png`,
  wear,
});
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("meta->'interact' AS interact")) {
      const base = { on: true, cost: 3, itemId: "cst_wood", amount: "2" };
      const row = (id: string, interact: object, tools: unknown) => ({
        id,
        name: id,
        interact,
        item_name: "Дерево",
        item_image: null,
        tools,
      });
      // Справочник отдаёт инструменты в своём порядке, а не в порядке списка.
      const axePick = [T("cst_pick", "Кирка", 20), T("cst_axe", "Топор", 34)];
      return [
        row("decoration_mix", { ...base, toolItemIds: ["cst_axe", "cst_pick"] }, axePick),
        row("decoration_half", { ...base, toolItemIds: ["cst_gone", "cst_pick"] }, [axePick[0]]),
        row("decoration_dead", { ...base, toolItemIds: ["cst_gone"] }, null),
        row("decoration_old", { ...base, toolItemId: "cst_axe" }, JSON.stringify([axePick[1]])),
      ];
    }
    if (sql.includes("SET decoration_id = NULL")) {
      const hit = s.onCell;
      s.onCell = false;
      return hit ? [{ q: 1 }] : [];
    }
    if (sql.includes("SET decoration_id = '")) s.onCell = true;
    return [];
  },
}));
vi.mock("./item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./market-backpack", () => ({ resolveBackpack: async () => ({ heroId: "h1" }) }));
vi.mock("./main-tool/main-tool-read", () => ({
  loadToolState: async () => ({
    stored: { key: s.main, shovel: s.main === "custom:cst_sh", rod: false },
    stacks: s.stacks.map((k) => ({ stackKey: k, count: 1, shovel: k === "custom:cst_sh" })),
  }),
}));
vi.mock("./tool-wear", () => ({
  wearTool: async (o: { stackKey: string; step: number }) => (s.hits.push(o), "ok"),
  undoToolWear: async () => {},
  settleToolWear: async () => {},
}));
vi.mock("./encounter-pay", () => ({
  payForHit: async () => (s.payCalls++, { refund: async () => {} }),
}));
vi.mock("./decor-give", () => ({ giveDecorItem: async () => ({ dropped: 0, queued: 0 }) }));
vi.mock("./map-journal", () => ({ recordMapChange: async () => {} }));
vi.mock("../tournament/tour-hooks", () => ({
  noteChop: async (
    _w: string,
    tool: string | null | undefined,
    _r: string,
    _n: number,
    item: string | null,
  ) => void s.chops.push({ tool, item }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./decor-interact");
const interact = mod.interactDecor as unknown as (a: {
  data: { q: number; r: number; decorId: string };
}) => Promise<{ toolName: string | null }>;
const chop = (decorId = "decoration_mix") => interact({ data: { q: 1, r: 0, decorId } });
const [AXE, PICK, SHOVEL] = ["custom:cst_axe", "custom:cst_pick", "custom:cst_sh"];

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    onCell: true,
    main: null,
    stacks: [],
    hits: [],
    payCalls: 0,
    chops: [],
  });
  mod.dropInteractiveDecorCache();
});

describe("список инструментов декора", () => {
  it("порядок — как в шаблоне, первый — в старых полях; одним запросом", async () => {
    const list = await mod.loadInteractiveDecor();
    expect(list.decoration_mix.tools?.map((t) => t.name)).toEqual(["Топор", "Кирка"]);
    expect(list.decoration_mix.tools?.[1]).toEqual({ ...T("cst_pick", "Кирка", 20), key: PICK });
    expect(list.decoration_mix).toMatchObject({
      toolItemId: "cst_axe",
      toolName: "Топор",
      toolKey: AXE,
    });
    expect(s.sql.filter((x) => x.includes("raid_custom_item ti"))).toHaveLength(1);
  });

  it("удалённый из справочника выпадает; удалены все — декор выключен; старая настройка — один", async () => {
    const list = await mod.loadInteractiveDecor();
    expect(list.decoration_half).toMatchObject({
      toolItemId: "cst_pick",
      toolItemIds: ["cst_pick"],
    });
    expect(list.decoration_dead).toBeUndefined();
    expect(list.decoration_old.tools?.map((t) => t.key)).toEqual([AXE]);
  });
});

describe("рубка любым из списка", () => {
  it("в руках пусто, есть только кирка — рубит кирка: её износ, её имя турниру", async () => {
    s.stacks = [PICK];
    expect((await chop()).toolName).toBe("Кирка");
    expect(s.hits).toEqual([expect.objectContaining({ stackKey: PICK, step: 20 })]);
    await vi.waitFor(() => expect(s.chops).toEqual([{ tool: "Кирка", item: "Дерево" }]));
  });

  it("в руках кирка из списка — рубит она, хотя топор первый", async () => {
    s.stacks = [AXE, PICK];
    s.main = PICK;
    expect((await chop()).toolName).toBe("Кирка");
    expect(s.hits[0].stackKey).toBe(PICK);
  });

  it("в руках пусто, есть оба — первый по списку (топор)", async () => {
    s.stacks = [PICK, AXE];
    expect((await chop()).toolName).toBe("Топор");
    expect(s.hits[0]).toMatchObject({ stackKey: AXE, step: 34 });
    await vi.waitFor(() => expect(s.chops[0]?.tool).toBe("Топор"));
  });

  it("в руках лопата — «возьми в руки» первый по списку, что есть; декор на месте", async () => {
    s.stacks = [SHOVEL, PICK];
    s.main = SHOVEL;
    await expect(chop()).rejects.toThrow(`tool.not_main|${JSON.stringify({ tool: "Кирка" })}`);
    expect(s.onCell).toBe(true);
    expect(s.hits).toHaveLength(0);
    expect(s.payCalls).toBe(0);
  });

  it("нет ни одного — «Нужен …», ни износа, ни энергии, декор на месте", async () => {
    s.stacks = [SHOVEL];
    await expect(chop()).rejects.toThrow("braid.decor_need_tool");
    expect(s.onCell).toBe(true);
    expect([s.hits.length, s.payCalls, s.chops.length]).toEqual([0, 0, 0]);
  });
});
