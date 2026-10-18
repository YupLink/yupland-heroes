// Рубка руками (§8.56) на сервере: только декор с деревянным или каменным
// топором в списке; 10 энергии вместо цены декора и 30 сытости, инструмент не
// трогается; сытости мало — отказ до энергии; сорвалось дальше — назад и
// сытость, и энергия, и декор. Без hand — путь инструмента прежний.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  onCell: true,
  stacks: [] as string[],
  hits: 0,
  pay: [] as Array<{ cost: number; reason: string }>,
  payFail: false,
  refunds: 0,
  /** Сытость героя; null — героя нет. */
  satiety: 100 as number | null,
  satBack: [] as number[],
  giveFail: false,
  chops: [] as Array<{ tool: string | null | undefined; hand: boolean | undefined }>,
}));

const [WOOD, STONE] = ["cst_frxf3xh6mq6g", "cst_g7uwp1syvmng"];
const T = (id: string, name: string) => ({ id, name, image: null, wear: 20 });
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("meta->'interact' AS interact")) {
      const base = { on: true, cost: 3, itemId: "cst_wood", amount: "2" };
      const row = (id: string, interact: object, tools: unknown) => ({
        id,
        name: id,
        interact,
        item_name: "Бревна",
        item_image: null,
        tools,
      });
      return [
        row("decoration_tree", { ...base, toolItemIds: ["cst_iron", WOOD] }, [
          T(WOOD, "Деревянный Топор"),
          T("cst_iron", "Железный Топор"),
        ]),
        row("decoration_rock", { ...base, toolItemIds: ["cst_pick"] }, [T("cst_pick", "Кирка")]),
        row("decoration_old", { ...base, toolItemId: STONE }, [T(STONE, "Каменный Топор")]),
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
vi.mock("./hero-satiety", () => ({
  takeSatiety: async (_w: string, need: number) => {
    if (s.satiety === null) return "none";
    if (s.satiety < need) return "short";
    s.satiety -= need;
    return "ok";
  },
  moveSatiety: async (_w: string, delta: number) => {
    s.satBack.push(delta);
    if (s.satiety !== null) s.satiety += delta;
    return null;
  },
}));
vi.mock("./encounter-pay", () => ({
  payForHit: async (_w: string, cost: number, reason: string) => {
    if (s.payFail) throw new Error(`Нужно ${cost} энергии`);
    s.pay.push({ cost, reason });
    return { refund: async () => void s.refunds++ };
  },
}));
vi.mock("./decor-give", () => ({
  giveDecorItem: async () => {
    if (s.giveFail) throw new Error("pool is closed");
    return { dropped: 0, queued: 0 };
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
    stored: { key: null, shovel: false, rod: false },
    stacks: s.stacks.map((k) => ({ stackKey: k, count: 1, shovel: false })),
  }),
}));
vi.mock("./tool-wear", () => ({
  wearTool: async () => (s.hits++, "ok"),
  undoToolWear: async () => {},
  settleToolWear: async () => {},
}));
vi.mock("./map-journal", () => ({ recordMapChange: async () => {} }));
vi.mock("../tournament/tour-hooks", () => ({
  noteChop: async (
    _w: string,
    tool: string | null | undefined,
    _r: string,
    _n: number,
    _i: string | null,
    hand?: boolean,
  ) => void s.chops.push({ tool, hand }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./decor-interact");
type Res = { cost: number; hand: boolean; satietyCost: number; toolName: string | null };
const interact = mod.interactDecor as unknown as (a: {
  data: { q: number; r: number; decorId: string; hand?: boolean };
}) => Promise<Res>;
const chop = (decorId = "decoration_tree", hand = true) =>
  interact({ data: { q: 1, r: 0, decorId, hand } });

beforeEach(() => {
  Object.assign(s, {
    onCell: true,
    stacks: [],
    hits: 0,
    pay: [],
    payFail: false,
    refunds: 0,
    satiety: 100,
    satBack: [],
    giveFail: false,
    chops: [],
  });
  mod.dropInteractiveDecorCache();
});

describe("список: что рубится руками", () => {
  it("деревянный или каменный топор в списке (и старый toolItemId) — hand", async () => {
    const list = await mod.loadInteractiveDecor();
    expect(list.decoration_tree.hand).toBe(true);
    expect(list.decoration_old.hand).toBe(true);
    expect(list.decoration_rock.hand).toBe(false);
  });
});

describe("рубка руками", () => {
  it("10 энергии вместо цены декора, 30 сытости, инструмент не тронут; турниру — как топор", async () => {
    const res = await chop();
    expect(res).toMatchObject({ cost: 10, hand: true, satietyCost: 30, toolName: null });
    expect(s.pay).toEqual([{ cost: 10, reason: "decor" }]);
    expect([s.satiety, s.hits, s.onCell]).toEqual([70, 0, false]);
    await vi.waitFor(() => expect(s.chops).toEqual([{ tool: null, hand: true }]));
  });

  it("сытости меньше 30 — отказ до энергии, декор на месте", async () => {
    s.satiety = 29;
    await expect(chop()).rejects.toThrow('braid.decor_hand_hungry|{"n":30}');
    expect([s.pay.length, s.satiety, s.onCell]).toEqual([0, 29, true]);
  });

  it("декор без деревянного и каменного топора — отказ, ничего не тронуто", async () => {
    await expect(chop("decoration_rock")).rejects.toThrow("braid.decor_hand_no");
    expect([s.pay.length, s.satiety, s.onCell]).toEqual([0, 100, true]);
  });

  it("энергии не хватило — сытость назад, декор на клетку", async () => {
    s.payFail = true;
    await expect(chop()).rejects.toThrow("Нужно 10 энергии");
    expect([s.satiety, s.satBack, s.onCell]).toEqual([100, [30], true]);
  });

  it("товар не выдался — назад энергия, сытость и декор", async () => {
    s.giveFail = true;
    await expect(chop()).rejects.toThrow("pool is closed");
    expect([s.refunds, s.satiety, s.onCell]).toEqual([1, 100, true]);
  });

  it("героя нет — шкалы нет: рубка за энергию, сытость 0", async () => {
    s.satiety = null;
    expect(await chop()).toMatchObject({ cost: 10, satietyCost: 0 });
  });

  it("без hand путь прежний: инструмент из списка и цена декора", async () => {
    s.stacks = [`custom:${WOOD}`];
    const res = await chop("decoration_tree", false);
    expect(res).toMatchObject({ cost: 3, hand: false, satietyCost: 0 });
    expect(res.toolName).toBe("Деревянный Топор");
    expect([s.hits, s.satiety]).toEqual([1, 100]);
  });
});
