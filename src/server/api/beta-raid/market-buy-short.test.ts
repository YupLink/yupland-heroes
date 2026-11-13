// «Не хватает средств» — а каких? (владелец, 13.11.2026). Отказ оплаты покупки
// называет, чего и сколько не хватает, на обоих языках.
import { describe, expect, it } from "vitest";
import { dict as marketDict } from "@/lib/translations/braid-market";
import { serverErrorText } from "@/lib/serverErrorText";
import type { PriceLine } from "@/lib/marketPrices";
import {
  explainShort,
  missingOf,
  nameOf,
  shortLines,
  shortMessage,
  type ShortDeps,
  type ShortLine,
} from "./market-buy-short";

const LOG = "cst_wtza7b6iq7va";
const ORE = "cst_izilsngrki5v";
const shovel: PriceLine[] = [
  { resource: "custom", token: LOG, amount: 1 },
  { resource: "custom", token: ORE, amount: 1 },
];
const NAMES: Record<string, string> = { [LOG]: "Бревна Дуба", [ORE]: "Горная Руда" };

/** Фальшивое чтение: баланс по ключу вида:шаблон, имена — из таблицы выше. */
const deps = (bal: Record<string, number | null>): ShortDeps => ({
  have: async (l) => bal[`${l.resource}:${l.token ?? ""}`] ?? null,
  itemNames: async (lines) => lines.map((l) => (l.token ? (NAMES[l.token] ?? null) : null)),
});

/** Как тост увидит игрок: тот же разбор ключа, что в useMarketCheckout. */
const toast = (e: unknown, lang: "ru" | "en") =>
  serverErrorText(e, (key: string, p?: Record<string, string | number>) => {
    const text = marketDict[key]?.[lang] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k: string) => String(p?.[k] ?? `{${k}}`));
  });

describe("строки сделки", () => {
  it("цена «в билетах» — золотом ×500; две цены в одном золоте — суммой", () => {
    const lines = shortLines(
      [
        { resource: "gold", token: null, amount: 10 },
        { resource: "tickets", token: null, amount: 1 },
        { resource: "stone", token: null, amount: 0.1 },
      ],
      3,
    );
    expect(lines).toEqual([
      { resource: "gold", token: null, need: 1530 },
      { resource: "stone", token: null, need: 0.3 },
    ]);
  });

  it("нехватка — разница; неизвестное молчит, кроме строки, где сорвалось", () => {
    const lines: ShortLine[] = [
      { resource: "gold", token: null, need: 10 },
      { resource: "art", token: "art_ring", need: 1 },
      { resource: "energy", token: null, need: 5 },
    ];
    expect(missingOf(lines, [4, null, null], 2).map((m) => m.missing)).toEqual([6, 5]);
    // Баланс говорит «хватает», а списание отказало — называем упавшую строку.
    expect(missingOf(lines, [10, null, null], 0)).toEqual([{ line: lines[0], missing: 10 }]);
  });

  it("подписи: шаблон, «любой арт», ресурс словаря, символ токена", () => {
    expect(nameOf({ resource: "custom", token: LOG, need: 1 }, "Бревна Дуба").ru).toBe(
      "Бревна Дуба",
    );
    expect(nameOf({ resource: "stone", token: null, need: 1 }, null)).toEqual({
      ru: "камень",
      en: "stone",
    });
    expect(nameOf({ resource: "art", token: "art_any_rare", need: 1 }, null).en).toBe(
      "any rare artifact",
    );
    expect(nameOf({ resource: "hero", token: "hero_any_epic", need: 1 }, null).ru).toBe(
      "любой эпический герой",
    );
    expect(nameOf({ resource: "token", token: "USDT", need: 1 }, null)).toEqual({
      ru: "USDT",
      en: "USDT",
    });
  });

  it("дробь по-русски — запятой", () => {
    const msg = shortMessage([{ name: { ru: "камень", en: "stone" }, missing: 0.5 }]);
    expect(msg).toBe('market.short|{"ru":"камень 0,5","en":"stone 0.5"}');
  });
});

describe("отказ оплаты словами", () => {
  it("лопата без бревна и руды: «Не хватает: Бревна Дуба 1, Горная Руда 1»", async () => {
    const e = await explainShort(
      new Error("market.not_enough"),
      { lines: shovel, qty: 1, failed: 0 },
      deps({ [`custom:${LOG}`]: 0, [`custom:${ORE}`]: 0 }),
    );
    expect(toast(e, "ru")).toBe("Не хватает: Бревна Дуба 1, Горная Руда 1");
    expect(toast(e, "en")).toBe("Not enough: Бревна Дуба 1, Горная Руда 1");
  });

  it("две лопаты, бревно одно, руды хватает — только бревно, ровно 1", async () => {
    const e = await explainShort(
      new Error("market.not_enough"),
      { lines: shovel, qty: 2, failed: 0 },
      deps({ [`custom:${LOG}`]: 1, [`custom:${ORE}`]: 5 }),
    );
    expect(toast(e, "ru")).toBe("Не хватает: Бревна Дуба 1");
  });

  it("другой отказ — как был; сбой чтения — исходный «не хватает»", async () => {
    const other = new Error("market.need_hero");
    expect(await explainShort(other, { lines: shovel, qty: 1, failed: 0 }, deps({}))).toBe(other);
    const broken: ShortDeps = {
      have: async () => null,
      itemNames: async () => {
        throw new Error("db down");
      },
    };
    const e = await explainShort(
      new Error("market.not_enough"),
      { lines: shovel, qty: 1, failed: 1 },
      broken,
    );
    // Имени нет — родовое слово словаря, но строка всё равно названа.
    expect(toast(e, "ru")).toBe("Не хватает: товар 1");
  });
});
