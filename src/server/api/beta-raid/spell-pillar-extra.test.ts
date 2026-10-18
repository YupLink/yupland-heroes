// «Цена забвения» столба снова читается из настройки клетки (а нет своей — из
// шаблона) и доезжает до окна постройки: окно рисует «забвение: …», а кнопка
// «Забыть» у столба есть, только когда цена задана.
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => null,
  requireAdjacent: () => {},
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./building-action", () => ({ loadCellBuilding: async () => null }));
vi.mock("./spell-book", () => ({ learnedSpellIds: async () => [], spellHero: async () => null }));

import { spellPillarConfig } from "./spell-pillar";
import { spellPillarExtra } from "./spell-pillar-extra";

const gold = (amount: number) => ({ resource: "gold", amount });
const cell = (forgetPrices: unknown) => ({
  spellbook: { learnPrices: [gold(50)], forgetPrices, spells: ["sp_1"] },
});

describe("столб: цена забвения", () => {
  it("своя настройка клетки: цена забвения читается, нули отброшены", () => {
    const cfg = spellPillarConfig(cell([gold(20), gold(0)]), null);
    expect(cfg?.forgetPrices).toEqual([
      { resource: "gold", token: null, itemKey: null, itemName: null, amount: 20 },
    ]);
  });

  it("своей нет — цена шаблона; нигде нет — пустой список, а не поле-пропуск", () => {
    expect(spellPillarConfig(null, cell([gold(7)]))?.forgetPrices).toHaveLength(1);
    expect(spellPillarConfig(cell(undefined), null)?.forgetPrices).toEqual([]);
  });

  it("окно постройки получает цену забвения — всегда массивом", () => {
    const extra = spellPillarExtra({ built: true, cellConfig: cell([gold(20)]) });
    expect(extra).toMatchObject({ kind: "spellbook", can: true });
    expect(extra && "forgetPrices" in extra ? extra.forgetPrices : null).toHaveLength(1);
    const bare = spellPillarExtra({ built: true, cellConfig: {} });
    expect(bare && "forgetPrices" in bare ? bare.forgetPrices : null).toEqual([]);
  });
});
