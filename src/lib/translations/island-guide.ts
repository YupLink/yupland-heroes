import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Проходка острова: главы, шаги боя, замка и развития, подсказки у
// подсвеченных кнопок (владелец, 15.10.2026: «провести полностью — он должен
// всё видеть и понимать»; «герой не бьётся — бьются фишки, герой усиливает»).
// Кнопки названы ровно так, как подписаны в игре.
export const dict: Record<string, Entry> = {
  "island.ch.map": { ru: "Карта", en: "Map" },
  "island.ch.battle": { ru: "Бой", en: "Battle" },
  "island.ch.tools": { ru: "Инструменты", en: "Tools" },
  "island.ch.castle": { ru: "Замок", en: "Castle" },
  "island.ch.grow": { ru: "Развитие", en: "Growth" },
  "island.ch.exit": { ru: "Выход", en: "Exit" },
  "island.got_it": { ru: "Понятно", en: "Got it" },
  "island.next": { ru: "Дальше", en: "Next" },
  "island.ok": { ru: "Ок", en: "OK" },

  "island.x_energy.title": { ru: "Энергия", en: "Energy" },
  "island.x_energy.text": {
    ru: "Энергия — твои шаги и бои. Её 100, сама копится по 1 за 10 минут; «+» — купить ещё.",
    en: "Energy is your steps and fights. You have 100, it refills by 1 every 10 minutes; «+» buys more.",
  },
  "island.x_warriors.title": { ru: "Бьются фишки", en: "Chips fight" },
  "island.x_warriors.text": {
    ru: "В бою бьются только фишки — до 10 в отряде. Герой не бьётся: он усиливает весь отряд. Нажми на слизня → «В бой» — покажу отряд.",
    en: "Only chips fight — up to 10 in a squad. The hero doesn't fight: he boosts the whole squad. Tap the slime → «Fight» — I'll show the squad.",
  },
  "island.x_warriors.spot": {
    ru: "Это твой отряд. «Авто» возьмёт сильнейшие фишки, «Выбрать фишки» — по-своему.",
    en: "This is your squad. «Auto» takes the strongest chips, «Pick chips» lets you choose.",
  },
  "island.x_satiety.title": { ru: "Сытость", en: "Satiety" },
  "island.x_satiety.text": {
    ru: "Кольцо у героя — сытость. Шаг и бой её тратят; опустеет — отряд слабеет вдвое. Еда — в лавке, «Съесть» — в рюкзаке.",
    en: "The ring around the hero is satiety. Steps and fights spend it; empty — the squad is twice weaker. Food is in shops, «Eat» is in the backpack.",
  },
  "island.harvest.title": { ru: "Добыча", en: "Harvest" },
  "island.harvest.text": {
    ru: "Шахта копит дерево каждый час. Забирай в «Добыче» — там же награды с боссов.",
    en: "The mine gathers wood every hour. Collect it in «Harvest» — boss rewards are there too.",
  },

  "island.x_castle.title": { ru: "Войди в замок", en: "Enter the castle" },
  "island.x_castle.text": {
    ru: "Подойди к ратуше и нажми на неё → «Войти в замок». Покажу, что где.",
    en: "Walk to the town hall and tap it → «Enter castle». I'll show you around.",
  },
  "island.chips.title": { ru: "Твои фишки", en: "Your chips" },
  "island.chips.text": {
    ru: "В «Тренировочном лагере» — твой отряд. Звёзды — сила фишки. Тренировочные бьют вполсилы и не улучшаются; фишки из паков улучшают здесь же.",
    en: "The «Training camp» holds your squad. Stars are a chip's power. Training chips hit at half strength and can't be upgraded; chips from packs are upgraded right here.",
  },
  "island.hero.title": { ru: "Твой герой", en: "Your hero" },
  "island.hero.text": {
    ru: "В «Таверне» — твой герой. Он не бьётся: его атака и здоровье усиливают весь отряд. Уровень героя растёт за лайки.",
    en: "Your hero is in the «Tavern». He doesn't fight: his attack and health boost the whole squad. The hero's level grows with likes.",
  },
  "island.x_artifact.title": { ru: "Найди артефакт", en: "Find an artifact" },
  "island.x_artifact.text": {
    ru: "Один из боссов несёт артефакт. «Показать» — к нему. Победи, награда придёт в «Добычу».",
    en: "One of the bosses carries an artifact. «Show» leads to it. Win, and the reward goes to «Harvest».",
  },
  "island.art_take.title": { ru: "Забери артефакт", en: "Collect the artifact" },
  "island.art_take.text": {
    ru: "Награды за боссов ждут в «Добыче»: меню справа → «Добыча» → «Забрать».",
    en: "Boss rewards wait in «Harvest»: the right menu → «Harvest» → «Claim».",
  },
  "island.equip.title": { ru: "Надень артефакт", en: "Equip the artifact" },
  "island.equip.text": {
    ru: "Артефакт надевают на героя. Ратуша → «Войти в замок» → «Таверна» → герой → «Экипировка» → «Надеть лучшее».",
    en: "Artifacts are worn by the hero. Town hall → «Enter castle» → «Tavern» → hero → «Equipment» → «Equip best».",
  },
  "island.pack_boss.title": { ru: "Найди пак", en: "Find a pack" },
  "island.pack_boss.text": {
    ru: "Другой босс стережёт тренировочный пак. «Показать» — к нему. Победи, пак придёт в «Добычу».",
    en: "Another boss guards a training pack. «Show» leads to it. Win, and the pack goes to «Harvest».",
  },
  "island.pack_got.title": { ru: "Забери пак", en: "Collect the pack" },
  "island.pack_got.text": {
    ru: "Награды за боссов ждут в «Добыче»: меню справа → «Добыча» → «Забрать».",
    en: "Boss rewards wait in «Harvest»: the right menu → «Harvest» → «Claim».",
  },
  "island.x_pack.title": { ru: "Открой пак", en: "Open the pack" },
  "island.x_pack.text": {
    ru: "Ратуша → «Войти в замок» → «Тренировочный лагерь» → «Паки» → пак → «Открыть 1». Внутри — фишки.",
    en: "Town hall → «Enter castle» → «Training camp» → «Packs» → the pack → «Open 1». Chips are inside.",
  },
  "island.hero_chip.title": { ru: "Герой из фишки", en: "A hero from a chip" },
  "island.hero_chip.text": {
    ru: "Обычную фишку от 3★ можно превратить в героя: «Тренировочный лагерь» → фишка → «Сделать героем» за 50 лайков. Тренировочные — нельзя.",
    en: "A regular chip of 3★+ can become a hero: «Training camp» → the chip → «Make a hero» for 50 likes. Training chips can't.",
  },

  "island.grow_tree.title": { ru: "Древо знания", en: "Tree of knowledge" },
  "island.grow_tree.text": {
    ru: "В основном мире растут «Древа знания»: +1 уровень герою за 30 энергии. Самый быстрый рост.",
    en: "Trees of knowledge grow in the main world: +1 hero level for 30 energy. The fastest way to grow.",
  },
  "island.grow_temple.title": { ru: "Храм", en: "Temple" },
  "island.grow_temple.text": {
    ru: "Раз в 6 часов молись в «Храме» замка — бесплатно станешь сильнее на 10 минут. Лучше прямо перед боем.",
    en: "Pray in the castle «Temple» every 6 hours — you get stronger for 10 minutes for free. Best right before a fight.",
  },
  "island.grow_shop.title": { ru: "Лавка", en: "Shop" },
  "island.grow_shop.text": {
    ru: "Добытое продавай в лавке у ратуши. На золото — еда, улучшение Храма и склада.",
    en: "Sell what you gather in the shop by the town hall. Gold buys food and upgrades the Temple and the warehouse.",
  },
  "island.grow_bosses.title": { ru: "Боссы мира", en: "World bosses" },
  "island.grow_bosses.text": {
    ru: "В мире бей боссов рядом с замком: награду делят по нанесённому урону, забирай её в «Добыче». Лайки с боссов — на уровни героя.",
    en: "In the world, fight bosses near the castle: rewards are split by damage dealt, collect them in «Harvest». Likes from bosses level up the hero.",
  },

  // Подсказки у подсвеченных кнопок на пути к цели шага.
  "island.hop.enter": { ru: "Войди в замок", en: "Enter the castle" },
  "island.hop.harvest": { ru: "Открой «Добычу»", en: "Open «Harvest»" },
  "island.hop.claim_all": {
    ru: "Забери — награда станет твоей",
    en: "Claim it — the reward becomes yours",
  },
  "island.hop.menu": { ru: "Открой меню", en: "Open the menu" },
  "island.hop.training": { ru: "Открой «Тренировочный лагерь»", en: "Open the «Training camp»" },
  "island.hop.tavern": { ru: "Открой «Таверну»", en: "Open the «Tavern»" },
  "island.hop.open_hero": { ru: "Открой своего героя", en: "Open your hero" },
  "island.hop.gear_tab": { ru: "Вкладка «Экипировка»", en: "The «Equipment» tab" },
  "island.hop.best_gear": {
    ru: "«Надеть лучшее» — артефакт наденется",
    en: "«Equip best» — the artifact goes on",
  },
  "island.hop.packs": { ru: "Открой «Паки»", en: "Open «Packs»" },
  "island.hop.pack": { ru: "Нажми на пак", en: "Tap the pack" },
  "island.hop.open_pack": { ru: "«Открыть 1» — внутри фишки", en: "«Open 1» — chips inside" },
};
