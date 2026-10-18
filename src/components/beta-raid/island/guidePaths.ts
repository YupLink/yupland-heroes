// Как вести игрока по интерфейсу на шаге проходки острова: цепочка кнопок от
// внешней к внутренней («Войти в замок» → постройка → нужная кнопка). На
// экране подсвечивается самая глубокая из видимых: игрок идёт по подсветке,
// не читая длинных инструкций (владелец, 15.10.2026: «подсказки и подсветки —
// очень важно»). Последнее звено — объяснение шага; у шагов «Понятно» его
// кнопка засчитывает шаг.
import type { IslandStepId } from "@/lib/raid/island/steps";

export type GuideHop = {
  /** CSS-селектор кнопки; первый видимый из списка через запятую. */
  sel: string;
  /** Ключ перевода подсказки рядом с кольцом. */
  tip: string;
};

const ENTER: GuideHop = { sel: "[data-enter-castle]", tip: "island.hop.enter" };
const building = (id: string, tip = `island.hop.${id}`): GuideHop => ({
  sel: `[data-modular-building="${id}"]`,
  tip,
});
/** Из «Тренировочного лагеря» в таверну — ссылкой внизу, без возврата в замок. */
const CAMP_TO_TAVERN: GuideHop = { sel: ".barracks-tavern", tip: "island.hop.tavern" };

const MENU: GuideHop = {
  sel: ".raid-right-menu__toggle[aria-expanded='false']",
  tip: "island.hop.menu",
};

/** Забрать награду босса: меню → «Добыча» → «Забрать все награды». */
const TAKE: readonly GuideHop[] = [
  MENU,
  { sel: "[data-hud='harvest']", tip: "island.hop.harvest" },
  { sel: "[data-claim-all]:enabled", tip: "island.hop.claim_all" },
];

export const GUIDE_PATHS: Partial<Record<IslandStepId, readonly GuideHop[]>> = {
  x_energy: [{ sel: ".raid-hero-group__energy", tip: "island.x_energy.text" }],
  x_warriors: [{ sel: "[data-squad-picker]", tip: "island.x_warriors.spot" }],
  x_satiety: [
    { sel: ".satiety-bar--ring, .raid-hero-group__portrait-button", tip: "island.x_satiety.text" },
  ],
  harvest: [MENU, { sel: "[data-hud='harvest']", tip: "island.harvest.text" }],
  art_take: TAKE,
  pack_got: TAKE,
  // Сам тур по замку засчитывает шаг; здесь только довести до входа.
  x_castle: [ENTER],
  chips: [ENTER, building("training"), { sel: ".barracks-chip", tip: "island.chips.text" }],
  hero: [
    ENTER,
    building("tavern"),
    CAMP_TO_TAVERN,
    { sel: "[data-tavern-hero-card][data-active-hero]", tip: "island.hero.text" },
  ],
  equip: [
    ENTER,
    building("tavern"),
    CAMP_TO_TAVERN,
    { sel: "[data-tavern-hero-card][data-active-hero]", tip: "island.hop.open_hero" },
    { sel: "[data-hero-main-tabs] [role='tab']:first-child", tip: "island.hop.gear_tab" },
    { sel: "[data-best-gear]", tip: "island.hop.best_gear" },
  ],
  x_pack: [
    ENTER,
    building("training"),
    { sel: ".barracks-pack-entry", tip: "island.hop.packs" },
    { sel: ".pack-shelf-trigger", tip: "island.hop.pack" },
    { sel: ".pack-detail-primary", tip: "island.hop.open_pack" },
  ],
  hero_chip: [ENTER, building("training"), { sel: ".barracks-chip", tip: "island.hero_chip.text" }],
  grow_temple: [ENTER, building("temple", "island.grow_temple.text")],
};
