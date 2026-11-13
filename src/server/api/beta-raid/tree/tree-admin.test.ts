// Товар «Дерево для посадки» в лавке: список для админа — только срубаемые
// деревья и только админу; позиция — только витрина покупки и только срубаемое
// дерево, имя — шаблона, картинка — своя или шаблона; прочие виды не трогаются.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as Array<Record<string, unknown>>,
  admin: true,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => unknown) => fn }),
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.rows;
  },
}));
vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => "w_admin",
  isAdminWallet: () => s.admin,
}));
// Списки — и дизайнеру (requireDesigner); здесь — как админ / не админ.
vi.mock("@/server/api/beta-raid/island/island-editor-auth", () => ({
  requireDesigner: async () => {
    if (!s.admin) throw new Error("Маркет настраивает только админ");
    return "w_admin";
  },
}));

const { applyTreeGood, assertTreeForSale, listPlaceableRocks, listPlantableTrees } =
  await import("./tree-admin");
const list = listPlantableTrees as unknown as () => Promise<unknown[]>;
const rocks = listPlaceableRocks as unknown as () => Promise<unknown[]>;
const interact = (ru: string) => ({
  on: true,
  cost: 1,
  itemId: "cst_w",
  amount: "1",
  label: { ru },
});
const oak = {
  id: "decoration_oak",
  name: "Дуб",
  image_url: "/oak.png",
  interact: interact("Срубить"),
};
const good = (p: Record<string, unknown> = {}) => ({
  kind: "tree",
  side: "buy",
  refId: "decoration_oak",
  giveAmount: 1,
  name: "",
  image: null as string | null,
  ...p,
});

beforeEach(() => {
  s.sql.length = 0;
  s.rows = [oak];
  s.admin = true;
});

describe("список деревьев для витрины", () => {
  it("только админу; горы и прочее «Добыть» отсеяны", async () => {
    s.rows = [
      oak,
      { id: "decoration_rock", name: "Камень", image_url: null, interact: interact("Добыть") },
    ];
    await expect(list()).resolves.toEqual([
      { id: "decoration_oak", name: "Дуб", imageUrl: "/oak.png" },
    ]);
    expect(s.sql[0]).toContain("= 'срубить'");
    s.admin = false;
    await expect(list()).rejects.toThrow("только админ");
  });
});

describe("сохранение позиции-дерева", () => {
  it("имя и картинка — шаблона; своя картинка админа остаётся", async () => {
    const d = good({ name: "Старое имя" });
    await applyTreeGood(d);
    expect(d).toMatchObject({ name: "Дуб", image: "/oak.png" });
    expect(s.sql[0]).toContain("AND d.id = 'decoration_oak'");
    const own = good({ image: "/my.png" });
    await applyTreeGood(own);
    expect(own.image).toBe("/my.png");
  });

  it("за покупку — одно дерево: «Сколько» от прошлого вида сбрасывается", async () => {
    const d = good({ giveAmount: 5 });
    await applyTreeGood(d);
    expect(d.giveAmount).toBe(1);
  });

  it("скупка деревьев — отказ; не срубаемое или пустое — отказ", async () => {
    await expect(applyTreeGood(good({ side: "sell" }))).rejects.toThrow("только в витрину покупки");
    s.rows = [];
    await expect(applyTreeGood(good())).rejects.toThrow("срубаемое дерево");
    await expect(applyTreeGood(good({ refId: null }))).rejects.toThrow("срубаемое дерево");
  });

  it("другие виды товаров не трогаются и в базу не ходят", async () => {
    const d = good({ kind: "custom", name: "Помидор" });
    await applyTreeGood(d);
    expect(d.name).toBe("Помидор");
    expect(s.sql).toHaveLength(0);
  });
});

describe("покупка дерева — шаблон ещё срубаемый", () => {
  it("срубаемое — можно; снято «Срубить», удалено или пусто — tree.gone_kind", async () => {
    await expect(assertTreeForSale("decoration_oak")).resolves.toBeUndefined();
    expect(s.sql[0]).toContain("AND d.id = 'decoration_oak'");
    s.rows = [{ ...oak, interact: interact("Добыть") }];
    await expect(assertTreeForSale("decoration_oak")).rejects.toThrow("tree.gone_kind");
    s.rows = [];
    await expect(assertTreeForSale("decoration_oak")).rejects.toThrow("tree.gone_kind");
    await expect(assertTreeForSale(null)).rejects.toThrow("tree.gone_kind");
  });
});

describe("камень для установки (rock, 25.10.2026)", () => {
  const stone = {
    id: "decoration_stone",
    name: "Камень",
    image_url: "/stone.png",
    interact: interact("Добыть"),
  };

  it("список — шаблоны под кирку, только админу", async () => {
    s.rows = [stone];
    await expect(rocks()).resolves.toEqual([
      { id: "decoration_stone", name: "Камень", imageUrl: "/stone.png" },
    ]);
    expect(s.sql[0]).toContain("ci.name ~* '(кирк|pick)'");
    expect(s.sql[0]).not.toContain("= 'срубить'");
    s.admin = false;
    await expect(rocks()).rejects.toThrow("только админ");
  });

  it("позиция: имя шаблона, одна штука; скупка и не-кирка — отказ", async () => {
    s.rows = [stone];
    const d = good({ kind: "rock", refId: "decoration_stone", giveAmount: 3 });
    await applyTreeGood(d);
    expect(d).toMatchObject({ name: "Камень", image: "/stone.png", giveAmount: 1 });
    await expect(applyTreeGood(good({ kind: "rock", side: "sell" }))).rejects.toThrow(
      "Камень для установки ставится только в витрину покупки",
    );
    s.rows = [];
    await expect(applyTreeGood(good({ kind: "rock" }))).rejects.toThrow("бьют киркой");
  });

  it("покупка: шаблон больше не под кирку — rock.gone_kind", async () => {
    s.rows = [stone];
    await expect(assertTreeForSale("decoration_stone", "rock")).resolves.toBeUndefined();
    expect(s.sql[0]).toContain("ci.name ~* '(кирк|pick)'");
    s.rows = [];
    await expect(assertTreeForSale("decoration_stone", "rock")).rejects.toThrow("rock.gone_kind");
  });
});
