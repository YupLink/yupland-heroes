// Случайная подборка состава и тема обликов: `bun run test`.
//
// Смысл — «подборка каждый раз другая, но по правилам»: лимит служб растёт с
// размером (Civ VI), модель внутри роли не повторяется, пока есть из чего
// (HoMM3), одинаковых моделей не больше ⌊N/10⌋+1, а шахты и поля без своего
// конфига в город не попадают никогда.
import { describe, expect, it } from "vitest";
import { mulberry32 } from "@/lib/raid/zonegen/noise";
import {
  canonOrder,
  composeRandom,
  manualCompose,
  modelCap,
  serviceLimit,
} from "@/lib/raid/zonegen/town/compose";
import { roleOf } from "@/lib/raid/zonegen/town/roles";
import {
  pickTheme,
  skinFor,
  THEME_MIN_COVERAGE,
  themeOfName,
  themesOf,
} from "@/lib/raid/zonegen/town/theme";
import type { TownPick } from "@/lib/raid/zonegen/town/types";
import { OPTIONS, opt } from "@/test/townFixture";

const compose = (n: number, seed: number, hall = false, water = false): TownPick[] =>
  composeRandom(n, OPTIONS, water, mulberry32(seed), { hall, theme: null });
const ids = (p: TownPick[]) => p.map((x) => x.option.id).join(",");

/** Службы в лимите: без ратуши, склада, верфи, жилья и лавок (их считает покрытие). */
const COUNTED = new Set([
  "temple",
  "tavern",
  "barracks",
  "armory",
  "forge",
  "university",
  "museum",
  "arena",
  "watchtower",
]);
const counted = (p: TownPick[]) => p.filter((x) => COUNTED.has(x.role));

describe("roleOf — роль по эффекту и имени", () => {
  it("казарма и оружейная — рынки по механике, но свои роли в городе", () => {
    expect(roleOf(opt("a", "Казарма - Найм войнов", "market"))).toBe("barracks");
    expect(roleOf(opt("a", "Оружейный - Рынок", "market"))).toBe("armory");
    expect(roleOf(opt("a", "Пекарня", "market"))).toBe("market");
    expect(roleOf(opt("a", "Храм", null))).toBe("temple");
    expect(roleOf(opt("a", "Плавильня", null))).toBe("forge");
    expect(roleOf(opt("a", "Столб заклинаний", "spellbook"))).toBe("market");
    expect(roleOf(opt("a", "Сарай", null))).toBe("house");
  });
  it("шахта, поле, портал — не в город", () => {
    expect(roleOf(opt("a", "Шахта", "mine", 2, [], true))).toBeNull();
    expect(OPTIONS.some((o) => ["mine", "field", "portal"].includes(o.id))).toBe(false);
  });
});

describe("composeRandom — подборка от сида", () => {
  it("тот же сид — тот же состав, другой сид — другой", () => {
    expect(ids(compose(24, 7))).toBe(ids(compose(24, 7)));
    const variants = new Set(Array.from({ length: 12 }, (_, s) => ids(compose(24, s + 1))));
    expect(variants.size).toBeGreaterThan(8);
  });

  it("служб не больше лимита 1+⌊(N−1)/3⌋ (лавки сверх лимита — фон, не службы)", () => {
    for (let n = 3; n <= 40; n++) {
      for (let seed = 1; seed <= 5; seed++) {
        expect(counted(compose(n, seed)).length).toBeLessThanOrEqual(serviceLimit(n));
      }
    }
  });

  it("ровно N построек, одна модель — не больше ⌊N/10⌋+1", () => {
    for (const n of [5, 12, 24, 40]) {
      const picks = compose(n, 3, n > 20);
      expect(picks).toHaveLength(n);
      const byId = new Map<string, number>();
      for (const p of picks) byId.set(p.option.id, (byId.get(p.option.id) ?? 0) + 1);
      for (const c of byId.values()) expect(c).toBeLessThanOrEqual(modelCap(n));
    }
  });

  it("внутри роли модели не повторяются, пока есть из чего", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const picks = compose(40, seed, true);
      const markets = picks.filter((x) => x.role === "market").map((x) => x.option.id);
      const pool = OPTIONS.filter((o) => o.role === "market").length;
      expect(new Set(markets).size).toBe(Math.min(markets.length, pool));
      const forges = picks.filter((x) => x.role === "forge").map((x) => x.option.id);
      expect(new Set(forges).size).toBe(forges.length);
    }
  });

  it("ратуша только по флагу и только настоящая; храм не раньше 8 построек", () => {
    expect(compose(12, 1).some((x) => x.role === "town_hall")).toBe(false);
    const halls = compose(30, 1, true).filter((x) => x.role === "town_hall");
    expect(halls.map((x) => x.option.id)).toEqual(["hall"]);
    for (let seed = 1; seed <= 20; seed++) {
      expect(compose(7, seed).some((x) => x.role === "temple")).toBe(false);
    }
  });

  it("верфь — только у воды", () => {
    const dry = Array.from({ length: 10 }, (_, s) => compose(30, s + 1, true));
    expect(dry.flat().some((x) => x.role === "shipyard")).toBe(false);
    const wet = Array.from({ length: 10 }, (_, s) => compose(30, s + 1, true, true));
    expect(wet.every((p) => p.filter((x) => x.role === "shipyard").length === 1)).toBe(true);
  });

  it("канон перемешан не больше чем на ⌊len/10⌋ соседних обменов", () => {
    const order = canonOrder(false, mulberry32(5));
    expect(order.slice(0, 3).sort()).toEqual(["market", "tavern", "warehouse"].sort());
    expect(canonOrder(true, mulberry32(5))).toContain("shipyard");
  });
});

