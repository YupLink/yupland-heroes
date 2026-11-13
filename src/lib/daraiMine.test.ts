// Гриб DARAI (lib/daraiMine): числа владельца, стопка рюкзака, выпадение (час
// или конец жизни — что раньше), часы «мм:сс», узнавание настройки клетки и
// перечитывание, когда ближайшее выпадение сменилось.
import { describe, expect, it } from "vitest";
import {
  DMINE_CARRY_MS,
  DMINE_ITEM_NAME,
  DMINE_STACK,
  MUSHROOM_ENERGY,
  MUSHROOM_LIFE_MS,
  MUSHROOM_YIELD,
  dmineClock,
  dmineDropAt,
  dmineLeftMs,
  dmineNameOr,
  dminePlacedLate,
  isDaraiMineConfig,
  isDaraiMineKey,
  pickDmineTimer,
  type DmineTimer,
} from "./daraiMine";
import { localizeAssetName } from "./translations/assetNames";

describe("числа владельца", () => {
  it("10 000 DARAI в час, 5 энергии за подъём и посадку, неделя жизни, час в рюкзаке", () => {
    expect(MUSHROOM_YIELD).toBe(10_000);
    expect(MUSHROOM_ENERGY).toBe(5);
    expect(MUSHROOM_LIFE_MS).toBe(7 * 24 * 3_600_000);
    expect(DMINE_CARRY_MS).toBe(3_600_000);
  });
});

describe("стопка грибов", () => {
  it("одна стопка dmine:darai; прежние dmine:<id> — тоже грибы; прочее — нет", () => {
    expect(DMINE_STACK).toBe("dmine:darai");
    expect(isDaraiMineKey(DMINE_STACK)).toBe(true);
    expect(isDaraiMineKey("dmine:dm_abc")).toBe(true);
    for (const k of ["dmine:", "custom:dmine:x", "boss:rbt_1", "", null, undefined]) {
      expect(isDaraiMineKey(k)).toBe(false);
    }
  });
});

describe("выпадение из рюкзака", () => {
  const taken = Date.parse("2026-10-22T10:00:00Z");
  it("час с минуты, когда лёг в рюкзак, если жизнь дольше", () => {
    expect(dmineDropAt(taken, taken + MUSHROOM_LIFE_MS)).toBe(taken + DMINE_CARRY_MS);
    expect(dmineDropAt(taken, null)).toBe(taken + DMINE_CARRY_MS);
  });

  it("жизнь кончается раньше часа — выпадение в конец жизни", () => {
    expect(dmineDropAt(taken, taken + 20 * 60_000)).toBe(taken + 20 * 60_000);
  });

  it("остаток не уходит в минус, часы — «мм:сс» вверх до секунды", () => {
    const end = 10_000_000;
    expect(dmineLeftMs(end, end + 5)).toBe(0);
    expect(dmineClock(DMINE_CARRY_MS)).toBe("60:00");
    expect(dmineClock(61_500)).toBe("01:02");
    expect(dmineClock(0)).toBe("00:00");
    expect(dmineClock(-5)).toBe("00:00");
  });
});

describe("настройка клетки", () => {
  it("DARAI — ресурс token и токен Darai в любом регистре", () => {
    expect(isDaraiMineConfig({ resource: "token", token: "Darai", yield: 10000 })).toBe(true);
    expect(isDaraiMineConfig({ resource: "token", token: "DARAI" })).toBe(true);
  });

  it("пыль, энергия, золото и пустое — не DARAI", () => {
    expect(isDaraiMineConfig({ resource: "token", token: "magicdust" })).toBe(false);
    expect(isDaraiMineConfig({ resource: "energy" })).toBe(false);
    expect(isDaraiMineConfig({ resource: "gold", token: "Darai" })).toBe(false);
    expect(isDaraiMineConfig(null)).toBe(false);
    expect(isDaraiMineConfig("Darai")).toBe(false);
  });
});

describe("имя в списках", () => {
  it("«Гриб DARAI» / «DARAI Mushroom» по виду стопки; прочее — как есть", () => {
    expect(DMINE_ITEM_NAME).toBe("Гриб DARAI");
    expect(dmineNameOr(DMINE_STACK, "что угодно", "ru")).toBe("Гриб DARAI");
    expect(dmineNameOr(DMINE_STACK, "что угодно", "en")).toBe("DARAI Mushroom");
    expect(dmineNameOr("custom:apple", "Яблоко", "en")).toBe("Яблоко");
  });

  it("имя облика на карте и подпись из базы — по-английски тоже", () => {
    expect(localizeAssetName("Гриб DARAI", "en")).toBe("DARAI Mushroom");
    expect(localizeAssetName("Гриб DARAI", "ru")).toBe("Гриб DARAI");
    expect(localizeAssetName("DARAI-шахта", "en")).toBe("DARAI mine");
  });
});

describe("ближайшее выпадение сменилось (useDaraiMineExpiry)", () => {
  const now = 1_000_000;
  it("после своего срока: грибов не осталось или следующий — перечитать рюкзак", () => {
    expect(dminePlacedLate(now - 1, null, now)).toBe(true);
    expect(dminePlacedLate(now, null, now)).toBe(true);
    expect(dminePlacedLate(now - 1, now + 30 * 60_000, now)).toBe(true);
  });

  it("посажен руками до срока, срок прежний или таймера не было — нет", () => {
    expect(dminePlacedLate(now + 60_000, null, now)).toBe(false);
    expect(dminePlacedLate(now - 1, now - 1, now)).toBe(false);
    expect(dminePlacedLate(null, null, now)).toBe(false);
  });
});

describe("таймер ячейки — рюкзак своего героя (25.10)", () => {
  const timer = (heroId: string, selected: boolean, stackKey: string, expiresAt: number): DmineTimer =>
    ({ heroId, selected, stackKey, expiresAt, count: 1 });
  const timers = [
    timer("h1", true, "dmine:darai", 100),
    timer("h2", false, "dmine:darai", 200),
    timer("h2", false, "dmine:gold", 300),
  ];
  it("герой указан (замок, таверна) — его таймер, не выбранного", () => {
    expect(pickDmineTimer(timers, "dmine:darai", "h2")?.expiresAt).toBe(200);
    expect(pickDmineTimer(timers, "dmine:gold", "h2")?.expiresAt).toBe(300);
    expect(pickDmineTimer(timers, "dmine:gold", "h1")).toBeNull();
  });
  it("героя нет (склад, сундук, мешочек) — выбранного", () => {
    expect(pickDmineTimer(timers, "dmine:darai")?.expiresAt).toBe(100);
    expect(pickDmineTimer(timers, "dmine:darai", null)?.expiresAt).toBe(100);
    expect(pickDmineTimer(timers, "dmine:gold")).toBeNull();
    expect(pickDmineTimer(undefined, "dmine:darai")).toBeNull();
  });
});
