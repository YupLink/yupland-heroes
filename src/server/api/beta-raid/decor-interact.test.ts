// Декор на сервере: «забрать декор → энергия → товар» и откаты — ни платы за пустую
// клетку, ни энергии без товара, ни товара без декора. Инструмент (27.09): штука за декор,
// откат при сбое, гонки топора и нажатий. Товар — в рюкзак, не влезшее — мешочком (§8.21).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  decorOnCell: true,
  /** Клетки с декором-с-инструментом: "q,r" → id декора. */
  cells: {} as Record<string, string>,
  axes: 0,
  axeTaken: 0,
  axeBack: 0,
  took: new Set<string>(), // ключи рубок, чей удар прошёл: откат вернёт только их
  payCalls: 0,
  payFails: false,
  queueFails: false,
  refunded: 0,
  queued: [] as Array<{ kind: string; amount: number; packId: string; origin?: string | null }>,
  delta: [] as unknown[],
}));

// База — фейк по тексту SQL (decor-interact.fake.ts): список декора и клетки.
vi.mock("../../db/mcpClient", async () => {
  const { decorSql } = await import("./decor-interact.fake");
  return { mcpExec: async (sql: string) => decorSql(s, sql) };
});
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
// Настоящий decor-tool; удар и откат по ключу рубки — как tool-wear (там и износ).
vi.mock("./market-backpack", () => ({ resolveBackpack: async () => ({ heroId: "h1" }) }));
vi.mock("./tool-wear", () => ({
  wearTool: async (o: { stackKey: string; step: number; op: string }) => {
    await Promise.resolve();
    if (o.stackKey !== "custom:cst_axe" || o.step !== 100) throw new Error("не тот товар");
    if (s.axes < 1) return "none";
    s.axes--;
    s.axeTaken++;
    return s.took.add(o.op) && "ok";
  },
  undoToolWear: async (o: { op: string }) => void (s.took.delete(o.op) && (s.axes++, s.axeBack++)),
  settleToolWear: async () => {},
}));
// Основного нет, топор один — он и рубит (§8.24: выбор при однозначности).
vi.mock("./main-tool/main-tool-read", () => ({
  loadToolState: async () => ({
    stored: { key: null, shovel: false },
    stacks:
      s.axes >= 1
        ? [{ stackKey: "custom:cst_axe", count: s.axes, name: "Топор", toolWear: null }]
        : [],
  }),
}));
vi.mock("./encounter-pay", () => ({
  payForHit: async () => {
    s.payCalls++;
    if (s.payFails) throw new Error("Нужно 3 энергии");
    return { refund: async () => void s.refunded++ };
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc1" }));
type Give = Parameters<typeof import("./loot-bag/bag-deliver").deliverOrDrop>[0];
vi.mock("./loot-bag/bag-deliver", () => ({
  deliverOrDrop: async ({ items: [{ itemId, amount, origin }], at }: Give) => {
    if (s.queueFails) throw new Error("db down");
    s.queued.push({ kind: `custom@${at.q},${at.r}:${at.source}`, amount, packId: itemId, origin });
    return { items: [{ itemId, toBackpack: amount, dropped: 0, queued: 0 }], bagId: null };
  },
}));
vi.mock("./map-journal", () => ({
  recordMapChange: async (_m: string, c: unknown) => void s.delta.push(c),
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
}) => Promise<{ amount: number; itemName: string }>;
const call = () => interact({ data: { q: 1, r: 0, decorId: "decoration_tree" } });
const WOOD = { kind: "custom@1,0:decor", amount: 2, packId: "cst_wood", origin: "loot" };
beforeEach(() => {
  Object.assign(s, {
    sql: [],
    decorOnCell: true,
    cells: { "1,0": "decoration_pine", "0,1": "decoration_pine" },
    axes: 0,
    axeTaken: 0,
    axeBack: 0,
    took: new Set(),
    payCalls: 0,
    payFails: false,
    queueFails: false,
    refunded: 0,
    queued: [],
    delta: [],
  });
  mod.dropInteractiveDecorCache();
});

describe("interactDecor", () => {
  it("декор уничтожен, товар выдан на клетке декора, клетка опустела у всех", async () => {
    const res = await call();
    expect(res).toMatchObject({ amount: 2, itemName: "Дерево" });
    expect(s.decorOnCell).toBe(false);
    expect(s.queued).toEqual([WOOD]);
    expect(s.delta).toEqual([{ patches: [{ q: 1, r: 0, decorationId: null }] }]);
  });

  it("сосед успел раньше — отказ, энергия не списана", async () => {
    s.decorOnCell = false;
    await expect(call()).rejects.toThrow("braid.decor_gone");
    expect(s.queued).toHaveLength(0);
  });

  it("энергии не хватило — декор вернулся на клетку, товара нет", async () => {
    s.payFails = true;
    await expect(call()).rejects.toThrow("Нужно 3 энергии");
    expect(s.decorOnCell).toBe(true);
    expect(s.queued).toHaveLength(0);
  });

  it("товар не выдан (сбой базы) — энергия возвращена, декор на месте", async () => {
    s.queueFails = true;
    await expect(call()).rejects.toThrow("db down");
    expect(s.refunded).toBe(1);
    expect(s.decorOnCell).toBe(true);
    expect(s.delta).toHaveLength(0);
  });

  it("декор без взаимодействия — отказ до всего", async () => {
    await expect(interact({ data: { q: 1, r: 0, decorId: "decoration_rock" } })).rejects.toThrow(
      "braid.decor_no_interact",
    );
    expect(s.sql.some((x) => x.includes("SET decoration_id = NULL"))).toBe(false);
  });
});

const chop = (q = 1, r = 0) => interact({ data: { q, r, decorId: "decoration_pine" } });

describe("interactDecor с инструментом", () => {
  it("топор есть — списан 1, энергия списана, товар выдан, декор исчез", async () => {
    s.axes = 2;
    const res = await chop();
    expect(res).toMatchObject({ amount: 2, itemName: "Дерево", toolName: "Топор" });
    expect(s.axes).toBe(1);
    expect(s.payCalls).toBe(1);
    expect(s.queued).toEqual([WOOD]);
    expect(s.cells["1,0"]).toBeUndefined();
  });

  it("топора нет — «Нужен …», декор на месте, энергия не тронута", async () => {
    await expect(chop()).rejects.toThrow("braid.decor_need_tool");
    expect(s.cells["1,0"]).toBe("decoration_pine");
    expect(s.payCalls).toBe(0);
    expect(s.queued).toHaveLength(0);
    expect(s.delta).toHaveLength(0);
  });

  it("два декора одним топором — второй не проходит и остаётся на клетке", async () => {
    s.axes = 1;
    const out = await Promise.allSettled([chop(1, 0), chop(0, 1)]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const lost = out.find((o) => o.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason)).toContain("braid.decor_need_tool");
    expect(s.axes).toBe(0);
    expect(s.queued).toHaveLength(1);
    expect(Object.keys(s.cells)).toHaveLength(1);
  });

  it("два нажатия по одному декору — один топор, одна награда", async () => {
    s.axes = 2;
    const out = await Promise.allSettled([chop(), chop()]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(s.axes).toBe(1);
    expect(s.axeTaken).toBe(1);
    expect(s.queued).toHaveLength(1);
  });

  it("энергии не хватило — топор вернулся, декор на месте", async () => {
    s.axes = 1;
    s.payFails = true;
    await expect(chop()).rejects.toThrow("Нужно 3 энергии");
    expect(s.axes).toBe(1);
    expect(s.axeBack).toBe(1);
    expect(s.cells["1,0"]).toBe("decoration_pine");
    expect(s.queued).toHaveLength(0);
  });

  it("товар не выдан — вернулись топор, энергия и декор", async () => {
    s.axes = 1;
    s.queueFails = true;
    await expect(chop()).rejects.toThrow("db down");
    expect(s.axes).toBe(1);
    expect(s.refunded).toBe(1);
    expect(s.cells["1,0"]).toBe("decoration_pine");
    expect(s.delta).toHaveLength(0);
  });

  it("декор уже срублен соседом — топор не списан, энергия не тронута", async () => {
    s.axes = 1;
    delete s.cells["1,0"];
    await expect(chop()).rejects.toThrow("braid.decor_gone");
    expect(s.axeTaken).toBe(0);
    expect(s.axes).toBe(1);
    expect(s.payCalls).toBe(0);
  });

  it("откат — топор и энергия возвращены ровно по разу", async () => {
    s.axes = 1;
    s.queueFails = true;
    await expect(chop()).rejects.toThrow("db down");
    expect(s.axeBack).toBe(1);
    expect(s.refunded).toBe(1);
    // Повтор того же запроса после отката — снова один топор, одна награда.
    s.queueFails = false;
    await chop();
    expect(s.axeTaken).toBe(2);
    expect(s.axes).toBe(0);
    expect(s.queued).toHaveLength(1);
    await expect(chop()).rejects.toThrow("braid.decor_gone");
    expect(s.axeTaken).toBe(2);
  });

  it("товар-инструмент удалён — взаимодействия нет, даром не рубится", async () => {
    const list = await mod.loadInteractiveDecor();
    expect(list.decoration_ghost).toBeUndefined();
    expect(list.decoration_pine).toMatchObject({ toolItemId: "cst_axe", toolName: "Топор" });
    expect(list.decoration_tree.toolItemId).toBeUndefined();
  });
});
