// «Что нового» за октябрь 2026 — вынесено из updates.ts (лимит 250 строк на файл),
// склеивается там в NEWS_UPDATES.
import type { NewsUpdateEntry } from "./updates";
import type { NewsHeadline } from "./updates";

type Pair = { ru: string; en: string };
const H = (title: Pair, lead: Pair, images?: string[]): NewsHeadline => ({ title, lead, images });

export const NEWS_UPDATES_2026_10: NewsUpdateEntry[] = [
  {
    date: "2026-10-31",
    headline: H(
      { ru: "Лопатой — за кладом", en: "Dig for treasure" },
      {
        ru: "Каждый копок — шанс на мешочек с находкой: от старого ботинка до большого клада.",
        en: "Every dig is a chance at a bag with a find, from an old boot to a big hoard.",
      },
      ["/uploads/tasks/uOMff_xZau.webp", "/uploads/tasks/XBFL2mE0LR.webp"],
    ),
    ru: [
      "Лопатой можно найти клад: находка остаётся мешочком в ямке, открой его — и узнаешь, что выкопал.",
      "Ямку копать снова нельзя — её можно закопать, получится кучка.",
    ],
    en: [
      "Your shovel can find treasure: the find stays in the hole as a bag — open it to see what you dug up.",
      "You can't dig a hole again — fill it in and it becomes a mound.",
    ],
  },
  {
    date: "2026-10-29",
    headline: H(
      { ru: "Рубить руками можно и с топором", en: "Chop by hand, even with an axe" },
      {
        ru: "Топор в рюкзаке не тратится, энергии уходит вдвое больше.",
        en: "The axe in your backpack stays intact; it costs twice the energy.",
      },
      ["/uploads/tasks/Wz6GXboRcc.webp", "/hero-actions/knight/hand/right-down.png@1"],
    ),
    ru: [
      "Рубить руками можно и с топором в рюкзаке: топор цел, энергии уходит вдвое больше.",
      "Большой лес под ударом больше не сжимается до одной клетки.",
      "Промокоды на что угодно: вводятся в профиле, награда сразу попадает куда надо.",
      "Управление шахтами: починенная шахта остаётся на своём месте в списке.",
      "Рыбалка: у всех семи героев свои сцены ожидания клёва.",
    ],
    en: [
      "You can chop by hand even with an axe in your backpack: the axe stays intact, energy cost doubles.",
      "Big forests no longer shrink to a single cell while you strike them.",
      "Promo codes for anything: enter them in your profile, rewards go straight where they belong.",
      "Mine management: a repaired mine keeps its place in the list.",
      "Fishing: all seven heroes got their own waiting scenes.",
    ],
  },
  {
    date: "2026-10-28",
    headline: H(
      { ru: "Погода меняется плавно", en: "Weather now changes smoothly" },
      {
        ru: "В замке появилась Метеостанция, шаманы проводят там обряд погоды.",
        en: "Castles got a Weather Station where shamans hold a weather ritual.",
      },
      ["/weather-station/scenes/cool/storm.webp"],
    ),
    ru: [
      "Погода меняется плавно, а в замке появилась Метеостанция.",
      "Гриб можно съесть за 50 энергии — награда сразу.",
      "Синий динамит взрывает корабли: экипаж отправляется в город.",
      "В ячейке рюкзака теперь 30 штук вместо 20; Bonus Box открывается пачкой до 50.",
      "Обновления приходят без перезагрузки игры; добавились звуки шагов, топора, кирки и удочки.",
    ],
    en: [
      "Weather now shifts smoothly, and castles got a Weather Station.",
      "Mushrooms can be eaten for 50 energy — the reward is instant.",
      "Blue dynamite blows up ships: the crew is sent to town.",
      "A backpack slot now holds 30 items instead of 20; Bonus Boxes open in batches of up to 50.",
      "Updates arrive without reloading the game; footstep, axe, pickaxe and fishing sounds were added.",
    ],
  },
  {
    date: "2026-10-27",
    headline: H(
      { ru: "Новичкам — урок про рюкзак", en: "A backpack lesson for newcomers" },
      {
        ru: "Остров новичка подсказывает дорогу к ближайшей цели.",
        en: "The newbie island now points to the nearest goal.",
      },
    ),
    ru: [
      "Остров новичка: урок про рюкзак и подсказки к ближайшей цели.",
      "В рейде появилась панель погоды: значок и температура.",
      "Ратуша показывает точную цену постройки у Архитектора.",
    ],
    en: [
      "Newbie island: a backpack lesson and hints to the nearest goal.",
      "The raid got a weather panel: icon and temperature.",
      "The Town Hall shows the exact Architect build price.",
    ],
  },
  {
    date: "2026-10-26",
    headline: H(
      { ru: "У героев появились кони", en: "Heroes got mounts" },
      {
        ru: "Темп хода зависит от коня, пегас умеет прыгать.",
        en: "Pace depends on the horse; the pegasus can jump.",
      },
    ),
    ru: [
      "Кони героя: темп хода зависит от коня, пегас умеет прыгать.",
      "Погода рейда общая на весь мир и меняется раз в 3 часа.",
      "Мир строителей открыт всем: земля из лавки кладётся прямо в пустоту.",
      "Золотые шахты дают 5 / 10 / 25 / 50 золота в час по уровням.",
      "Замок: одна расстановка на всех устройствах, вход — у ратуши любого мира.",
    ],
    en: [
      "Hero mounts: movement pace depends on the horse, and the pegasus can jump.",
      "Raid weather is shared across the world and changes every 3 hours.",
      "The Builders' World is open to everyone: land from the shop goes straight into the void.",
      "Gold mines yield 5 / 10 / 25 / 50 gold per hour by level.",
      "Castle: one layout across all your devices, entry from any world's Town Hall.",
    ],
  },
  {
    date: "2026-10-25",
    headline: H(
      { ru: "Энергии теперь до 200", en: "Energy cap is now 200" },
      {
        ru: "+5 каждые 5 минут, а маршрут показывает, докуда её хватит.",
        en: "+5 every 5 minutes, and routes show how far it reaches.",
      },
      ["/uploads/tasks/sFI3LpyENT.png"],
    ),
    ru: [
      "Энергия: максимум 200, +5 каждые 5 минут.",
      "Маршрут показывает, докуда хватит энергии: зелёные и красные стрелки.",
      "Подписки: новые тарифы и «Ультра +», где энергия не тает.",
      "В лавке — «Камень для установки»: своя гора под кирку.",
      "Здание «Управление шахтами» — в Ратуше; ломбард берёт несколько артефактов разом.",
    ],
    en: [
      "Energy: max 200, +5 every 5 minutes.",
      "Routes show how far your energy reaches: green and red arrows.",
      "Subscriptions: new plans and “Ultra +”, where energy doesn't melt.",
      "The shop sells a “Placement stone”: your own rock for the pickaxe.",
      "The “Mine Management” building is in the Town Hall; the pawnshop takes several artifacts at once.",
    ],
  },
  {
    date: "2026-10-24",
    headline: H(
      { ru: "Бой без выбора фишек", en: "Fights without picking chips" },
      {
        ru: "Если фишки не выбраны, в бой идут 10 самых сильных.",
        en: "With no chips picked, your 10 strongest go in.",
      },
    ),
    ru: [
      "Бой: если фишки не выбраны, в бой идут 10 самых сильных.",
      "Звук: одна громкость на замок и рейд, музыка покупок, шаги по дорогам и лодкам.",
    ],
    en: [
      "Battle: with no chips picked, your 10 strongest go in.",
      "Sound: one volume for castle and raid, shopping music, footsteps on roads and boats.",
    ],
  },
  {
    date: "2026-10-23",
    headline: H(
      { ru: "Артефакты стираются за бой", en: "Artifacts wear per fight" },
      {
        ru: "Износ — за бой, а не за удар: 50–500 боёв по редкости.",
        en: "Wear counts per fight, not per hit: 50–500 fights by rarity.",
      },
    ),
    ru: [
      "Артефакты изнашиваются за бой, а не за удар: 50–500 боёв по редкости.",
      "Вывод DARAI: своё — назад 1:1, сверху 10 % от потраченного в игре.",
      "Захват шахты зачисляет добычу сразу и присылает уведомление.",
      "Гриб больше не стирает гору: она отрастёт, когда гриб уйдёт.",
    ],
    en: [
      "Artifacts wear per fight, not per hit: 50–500 fights depending on rarity.",
      "DARAI withdrawal: your deposit back 1:1, plus 10% of what you spent in the game.",
      "Capturing a mine credits the loot instantly and sends a notice.",
      "A mushroom no longer erases a mountain: it regrows once the mushroom is gone.",
    ],
  },
];
