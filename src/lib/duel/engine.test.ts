import { describe, expect, it } from "vitest";
import { DEPLOY_COLS, act, createDuel, notStarted, offerWait, redeploy } from "./engine";
import { acceptsOffer, aiAction, armyLeft } from "./ai";
import { current, unitById } from "./options";
import { SPELLS, hitDamage, parseDamage, spellCost } from "./rules";
import { COLS, type DuelState, type SideInput, type Unit, type UnitInput } from "./types";

const mob = (id: string, over: Partial<UnitInput> = {}): UnitInput => ({
  id,
  kind: "mob",
  name: id,
  image: null,
  hp: 10_000,
  maxHp: 10_000,
  dmg: [800, 1200],
  arm: 0,
  move: 3,
  range: 1,
  ...over,
});

const side = (tag: string, mobs = 2): SideInput => ({
  hero: { ...mob(`hero_${tag}`), kind: "hero", hp: 3000, maxHp: 4000, dmg: [7100, 7100], arm: 20 },
  mobs: Array.from({ length: mobs }, (_, i) => mob(`${tag}${i}`)),
  kit: {
    energy: 50,
    int: 40,
    food: [{ id: "f", name: "Лепешки", image: null, value: 400 }, null, null],
  },
});

function playOut(st: DuelState, limit = 2000): DuelState {
  for (let i = 0; i < limit && !st.winner; i++) {
    const a = aiAction(st);
    if (!a) break;
    st = act(st, a);
  }
  return st;
}

describe("дуэль", () => {
  it("расстановка: герой и мобы по краям, препятствия не на бойцах", () => {
    const st = createDuel(side("a"), side("b"), 7);
    expect(st.units).toHaveLength(6);
    expect(unitById(st, "a:hero")?.pos.c).toBe(0);
    expect(unitById(st, "b:hero")?.pos.c).toBe(COLS - 1);
    const taken = new Set(st.units.map((u) => `${u.pos.c},${u.pos.r}`));
    for (const o of st.obstacles) expect(taken.has(`${o.c},${o.r}`)).toBe(false);
  });

  it("бой компьютер против компьютера заканчивается победой", () => {
    const end = playOut(createDuel(side("a", 4), side("b", 4), 42));
    expect(end.winner).not.toBeNull();
  });

  it("тот же сид — тот же бой", () => {
    const x = playOut(createDuel(side("a"), side("b"), 9));
    const y = playOut(createDuel(side("a"), side("b"), 9));
    expect(x.log).toEqual(y.log);
  });

  it("заклинание не лечит, энергия списывается со скидкой интеллекта", () => {
    let st = createDuel(side("a"), side("b"), 1);
    while (current(st)?.id !== "a:hero") st = act(st, aiAction(st)!);
    const before = st.kits.a.energy;
    const hp = (unitById(st, "a:hero") as Unit).hp;
    st = act(st, { t: "cast", spell: "def", target: "a:hero" });
    const hero = unitById(st, "a:hero") as Unit;
    expect(hero.hp).toBe(hp);
    expect(hero.buffDef).toBeGreaterThan(0);
    expect(st.kits.a.energy).toBe(before - spellCost("def", 40));
    expect(spellCost("def", 40)).toBe(8);
  });

  it("неверный ход — ошибка", () => {
    const st = createDuel(side("a"), side("b"), 1);
    expect(() => act(st, { t: "move", to: { c: 10, r: 4 } })).toThrow();
    expect(() => act(st, { t: "shoot", target: "b:hero" })).toThrow();
  });

  it("побег — победа другой стороне", () => {
    const st = act(createDuel(side("a"), side("b"), 1), { t: "flee" });
    expect(st.fled).not.toBeNull();
    expect(st.winner).not.toBe(st.fled);
  });
});

describe("находки критика", () => {
  it("мобы на 1 клетку не застревают за камнями: 200 боёв доходят до победы", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const slow = (tag: string): SideInput => {
        const sd = side(tag, 4);
        return { ...sd, mobs: sd.mobs.map((m, i) => ({ ...m, move: 1 + (i % 2) })) };
      };
      const end = playOut(createDuel(slow("a"), slow("b"), seed), 5000);
      expect(end.winner, `seed ${seed}`).not.toBeNull();
    }
    // 200 полных боёв: в общем прогоне под нагрузкой 5 с по умолчанию мало.
  }, 120_000);

  it("стена камней: моб обходит, а не стоит в защите", () => {
    let st = createDuel(side("a", 1), side("b", 1), 3);
    st = structuredClone(st);
    st.obstacles = [
      { c: 11, r: 2 },
      { c: 11, r: 3 },
      { c: 11, r: 4 },
    ];
    const a0 = unitById(st, "a:a0:0") as Unit;
    a0.pos = { c: 10, r: 4 };
    a0.move = 1;
    expect(playOut(st, 5000).winner).not.toBeNull();
  });

  it("голодный герой без мобов — поражение сразу, бой не висит", () => {
    const hungry = side("a", 0);
    hungry.hero = { ...hungry.hero, hp: 0 };
    const st = createDuel(hungry, side("b"), 1);
    expect(st.winner).toBe("b");
  });

  it("еда при полной сытости не тратится; лечения в бою нет", () => {
    const full = side("a");
    full.hero = { ...full.hero, hp: 4000 };
    let st = createDuel(full, side("b"), 1);
    while (current(st)?.id !== "a:hero") st = act(st, aiAction(st)!);
    expect(() => act(st, { t: "eat", slot: 0 })).toThrow();
    expect(Object.keys(SPELLS)).toEqual(["atk", "def"]);
  });
});

