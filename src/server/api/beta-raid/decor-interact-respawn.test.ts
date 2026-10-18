// Рубка и респавн: у шаблона с «Респавн, мин» состоявшаяся рубка ставит
// возврат декора на ту же клетку; сорвавшаяся (энергии не хватило, товар не
// выдан) — нет: декор и так вернулся откатом. Шаблон без поля — как раньше.
// Инструмент рубки прошёл — пустую строку доломанного убирают (done).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  onCell: true,
  payFails: false,
  queueFails: false,
  scheduled: [] as unknown[],
  toolDone: 0,
  toolBack: 0,
  /** Порядок шагов после рубки: дельта «срублен» → очередь возврата → уборка. */
  order: [] as string[],
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("meta->'interact' AS interact")) {
      const base = { on: true, cost: 3, itemId: "cst_wood", amount: "2" };
      const row = (id: string, interact: object, tool: string | null) => ({
        id,
        name: id,
        interact,
        item_name: "Дерево",
        item_image: null,
        tools: tool ? [{ id: "cst_axe", name: tool, image: null, wear: 25 }] : null,
      });
      return [
        row("decoration_pine", { ...base, toolItemId: "cst_axe", respawnMin: 30 }, "Топор"),
        row("decoration_bush", { ...base, respawnMin: "мусор" }, null),
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
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./decor-tool", () => ({
  payDecorTool: async (_w: string, tools: Array<{ name: string; wear?: number | null }>) => {
    if (tools[0]?.wear !== 25) throw new Error("износ товара не дошёл до рубки");
    const done = async () => void (s.toolDone++, s.order.push("done"));
    return { back: async () => void s.toolBack++, done, used: tools[0] };
  },
}));
vi.mock("./encounter-pay", () => ({
  payForHit: async () => {
    if (s.payFails) throw new Error("Нужно 3 энергии");
    return { refund: async () => {} };
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("./reward-queue", () => ({ queueEncounterReward: async () => {} }));
vi.mock("./loot-bag/bag-deliver", () => ({
  deliverOrDrop: async () => {
    if (s.queueFails) throw new Error("db down");
    return { items: [], bagId: null };
  },
}));
vi.mock("./decor-respawn", () => ({
  scheduleDecorRespawn: async (o: unknown) => void (s.scheduled.push(o), s.order.push("respawn")),
}));
vi.mock("./map-journal", () => ({ recordMapChange: async () => void s.order.push("journal") }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./decor-interact");
const interact = mod.interactDecor as unknown as (a: {
  data: { q: number; r: number; decorId: string };
}) => Promise<unknown>;
const chop = (decorId = "decoration_pine") => interact({ data: { q: 1, r: 0, decorId } });

beforeEach(() => {
  Object.assign(s, {
    onCell: true,
    payFails: false,
    queueFails: false,
    scheduled: [],
    toolDone: 0,
    toolBack: 0,
    order: [],
  });
  mod.dropInteractiveDecorCache();
});

describe("рубка ставит респавн", () => {
  it("рубка прошла — возврат той же ёлки на ту же клетку через 30 минут", async () => {
    await chop();
    expect(s.scheduled).toEqual([
      { mapId: "map1", q: 1, r: 0, decorId: "decoration_pine", minutes: 30 },
    ]);
    expect(s.toolDone).toBe(1);
    // Возврат — только после дельты «срублен»: иначе «встал» мог бы прийти раньше.
    expect(s.order).toEqual(["journal", "respawn", "done"]);
  });

  it("энергии не хватило — декор вернулся откатом, респавна нет", async () => {
    s.payFails = true;
    await expect(chop()).rejects.toThrow("Нужно 3 энергии");
    expect(s.onCell).toBe(true);
    expect(s.scheduled).toHaveLength(0);
    expect(s.toolBack).toBe(1);
    expect(s.toolDone).toBe(0);
  });

  it("товар не выдан — респавна нет, прочность вернулась", async () => {
    s.queueFails = true;
    await expect(chop()).rejects.toThrow("db down");
    expect(s.scheduled).toHaveLength(0);
    expect(s.toolBack).toBe(1);
  });

  it("без «Респавн, мин» (или мусор в поле) — срубленное не возвращается", async () => {
    await chop("decoration_bush");
    expect(s.scheduled).toHaveLength(0);
  });

  it("клиент видит износ инструмента в настройке декора", async () => {
    const list = await mod.loadInteractiveDecor();
    expect(list.decoration_pine).toMatchObject({ toolWear: 25, respawnMin: 30 });
    expect(list.decoration_bush.respawnMin).toBeUndefined();
  });
});
