// Эффект «Забвение» как вид эффекта в общем списке (зелье, заклинание, алтарь,
// храм): разбор по паре «уровень + минуты» (правило 28.09), броски, сведение
// нескольких штук по трём видам, подписи и «можно ли забывать прямо сейчас».
import { describe, expect, it } from "vitest";
import {
  BOOST_STAT_KEYS,
  boostEffectText,
  boostRollText,
  parseBoostEffects,
  rollBoostEffect,
  rollBoostQty,
  type BoostEffect,
} from "./boost";
import { NO_OBLIVION, oblivionActive, oblivionStateOf, oblivionText } from "./boostOblivion";
import { dict as fxDict } from "@/lib/translations/braid-boost-fx";
import { dict as oblDict } from "@/lib/translations/braid-oblivion";

const obl = (value: string, minutes = ""): BoostEffect => ({ stat: "oblivion", value, minutes });

describe("разбор: parseBoostEffects", () => {
  it("вид выбирается в общем редакторе — рядом с иммунитетом", () => {
    expect(BOOST_STAT_KEYS).toContain("oblivion");
  });

  it("N без минут — заряды: 30 минут по умолчанию не подставляются", () => {
    expect(parseBoostEffects([{ stat: "oblivion", value: "3", minutes: "" }])).toEqual([obl("3")]);
    expect(parseBoostEffects([{ stat: "oblivion", value: "1-3" }])).toEqual([obl("1-3")]);
  });

  it("«0» с минутами — без счёта на время: разрешено", () => {
    expect(parseBoostEffects([{ stat: "oblivion", value: "0", minutes: "30" }])).toEqual([
      obl("0", "30"),
    ]);
  });

  it("N с минутами — заряды со сроком", () => {
    expect(parseBoostEffects([{ stat: "oblivion", value: "2", minutes: "10-20" }])).toEqual([
      obl("2", "10-20"),
    ]);
  });

  it("«0» или пусто без минут, «0-3» и мусор — не выдаются, соседи целы", () => {
    const spd = { stat: "spd", value: "2", minutes: "30" };
    expect(parseBoostEffects([{ stat: "oblivion", value: "0", minutes: "" }, spd])).toEqual([spd]);
    expect(parseBoostEffects([{ stat: "oblivion", value: "", minutes: "" }])).toEqual([]);
    expect(parseBoostEffects([{ stat: "oblivion", value: "0-3", minutes: "30" }])).toEqual([]);
    expect(parseBoostEffects([{ stat: "oblivion", value: "0", minutes: "мусор" }])).toEqual([]);
    // Пустой уровень при минутах — тоже ошибка: бесконечно только «0».
    expect(parseBoostEffects([{ stat: "oblivion", value: "", minutes: "30" }])).toEqual([]);
  });
});

describe("броски", () => {
  it("заряды: в диапазоне, от 1, минут 0", () => {
    for (let i = 0; i < 50; i++) {
      const r = rollBoostEffect(obl("1-3"));
      expect(r).toMatchObject({ stat: "oblivion", minutes: 0 });
      expect(r.amount).toBeGreaterThanOrEqual(1);
      expect(r.amount).toBeLessThanOrEqual(3);
    }
  });

  it("«0» с минутами — уровень 0 (без счёта), минуты в диапазоне", () => {
    const r = rollBoostEffect(obl("0", "10-20"));
    expect(r.amount).toBe(0);
    expect(r.minutes).toBeGreaterThanOrEqual(10);
    expect(r.minutes).toBeLessThanOrEqual(20);
  });

  it("N с минутами — и заряды, и минуты", () => {
    expect(rollBoostEffect(obl("2", "30"))).toEqual({ stat: "oblivion", amount: 2, minutes: 30 });
  });

  it("неверная пара мимо разбора не даёт ничего", () => {
    expect(rollBoostEffect(obl("0"))).toEqual({ stat: "oblivion", amount: 0, minutes: 0 });
    expect(rollBoostEffect(obl("", "30"))).toEqual({ stat: "oblivion", amount: 0, minutes: 0 });
  });
});

