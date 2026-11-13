// Гонка «разбудить» против «сдать в ломбард»: все пути, что заводят экземпляр
// копии героя (пробуждение, первая прокачка), и ломбард, что копию снимает,
// первым оператором берут ОДИН замок копии, а вставка экземпляра под ним
// проверяет, что копия ещё на месте. Сданного разбудить нельзя.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  sqls: [] as string[],
  /** Экземпляр копии уже есть (до вставки / после неудачной вставки). */
  have: [] as Array<string | null>,
  /** Ответ вставки пробуждения: id или пусто (0 строк). */
  inserted: null as string | null,
  /** Ответ атомарного создания за лайки. */
  created: null as number | null,
  avail: 0,
}));

vi.mock("../db/pg", () => ({ pg: {} }));
vi.mock("./testers", () => ({ requireFeature: async () => "w_me" }));
vi.mock("../likesAccount", () => ({ likeAccountId: async () => "acc_me" }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sqls.push(sql);
    if (sql.includes("WITH ins AS (\n  INSERT INTO yuplink.hero_instance"))
      return st.inserted ? [{ id: st.inserted }] : [];
    if (sql.includes("WITH cur AS"))
      return [{ new_level: st.created, likes_left: 0, avail_before: st.avail }];
    if (sql.includes("SELECT id FROM yuplink.hero_instance")) {
      const id = st.have.shift() ?? null;
      return id ? [{ id }] : [];
    }
    if (sql.includes("SELECT u.template_id, t.level")) return [{ template_id: "hero_A", level: 2 }];
    return [];
  },
}));

const { heroItemLockSql } = await import("./hero-item-lock");
const { wakeHeroInstance, wakeInsertSql } = await import("./heroes-wake");
const { createHeroAtomic } = await import("./heroes-shared");
const { takeHeroSql } = await import("./beta-raid/hero-pawn-sql");

const LOCK = heroItemLockSql("ugi_1");

beforeEach(() => {
  st.sqls = [];
  st.have = [];
  st.inserted = null;
  st.created = null;
  st.avail = 0;
});

describe("один замок копии на всех", () => {
  it("ломбард, пробуждение и первая прокачка начинают с одного и того же замка", () => {
    expect(LOCK).toBe("SELECT pg_advisory_xact_lock(hashtext('heroitem:ugi_1')) AS l;");
    const take = takeHeroSql({ account: "acc", itemId: "ugi_1", rarity: "rare", op: "o" });
    const wake = wakeInsertSql({
      id: "h1",
      wallet: "w",
      list: "'acc'",
      itemId: "ugi_1",
      rarity: "rare",
    });
    for (const sql of [take, wake]) expect(sql.startsWith(`${LOCK}\n`)).toBe(true);
  });
});

describe("пробуждение (wakeHeroInstance)", () => {
  it("вставка — под замком и только пока копия у игрока и без экземпляра", async () => {
    st.inserted = "hero_new";
    expect(await wakeHeroInstance("w", "acc", "ugi_1")).toBe("hero_new");
    const ins = st.sqls.find((s) => s.includes("INSERT INTO yuplink.hero_instance")) ?? "";
    expect(ins.startsWith(`${LOCK}\n`)).toBe(true);
    expect(ins).toContain("FROM yuplink.user_game_item u");
    expect(ins).toContain("WHERE u.id = 'ugi_1' AND u.account_id IN ('acc') AND u.kind = 'hero'");
    expect(ins).toContain("AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance h");
    // Редкость — по ярусу шаблона (2 → обычный), как и прежде.
    expect(ins).toContain("'common'");
  });

  it("копию сдали в ломбард за миг до нас — 0 строк и отказ, экземпляра нет", async () => {
    await expect(wakeHeroInstance("w", "acc", "ugi_1")).rejects.toThrow("Это не твой герой");
  });

  it("соседний запрос разбудил раньше — берём его экземпляр, второго не заводим", async () => {
    st.have = [null, "hero_other"];
    expect(await wakeHeroInstance("w", "acc", "ugi_1")).toBe("hero_other");
  });

  it("уже разбужен — без вставки", async () => {
    st.have = ["hero_old"];
    expect(await wakeHeroInstance("w", "acc", "ugi_1")).toBe("hero_old");
    expect(st.sqls.some((s) => s.includes("INSERT"))).toBe(false);
  });
});

describe("первая прокачка (createHeroAtomic)", () => {
  const args = {
    wallet: "w",
    heroId: "hero_1",
    templateId: "hero_A",
    itemId: "ugi_1",
    rarity: "rare" as const,
    cost: 100,
  };

  it("с копией — сначала замок, вставка только пока копия на месте", async () => {
    st.created = 1;
    st.avail = 500;
    await createHeroAtomic(args);
    const sql = st.sqls.find((s) => s.includes("WITH cur AS")) ?? "";
    expect(sql.startsWith(`${LOCK}\n`)).toBe(true);
    expect(sql).toContain(
      "AND EXISTS (SELECT 1 FROM yuplink.user_game_item u\n                    WHERE u.id = 'ugi_1'",
    );
  });

  it("лайков хватало, а копии уже нет — «нет героя», а не «мало лайков»", async () => {
    st.avail = 500;
    await expect(createHeroAtomic(args)).rejects.toThrow("Этого героя у тебя нет");
    st.avail = 10;
    await expect(createHeroAtomic(args)).rejects.toThrow("Нужно 100 лайков, у тебя 10.00");
  });

  it("без копии (старый путь) — как раньше: без замка и проверки копии", async () => {
    st.created = 1;
    st.avail = 500;
    await createHeroAtomic({ ...args, itemId: null });
    const sql = st.sqls.find((s) => s.includes("WITH cur AS")) ?? "";
    expect(sql.startsWith("WITH cur AS")).toBe(true);
    expect(sql).not.toContain("user_game_item");
  });
});
