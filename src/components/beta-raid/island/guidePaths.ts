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
const PROFILE: readonly GuideHop[] = [
  { sel: ".raid-hero-group__portrait-button", tip: "island.hop.open_hero" },
  { sel: ".raid-hero-dialog__actions button", tip: "island.hop.profile" },
  { sel: ".castle-profile__packs-button", tip: "island.hop.packs" },
];
const building = (id: string, tip = `island.hop.${id}`): GuideHop => ({
  sel: `[data-modular-building="${id}"]`,
  tip,
});
/** Шаг на карте, а игрок в замке — кольцо на «Выход в мир» (владелец, 13.11.2026). */
export const RETURN_GATES: GuideHop = building("gates", "island.hop.return_island");
/** Путь шага ведёт по замку (вход, постройки, лагерь) — выход ему не подсказываем. */
export const castlePath = (path: readonly GuideHop[]) =>
  path.some((h) => /data-modular-building|data-enter-castle|barracks|castle-/.test(h.sel));
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

export type GuideStepId = IslandStepId | "backpack" | "wood_backpack" | "short_chest" | "short_axe" | "chest_collect";

export const GUIDE_PATHS: Partial<Record<GuideStepId, readonly GuideHop[]>> = {
  backpack: [
    { sel: ".raid-lower-actions__toggle[aria-expanded='false']", tip: "island.hop.open_actions" },
    { sel: ".raid-quick-access--backpack", tip: "island.hop.backpack" },
  ],
  wood_backpack: [
    { sel: ".raid-lower-actions__toggle[aria-expanded='false']", tip: "island.hop.open_actions" },
    { sel: ".raid-quick-access--backpack", tip: "island.hop.backpack" },
    { sel: ".hero-items-unified > .hero-items-section:last-of-type > header", tip: "island.hop.wood_backpack" },
  ],
  short_chest: [
    building("gates", "island.hop.return_island"),
    { sel: "section[aria-labelledby='castle-window-title'] > header > button", tip: "island.hop.back_to_castle" },
    { sel: "[data-tavern-detail-close]", tip: "island.hop.back_to_castle" },
  ],
  chest_collect: TAKE,
  chest_backpack: [
    { sel: "[data-harvest-modal] [data-close-button]", tip: "island.hop.close_harvest" },
    { sel: ".raid-lower-actions__toggle[aria-expanded='false']", tip: "island.hop.open_actions" },
    { sel: ".raid-quick-access--backpack", tip: "island.hop.backpack" },
    { sel: "[data-backpack-header]", tip: "island.chest_backpack.text" },
    { sel: "[data-backpack-header] ~ .hero-items-more", tip: "island.hop.expand_backpack" },
    { sel: "[data-stack-key='custom:cst_0chsk0wpqt2b']", tip: "island.hop.chest_ingot" },
  ],
  boat: [{ sel: "[data-harvest-modal] [data-close-button]", tip: "island.hop.close_harvest" }, { sel: "[data-build-small-ship]:enabled", tip: "island.boat.text" }],
  spell: [
    { sel: "[data-spell-pillar-open]:enabled", tip: "island.hop.spell_pillar" },
    { sel: "[data-spell-pillar-learn]:enabled", tip: "island.hop.spell_learn" },
  ],
  sell: [
    { sel: "[data-market-mode='sell']", tip: "island.hop.sell_tab" },
    { sel: "[data-market-side='sell'][data-market-ref='cst_0chsk0wpqt2b']", tip: "island.hop.sell_ingot" },
    { sel: ".raid-market-checkout:enabled", tip: "island.hop.sell_confirm" },
  ],
  // После просмотра фишек в лагере вернуть игрока на его остров за топором.
  axe: [building("gates", "island.hop.return_island")],
  short_axe: [building("gates", "island.hop.return_island"),
    { sel: "[data-market-mode='buy']", tip: "island.hop.buy_tab" },
    { sel: "[data-market-side='buy'][data-market-ref='cst_frxf3xh6mq6g']", tip: "island.hop.buy_axe" },
    { sel: ".raid-market-checkout:enabled", tip: "island.hop.buy_confirm" },
  ],
  hero_level: [
    ENTER, building("tavern"), CAMP_TO_TAVERN,
    { sel: "[data-tavern-hero-card][data-active-hero]", tip: "island.hop.open_hero" },
    { sel: "[data-hero-level-up] button", tip: "island.hero_level.text" },
  ],
  hero_sets: [
    ENTER, building("tavern"), CAMP_TO_TAVERN,
    { sel: "[data-tavern-hero-card][data-active-hero]", tip: "island.hop.open_hero" },
    { sel: "[data-hero-main-tabs] [role='tab']:first-child", tip: "island.hop.gear_tab" },
    { sel: "[data-save-gear-set]", tip: "island.hero_sets.text" },
  ],
  return_island: [building("gates", "island.hop.return_island")],
  achievements: [
    { sel: ".island-quest__tab:first-child", tip: "island.achievements.text" },
  ],
  x_energy: [{ sel: ".raid-hero-group__energy", tip: "island.x_energy.text" }],
  x_warriors: [{ sel: "[data-squad-picker]", tip: "island.x_warriors.spot" }],
  x_satiety: [
    { sel: ".satiety-bar--ring, .raid-hero-group__portrait-button", tip: "island.x_satiety.text" },
  ],
  harvest: [MENU, { sel: "[data-hud='harvest']", tip: "island.harvest.text" }],
  slime_loot: TAKE,
  art_take: TAKE,
  pack_got: TAKE,
  // Сам тур по замку засчитывает шаг; здесь только довести до входа.
  x_castle: [ENTER],
  chips: [...PROFILE, { sel: ".barracks-go-chips", tip: "island.hop.chips" }, { sel: ".barracks-chip", tip: "island.chips.text" }],
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
    ...PROFILE,
    { sel: ".pack-shelf-trigger", tip: "island.hop.pack" },
    { sel: ".pack-detail-primary", tip: "island.hop.open_pack" },
  ],
  hero_chip: [ENTER, building("training"), { sel: ".barracks-chip", tip: "island.hero_chip.text" }],
  grow_temple: [ENTER, building("temple", "island.grow_temple.text")],
};
