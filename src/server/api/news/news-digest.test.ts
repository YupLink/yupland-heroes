import { describe, expect, it } from "vitest";
import { adminLists, groupLeaders, parseHighlights, parseTotals } from "./news-digest";
import { keyFromRequest, sameKey } from "./news-key";

describe("news-digest", () => {
  it("parseTotals: текст базы → целые, пусто — нули", () => {
    const t = parseTotals({
      active: "147",
      energy: "1616388.05",
      darai: "732780274.38",
      gold: null,
    });
    expect(t.active).toBe(147);
    expect(t.energy).toBe(1616388);
    expect(t.darai).toBe(732780274);
    expect(t.gold).toBe(0);
    expect(parseTotals(undefined).steps).toBe(0);
  });

  it("groupLeaders: имя героя вместо ника, порядок строк, чужие доски — мимо", () => {
    const heroes = new Map([["acc_1", { name: "Fedr - Stubborn Mage", image: "/f.png" }]]);
    const g = groupLeaders(
      [
        { board: "gold", account_id: "acc_1", v: "100" },
        { board: "gold", account_id: "acc_test0002", v: 50 },
        { board: "bogus", account_id: "acc_1", v: 1 },
      ],
      heroes,
      "ru",
    );
    expect(g.gold).toEqual([
      { name: "Fedr", value: 100, portrait: "/f.png" },
      { name: "Безымянный", value: 50 },
    ]);
    expect(g.steps).toEqual([]);
    expect("bogus" in g).toBe(false);
    expect(JSON.stringify(g)).not.toContain("@");
  });

  it("adminLists: те же переменные, что у админки", () => {
    const env = { ADMIN_WALLETS: " a.near, ,b.near", ADMIN_TG_ACCOUNTS: "1, x, 2" };
    expect(adminLists(env)).toEqual({ wallets: ["a.near", "b.near"], tgIds: [1, 2] });
    expect(adminLists({})).toEqual({ wallets: [], tgIds: [] });
  });
});

describe("события окна", () => {
  it("parseHighlights: монстр и декор; пустое и нули — мимо", () => {
    expect(
      parseHighlights([
        { kind: "monster", name: "Чайка (5 Lv)", image: "/g.png", n: "76" },
        { kind: "decor", name: "Дерево Гречи", image: null, n: 19 },
        { kind: "other", name: "x", image: null, n: 5 },
      ]),
    ).toEqual({
      monster: { name: "Чайка (5 Lv)", image: "/g.png", n: 76 },
      decor: { name: "Дерево Гречи", image: null, n: 19 },
    });
    expect(parseHighlights([{ kind: "monster", name: null, image: null, n: 3 }])).toEqual({});
  });

  it("портрет — трём богачам и первому по шагам", () => {
    const hero = (id: string) => [id, { name: `H${id}`, image: `/${id}.png` }] as const;
    const g = groupLeaders(
      [
        ...["a", "b", "c", "d"].map((id, i) => ({ board: "gold", account_id: id, v: 10 - i })),
        { board: "steps", account_id: "a", v: 10 },
        { board: "steps", account_id: "b", v: 5 },
        { board: "fights", account_id: "a", v: 5 },
      ],
      new Map(["a", "b", "c", "d"].map(hero)),
      "ru",
    );
    expect(g.gold.map((l) => l.portrait)).toEqual(["/a.png", "/b.png", "/c.png", undefined]);
    expect(g.steps.map((l) => l.portrait)).toEqual(["/a.png", undefined]);
    expect(g.fights[0].portrait).toBeUndefined();
  });
});

describe("news-key", () => {
  it("sameKey: только точное совпадение", () => {
    expect(sameKey("abc", "abc")).toBe(true);
    expect(sameKey("abd", "abc")).toBe(false);
    expect(sameKey("ab", "abc")).toBe(false);
    expect(sameKey("abc", null)).toBe(false);
    expect(sameKey(null, "abc")).toBe(false);
  });

  it("keyFromRequest: ?key= или Bearer", () => {
    expect(keyFromRequest(new Request("https://x.io/api/news?key=k1"))).toBe("k1");
    const r = new Request("https://x.io/api/news", { headers: { authorization: "Bearer k2" } });
    expect(keyFromRequest(r)).toBe("k2");
    expect(keyFromRequest(new Request("https://x.io/api/news"))).toBe(null);
  });
});