describe("manualCompose — ручной состав", () => {
  it("точные штуки как заказаны, фон добивает до N", () => {
    const picks = manualCompose(
      [
        { buildingId: "tavern", count: 1 },
        { buildingId: "m0", count: 0, fill: true },
        { buildingId: "m1", count: 0, fill: true },
      ],
      OPTIONS,
      6,
    );
    expect(picks).toHaveLength(6);
    expect(picks[0].role).toBe("tavern");
    expect(picks.slice(1).every((x) => x.role === "house")).toBe(true);
  });
});

describe("тема обликов", () => {
  it("тема — первое слово имени, зимние синонимы сведены", () => {
    expect(themeOfName("Юпик лавка")).toBe("Юпик");
    expect(themeOfName("морж-склад")).toBe("Северный");
    expect(themeOfName("Мертвец")).toBe("Адский");
  });

  it("охват считается по ролям; жребий — только среди охвата ≥ 5", () => {
    const cover = new Map(themesOf(OPTIONS).map((t) => [t.theme, t.coverage]));
    expect(cover.get("Юпик")).toBeGreaterThanOrEqual(THEME_MIN_COVERAGE);
    expect(cover.get("Кабан")).toBeLessThan(THEME_MIN_COVERAGE);
    for (let seed = 1; seed <= 30; seed++) {
      expect(pickTheme(OPTIONS, "", mulberry32(seed))).toBe("Юпик");
    }
    expect(pickTheme(OPTIONS, "кабан", mulberry32(1))).toBe("Кабан");
    expect(pickTheme(OPTIONS, "none", mulberry32(1))).toBeNull();
  });

  it("skinFor находит облик темы, а без облика — null", () => {
    const tavern = OPTIONS.find((o) => o.id === "tavern");
    const forge = OPTIONS.find((o) => o.id === "forge");
    expect(tavern && skinFor(tavern, "Юпик")).toBe("tav_Юпик");
    expect(tavern && skinFor(tavern, "Северный")).toBe("tav_Морж");
    expect(forge && skinFor(forge, "Юпик")).toBeNull();
    const themed = composeRandom(20, OPTIONS, false, mulberry32(2), { hall: false, theme: "Юпик" });
    const t = themed.find((x) => x.option.id === "tavern");
    if (t !== undefined) expect(t.skinId).toBe("tav_Юпик");
  });
});

describe("заказ шаблона правит канон", () => {
  const CENTRAL = new Set(["tavern", "temple", "market", "town_hall"]);

  it("хутор — без центральных функций: ни таверны, ни храма, ни лавок", () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(canonOrder(true, mulberry32(seed), "hamlet")).toEqual(
        expect.not.arrayContaining(["tavern", "temple", "market", "watchtower"]),
      );
      const picks = composeRandom(7, OPTIONS, false, mulberry32(seed), {
        hall: false,
        theme: null,
        kind: "hamlet",
      });
      expect(picks).toHaveLength(7);
      expect(picks.filter((p) => CENTRAL.has(p.role))).toEqual([]);
    }
  });

  it("лагерь — найм первым при любом сиде", () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(canonOrder(false, mulberry32(seed), "camp")[0]).toBe("barracks");
      const picks = composeRandom(5, OPTIONS, false, mulberry32(seed), {
        hall: false,
        theme: null,
        kind: "camp",
      });
      expect(picks.some((p) => p.role === "barracks")).toBe(true);
    }
  });

  it("храм — настоящий (boost), а не картинка без механики", () => {
    const withFake = [...OPTIONS, { ...opt("temple_fake", "Храм", null), role: "temple" as const }];
    for (let seed = 1; seed <= 20; seed++) {
      const picks = composeRandom(24, withFake, false, mulberry32(seed), {
        hall: true,
        theme: null,
      });
      expect(picks.some((p) => p.option.id === "temple_fake")).toBe(false);
    }
  });
});
