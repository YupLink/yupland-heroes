// Рынок героев: превью карманов в окне «Выставить» (listMySellableHeroes) — та же
// раскладка, что у выставления, на рюкзаке основного «как сейчас», по каждому
// герою отдельно; основной себе карманы не раскладывает.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  heroes: [] as Array<Record<string, unknown>>,
  stacks: [] as Array<{ heroId: string; s: Record<string, unknown> }>,
  onMap: true,
  main: { heroId: "hi_main", capacity: 1, potionCapacity: 3 } as Record<string, unknown> | null,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("FROM yuplink.user_game_item u")) return st.heroes;
    if (sql.includes("beta_raid_positions")) return st.onMap ? [{ hit: 1 }] : [];
    if (sql.includes("FROM yuplink.raid_hero_backpack b")) return st.stacks;
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => st.main,
}));

const { sellableHeroes } = await import("./hm-sellable");

const hero = (itemId: string, heroId: string, extra: Record<string, unknown> = {}) => ({
  itemId,
  heroId,
  templateId: "hero_x",
  name: itemId,
  rarity: "epic",
  level: 3,
  pockets: 1,
  active: false,
  resting: false,
  field: false,
  fishing: false,
  ...extra,
});
const stack = (heroId: string, stackKey: string, count: number, wear = 0) => ({
  heroId,
  s: {
    stackKey,
    kind: stackKey.split(":")[0],
    refId: null,
    name: stackKey,
    count,
    wear,
    potion: false,
  },
});

beforeEach(() => {
  st.heroes = [
    hero("ugi_main", "hi_main", { active: true }),
    hero("ugi_a", "hi_a"),
    hero("ugi_b", "hi_b"),
  ];
  st.stacks = [
    stack("hi_main", "custom:cst_honey", 10),
    stack("hi_a", "custom:cst_axe", 2, 40),
    stack("hi_a", "custom:cst_apple", 15),
    stack("hi_b", "custom:cst_honey", 5),
  ];
  st.onMap = true;
  st.main = { heroId: "hi_main", capacity: 1, potionCapacity: 3 };
});

describe("превью карманов", () => {
  it("по каждому герою от рюкзака «как сейчас»: что основному, что выпадет", async () => {
    const [m, a, b] = await sellableHeroes("w.near", "acc_S");
    expect([m.reason, m.toMain, m.drops]).toEqual(["heromkt.active", [], []]);
    // У основного 1 ячейка, занята мёдом (10 из 20): топор и яблоки — мимо.
    expect(a.canList).toBe(true);
    expect(a.toMain).toEqual([]);
    expect(a.drops.map((d) => `${d.stackKey}:${d.bag}/${d.burn}`)).toEqual([
      "custom:cst_axe:1/1",
      "custom:cst_apple:15/0",
    ]);
    // Мёд доливается в свою ячейку — влезает, окна нет.
    expect([b.canList, b.toMain.map((x) => x.qty), b.drops]).toEqual([true, [5], []]);
  });

  it("не влезает, а игрока нет на карте — no_position; ключ согласия — по герою", async () => {
    st.onMap = false;
    const [, a, b] = await sellableHeroes("w.near", "acc_S");
    expect([a.reason, b.reason]).toEqual(["heromkt.no_position", null]);
    expect(a.dropsKey).toMatch(/^dk_[0-9a-z]+$/);
    expect(b.dropsKey).toBe("");
  });

  it("основного нет — всё выпадет мешочком (можно с окном); гриб — dmine_no_main", async () => {
    st.main = null;
    st.stacks.push(stack("hi_b", "dmine:darai", 1));
    const [, a, b] = await sellableHeroes("w.near", "acc_S");
    expect([a.canList, a.toMain, a.drops.map((d) => `${d.stackKey}:${d.bag}/${d.burn}`)]).toEqual([
      true,
      [],
      ["custom:cst_axe:1/1", "custom:cst_apple:15/0"],
    ]);
    expect(b.reason).toBe("heromkt.dmine_no_main");
  });
});
