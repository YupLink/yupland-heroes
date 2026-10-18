// Пять шаблонов «из коробки»: чтобы список не открывался пустым.
//
// Владелец, 25.09.2026: «нужно, чтобы ты рандомно делал подборки, и чтобы
// предустановки расставлялись автоматически и работали как следует». Прежние
// четыре шаблона были трафаретами — кольцо, крест, кварталы, россыпь — с
// застывшим составом. Теперь каждый готовый шаблон — органический рост
// (docs/town-generation-algorithm.json) с автоподбором от сида: состав тянется
// жребием по канону разблокировки служб, облики — по теме, форма поселения
// выводится из числа построек, въездов и воды. Шаблон задаёт только МАСШТАБ —
// сколько построек, — всё остальное решает место и сид.
//
// Кольцо, крест и кварталы остались планировками рецепта (их можно выбрать
// руками), но в готовые шаблоны не попадают: трафарет — не город.
//
// В базе готовых нет намеренно: запасной ручной состав (на случай «автоподбор
// выкл.») считается из ЖИВОГО справочника при каждом открытии списка.
import { composeSettlement } from "./settlement-compose";
import {
  PRESET_SHAPE,
  type BuildingOption,
  type SettlementPreset,
  type TownKind,
} from "./settlement-types";
import { PRESET_BLUEPRINT_PREFIX, type TownBlueprint } from "./blueprint-types";

type Spec = {
  slug: string;
  /** Запасное имя: панель переводит по id (presetNameKey), это — фолбэк. */
  name: string;
  note: string;
  /** Рамка размера и запасной ручной состав — от ближайшего пресета. */
  preset: SettlementPreset;
  /**
   * Сколько построек. Числа — по порогам формы из спецификации (шаг 3):
   * N ≤ 6 — лагерь, N ≤ 8 без центральных служб — хутор, 12 — деревня без
   * ратуши (уличная, круглая или луговая — по въездам), N > 20 — городок с
   * площадью, порт — N ≥ 12 при воде (18: верфь, склад и рынок порта плюс дома).
   */
  buildings: number;
  /**
   * Заказ состава. Без него «Порт» в зоне с рекой у края вырастал городком в
   * середине, «Хутор» — деревней с таверной, «Лагерь» — без найма: канон
   * служб начинается с таверны, а форму решает состав (шаг 3).
   */
  kind: TownKind;
};

const SPECS: readonly Spec[] = [
  {
    slug: "town-organic",
    kind: "town",
    name: "Живой городок",
    note: "Ратуша на площади, улицы от въездов, службы по соседству, дома к краю.",
    preset: "town",
    buildings: 24,
  },
  {
    slug: "village-organic",
    kind: "village",
    name: "Живая деревня",
    note: "Форму выбирает место: уличная, круглая или луговая — по въездам и воде.",
    preset: "village",
    buildings: 12,
  },
  {
    slug: "port",
    kind: "port",
    name: "Порт",
    note: "Площадь у причала, склады и верфь на берегу, ремёсла — подальше от воды.",
    preset: "port",
    buildings: 18,
  },
  {
    slug: "hamlet",
    kind: "hamlet",
    name: "Хутор",
    note: "Несколько дворов на отростке дороги, без площади и служб.",
    preset: "village",
    buildings: 7,
  },
  {
    slug: "camp",
    kind: "camp",
    name: "Лагерь",
    note: "Тесный круг у костра, один въезд, найм у края.",
    preset: "camp",
    buildings: 5,
  },
];

/**
 * Шаблоны из справочника. Дорога не выбрана (`roadId: null`): дороги на картах
 * разные, и подставлять первую попавшуюся — значит проложить в адском городе
 * брусчатку. Тема пустая — жребий от сида среди хорошо покрытых обликами:
 * «рандомная подборка» и есть то, о чём просил владелец.
 */
export function presetBlueprints(options: BuildingOption[]): TownBlueprint[] {
  return SPECS.map((spec) => {
    const shape = PRESET_SHAPE[spec.preset];
    return {
      id: `${PRESET_BLUEPRINT_PREFIX}${spec.slug}`,
      name: spec.name,
      note: spec.note,
      updatedAt: null,
      layout: "organic",
      auto: true,
      buildings: spec.buildings,
      kind: spec.kind,
      theme: "",
      size: shape.size,
      density: shape.density,
      // Запасной состав: при «автоподбор выкл.» админ начинает не с пустого.
      slots: composeSettlement(spec.preset, options),
      roadId: null,
      built: true,
    };
  });
}
