// Форма поселения: вывод из ограничений и явный заказ админа.
//
// Владелец, 25.09.2026: заказал «городок» у реки — вышел «порт» на 8 домов.
// Заказ обязан побеждать вывод; «по месту» — форма выводится по таблице.
import { describe, expect, it } from "vitest";
import { decideForm, type FormFacts } from "@/lib/raid/zonegen/town/form";

const facts = (over: Partial<FormFacts> = {}): FormFacts => ({
  blockedShare: 0,
  nonConvex: false,
  elongated: false,
  water: false,
  n: 12,
  comp: {
    hall: false,
    temple: false,
    tavern: true,
    market: true,
    warehouse: true,
    shipyard: false,
    barracks: false,
    houses: true,
  },
  entries: 2,
  opposite: false,
  through: false,
  roundFits: true,
  greenFits: true,
  ...over,
});

describe("decideForm — заказ побеждает вывод", () => {
  it("«по месту» у воды со складом при N ≥ 12 — порт (таблица форм)", () => {
    expect(decideForm(facts({ water: true }))).toBe("port");
  });

  it("«городок» у воды остаётся городком, а не портом", () => {
    expect(decideForm(facts({ water: true, kind: "town" }))).toBe("town");
  });

  it("«порт» без воды у места — городок (причалить некуда)", () => {
    expect(decideForm(facts({ water: false, kind: "port" }))).toBe("town");
    expect(decideForm(facts({ water: true, kind: "port" }))).toBe("port");
  });

  it("«деревня» никогда не становится городком или портом", () => {
    const big = facts({ water: true, n: 30, kind: "village", through: true });
    expect(decideForm(big)).toBe("street");
    const plain = facts({ water: true, n: 30, kind: "village", entries: 3 });
    expect(["street", "round", "green", "cluster"]).toContain(decideForm(plain));
  });

  it("«хутор» и «лагерь» — как заказано, при любом числе", () => {
    expect(decideForm(facts({ n: 20, kind: "hamlet" }))).toBe("hamlet");
    expect(decideForm(facts({ n: 20, kind: "camp" }))).toBe("camp");
  });

  it("«по месту» с ратушей вне уличной формы — городок, как раньше", () => {
    const comp = { ...facts().comp, hall: true };
    expect(decideForm(facts({ comp, n: 14, entries: 3 }))).toBe("town");
  });
});