describe("урон", () => {
  it("по герою ×0,1 и броня режет", () => {
    const a = {
      ...mob("x"),
      side: "b",
      pos: { c: 0, r: 0 },
      buffAtk: 0,
      buffDef: 0,
      defending: false,
    } as Unit;
    const h = { ...a, kind: "hero", arm: 100 } as Unit;
    expect(hitDamage({ ...a, dmg: [1000, 1000] }, h, 0, false)).toBe(50);
    expect(hitDamage({ ...a, dmg: [1000, 1000] }, { ...h, defending: true }, 0, false)).toBe(25);
  });
  it("урон шаблона: число, диапазон, пусто", () => {
    expect(parseDamage("80-120")).toEqual([80, 120]);
    expect(parseDamage(15000)).toEqual([15000, 15000]);
    expect(parseDamage(null)).toEqual([80, 80]);
  });
});

describe("поле 12 и расстановка (09.11.2026)", () => {
  const st0 = createDuel(side("a"), side("b"), 7);

  it("12 столбцов; камни только между зонами расстановки", () => {
    expect(COLS).toBe(12);
    for (const p of st0.obstacles) {
      expect(p.c).toBeGreaterThanOrEqual(DEPLOY_COLS + 1);
      expect(p.c).toBeLessThan(COLS - DEPLOY_COLS - 1);
    }
  });

  it("до первого хода свой боец переставляется в своей зоне; занято своим — меняются", () => {
    expect(notStarted(st0)).toBe(true);
    const hero = unitById(st0, "a:hero") as Unit;
    const mob0 = st0.units.find((u) => u.side === "a" && u.kind === "mob") as Unit;
    const moved = redeploy(st0, "a:hero", { c: 1, r: 0 });
    expect(unitById(moved, "a:hero")?.pos).toEqual({ c: 1, r: 0 });
    const swapped = redeploy(st0, "a:hero", mob0.pos);
    expect(unitById(swapped, "a:hero")?.pos).toEqual(mob0.pos);
    expect(unitById(swapped, mob0.id)?.pos).toEqual(hero.pos);
    expect(unitById(st0, "a:hero")?.pos).toEqual(hero.pos); // исходное не тронуто
  });

  it("вне зоны, на врага, после первого хода — отказ", () => {
    expect(() => redeploy(st0, "a:hero", { c: DEPLOY_COLS, r: 0 })).toThrow("duel.bad_move");
    expect(() => redeploy(st0, "b:hero", { c: 0, r: 0 })).toThrow("duel.bad_move");
    const started = act(st0, { t: "defend" });
    expect(notStarted(started)).toBe(false);
    expect(() => redeploy(started, "a:hero", { c: 0, r: 0 })).toThrow("duel.started");
  });
});

describe("предложить ничью / сдаться (владелец 09.11.2026)", () => {
  // Предлагать можно через 10 ходов боя (и через 10 после прошлого предложения).
  let st0 = createDuel(side("a"), side("b"), 3);
  for (let i = 0; i < 10; i++) st0 = act(st0, { t: "defend" });

  it("раньше 10 ходов — нельзя; после предложения — снова через 10", () => {
    const fresh = createDuel(side("a"), side("b"), 3);
    expect(offerWait(fresh, "a")).toBe(10);
    expect(() => act(fresh, { t: "offer", what: "draw", accept: false })).toThrow(
      "duel.offer_wait",
    );
    const who = current(st0)?.side as "a" | "b";
    expect(offerWait(st0, who)).toBe(0);
    const after = act(st0, { t: "offer", what: "draw", accept: false });
    expect(offerWait(after, who)).toBe(10);
    expect(() => act(after, { t: "offer", what: "surrender", accept: false })).toThrow(
      "duel.offer_wait",
    );
  });

  it("отказ — запись в журнале, ход тот же, бой идёт", () => {
    const who = current(st0)?.id;
    const st = act(st0, { t: "offer", what: "draw", accept: false });
    expect(current(st)?.id).toBe(who);
    expect(st.turn).toBe(st0.turn);
    expect(st.log.at(-1)).toMatchObject({ k: "offer", what: "draw", ok: false });
  });

  it("согласие на ничью — бой окончен без победителя", () => {
    const st = act(st0, { t: "offer", what: "draw", accept: true });
    expect(st.draw).toBe(true);
    expect(st.winner).toBeNull();
    expect(current(st)).toBeNull();
    expect(() => act(st, { t: "defend" })).toThrow("duel.over");
  });

  it("сдался — победа предложившего", () => {
    const side0 = current(st0)?.side as "a" | "b";
    const st = act(st0, { t: "offer", what: "surrender", accept: true });
    expect(st.winner).toBe(side0);
    expect(st.conceded).toBe(side0 === "a" ? "b" : "a");
  });

  it("компьютер: сдаётся, когда сил меньше половины и меньше, чем у вас; ничья — если не выигрывает явно", () => {
    const st = JSON.parse(JSON.stringify(st0)) as DuelState;
    expect(armyLeft(st, "b")).toBeCloseTo(armyLeft(st, "a"), 5);
    expect(acceptsOffer(st, "b", "surrender")).toBe(false);
    expect(acceptsOffer(st, "b", "draw")).toBe(true);
    for (const u of st.units) if (u.side === "b" && u.kind === "mob") u.hp = 0;
    expect(armyLeft(st, "b")).toBeLessThan(0.5);
    expect(acceptsOffer(st, "b", "surrender")).toBe(true);
    // Перевес у компьютера — ничью не берёт.
    expect(acceptsOffer(st, "a", "draw")).toBe(false);
  });
});