describe("несколько штук разом — складываются по виду", () => {
  it("заряды без срока: уровни складываются", () => {
    expect(rollBoostQty([obl("1")], 3)).toEqual([{ stat: "oblivion", amount: 3, minutes: 0 }]);
    expect(rollBoostQty([obl("2")], 2)).toEqual([{ stat: "oblivion", amount: 4, minutes: 0 }]);
  });

  it("безлимит: минуты складываются, счёта нет", () => {
    expect(rollBoostQty([obl("0", "30")], 2)).toEqual([
      { stat: "oblivion", amount: 0, minutes: 60 },
    ]);
  });

  it("заряды со сроком: складываются и заряды, и минуты (повтор продлевает)", () => {
    expect(rollBoostQty([obl("2", "30")], 3)).toEqual([
      { stat: "oblivion", amount: 6, minutes: 90 },
    ]);
  });

  it("три вида в одном товаре — три отдельные выдачи", () => {
    const all = rollBoostQty([obl("2"), obl("0", "15"), obl("1", "30")], 1);
    expect(all).toEqual([
      { stat: "oblivion", amount: 2, minutes: 0 },
      { stat: "oblivion", amount: 0, minutes: 15 },
      { stat: "oblivion", amount: 1, minutes: 30 },
    ]);
  });
});

describe("подписи — ru и en", () => {
  it("«Забвение 3 Lv», «Забвение 3 Lv на 30 мин», «Забвение на 30 мин»", () => {
    expect(boostEffectText(obl("3"), "ru")).toBe("Забвение 3 Lv");
    expect(boostEffectText(obl("1-3"), "en")).toBe("Oblivion 1-3 Lv");
    expect(boostEffectText(obl("3", "30"), "ru")).toBe("Забвение 3 Lv на 30 мин");
    expect(boostEffectText(obl("3", "30"), "en")).toBe("Oblivion 3 Lv for 30 min");
    expect(boostEffectText(obl("0", "30"), "ru")).toBe("Забвение на 30 мин");
    expect(boostEffectText(obl("0", "10-20"), "en")).toBe("Oblivion for 10-20 min");
  });

  it("выпавший бросок в тосте: уровень 0 — без счёта, минут 0 — заряды", () => {
    expect(boostRollText({ stat: "oblivion", amount: 2, minutes: 0 }, "ru")).toBe("Забвение 2 Lv");
    expect(boostRollText({ stat: "oblivion", amount: 0, minutes: 45 }, "en")).toBe(
      "Oblivion for 45 min",
    );
    expect(boostRollText({ stat: "oblivion", amount: 3, minutes: 20 }, "ru")).toBe(
      "Забвение 3 Lv на 20 мин",
    );
    expect(oblivionText(0, 0, "ru")).toBe("Забвение");
  });

  it("у каждого ключа есть ru и en", () => {
    const keys = [
      "braid.oblivion",
      "braid.oblivion_lv",
      "braid.oblivion_lv_min",
      "braid.oblivion_min",
    ];
    for (const k of keys) {
      expect(fxDict[k]?.ru, k).toBeTruthy();
      expect(fxDict[k]?.en, k).toBeTruthy();
    }
    for (const [k, v] of Object.entries(oblDict)) {
      expect(v.ru, k).toBeTruthy();
      expect(v.en, k).toBeTruthy();
    }
  });
});

describe("можно ли забывать прямо сейчас", () => {
  const now = Date.parse("2026-09-27T12:00:00Z");
  const at = (min: number) => new Date(now + min * 60_000).toISOString();

  it("вечные заряды — можно", () => {
    expect(oblivionActive({ ...NO_OBLIVION, level: 1 }, now)).toBe(true);
  });

  it("безлимит висит — можно; истёк — «Забыть» пропадает", () => {
    expect(oblivionActive({ ...NO_OBLIVION, until: at(30) }, now)).toBe(true);
    expect(oblivionActive({ ...NO_OBLIVION, until: at(-1) }, now)).toBe(false);
  });

  it("заряды со сроком: живые — можно, истёкшие не в счёт", () => {
    expect(oblivionActive({ ...NO_OBLIVION, timedLevel: 2, timedUntil: at(5) }, now)).toBe(true);
    expect(oblivionActive({ ...NO_OBLIVION, timedLevel: 2, timedUntil: at(-5) }, now)).toBe(false);
  });

  it("ничего нет — нельзя", () => {
    expect(oblivionActive(NO_OBLIVION, now)).toBe(false);
  });

  it("ответ чужой формы из суточного кэша не роняет экран", () => {
    expect(oblivionStateOf(null)).toEqual(NO_OBLIVION);
    expect(oblivionStateOf("x")).toEqual(NO_OBLIVION);
    expect(oblivionStateOf({ level: "3", until: "не дата" })).toEqual({ ...NO_OBLIVION, level: 3 });
    expect(oblivionStateOf({ level: -2 })).toEqual(NO_OBLIVION);
    // Старый ответ сервера без зарядов со сроком — как раньше.
    expect(oblivionStateOf({ level: 1, until: null })).toEqual({ ...NO_OBLIVION, level: 1 });
    // Заряды без срока не бывают: без часа — ноль.
    expect(oblivionStateOf({ timedLevel: 4, timedUntil: null })).toEqual(NO_OBLIVION);
  });
});
