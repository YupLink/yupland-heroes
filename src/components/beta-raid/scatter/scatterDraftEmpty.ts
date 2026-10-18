// Стартовый черновик автораздачи. Вынесено из scatterDraft.ts ради лимита
// ≤250 строк; снаружи по-прежнему берётся оттуда.
import type { PileDraft, ScatterDraft } from "./scatterDraft";

/**
 * Стартовый черновик — ВСЁ выключено.
 *
 * Раздача снимает объекты с карты и обещает деньги; открытая панель не должна
 * быть в одном тапе от массового действия. Уровни боссов по умолчанию нижние:
 * случайный запуск насыплет мелочь, а не сотые уровни.
 */
export function emptyScatterDraft(): ScatterDraft {
  const pile = (): PileDraft => ({
    enabled: false,
    removeKilled: true,
    count: "",
    point: "",
    funds: [],
    templateIds: [],
    lands: [],
  });
  return {
    seed: "",
    boss: {
      enabled: false,
      removeKilled: true,
      count: "",
      levelMin: "1",
      levelMax: "10",
      terrainLevel: "",
      funds: [],
      packs: [],
      arts: [],
      lands: [],
    },
    loot: pile(),
    artifacts: {
      enabled: false,
      removeKilled: true,
      count: "",
      rarities: [],
      templateIds: [],
      lands: [],
    },
  };
}
