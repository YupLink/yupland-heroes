// Справочник: характеристики героя и эффекты на нём.
// Числа сверены с кодом 12.10.2026: hero/heroPowerCurve, spellPower,
// effectiveHeroStats, heroStats, satiety, boost, boostImmune, encounter-effects.
// Значки — те же, что на карточках артефактов (statMeta) и в бою (effectMeta).
import { Apple, BedDouble, BookMinus, ShieldCheck, Sigma, Zap } from "lucide-react";
import { statMeta } from "@/components/itemStat";
import type { GuideIcon, GuideSection } from "../guideTypes";

const stat = (key: string): GuideIcon => statMeta(key);

export const STATS_SECTION: GuideSection = {
  id: "stats",
  title: ["Характеристики героя", "Hero stats"],
  entries: [
    {
      id: "atk",
      icon: stat("attack"),
      name: ["Атака", "Attack"],
      what: [
        "Урон отряда: +10% к удару каждой фишки за очко. Потолка нет.",
        "Squad damage: +10% to every chip's hit per point. No cap.",
      ],
      where: ["Бои с боссами, шахтами и охраной.", "Fights with bosses, mines and guards."],
    },
    {
      id: "hp",
      icon: stat("health"),
      name: ["Здоровье", "Health"],
      what: ["Здоровье фишек отряда: +10% за очко.", "Squad chips' health: +10% per point."],
      where: ["Бои.", "Fights."],
    },
    {
      id: "arm",
      icon: stat("armor"),
      name: ["Броня", "Armor"],
      what: [
        "Урон не уменьшает — даёт шанс, что враг промахнётся: 50 → 25%, 100 → 50%, 200 → 65%, 300 → 73%, 450 и выше → 80% (потолок).",
        "Doesn't cut damage — gives a chance the enemy misses: 50 → 25%, 100 → 50%, 200 → 65%, 300 → 73%, 450+ → 80% (cap).",
      ],
      where: ["Бои. В логе — «Промах врага».", "Fights. In the log — “Enemy missed”."],
    },
    {
      id: "luck",
      icon: stat("luck"),
      name: ["Удача", "Luck"],
      what: [
        "Шанс доп. урона на каждом ударе фишки: 50 → 25%, 100 → 50%, 200 → 80%, 350 и выше → 95%. Урон ×2…×10; чем выше удача, тем выше нижняя граница.",
        "Chance of extra damage on each chip hit: 50 → 25%, 100 → 50%, 200 → 80%, 350+ → 95%. Damage ×2…×10; more luck raises the lower bound.",
      ],
      where: ["Бои. На награды не влияет.", "Fights. Doesn't affect rewards."],
    },
    {
      id: "spd",
      icon: stat("speed"),
      name: ["Скорость", "Speed"],
      what: [
        "Шаг дешевле по энергии: 50 → −25%, 100 → −50%, 200 → −75%, 300 → −82%, 400 → −86%, 500 и выше → −90%.",
        "Steps cost less energy: 50 → −25%, 100 → −50%, 200 → −75%, 300 → −82%, 400 → −86%, 500+ → −90%.",
      ],
      where: [
        "Шаги по суше и сход на берег. На посадку и греблю не действует.",
        "Steps on land and going ashore. Doesn't apply to boarding or rowing.",
      ],
    },
    {
      id: "int",
      icon: stat("intellect"),
      name: ["Интеллект", "Intellect"],
      what: [
        "За очко: +2 к максимуму энергии и +1,2% к скорости её восстановления. Заклинания дешевле и быстрее перезаряжаются: 0,5% за очко до 50%, дальше до 80% (на 300).",
        "Per point: +2 max energy and +1.2% faster energy refill. Spells get cheaper and recharge faster: 0.5% per point up to 50%, then up to 80% (at 300).",
      ],
      where: ["Энергия и заклинания.", "Energy and spells."],
    },
    {
      id: "trade",
      icon: stat("trade"),
      name: ["Торговля", "Trade"],
      what: [
        "Каждые 10 — +1 ячейка рюкзака. У Торговца растёт на 1 с каждым уровнем.",
        "Every 10 — +1 backpack slot. A Merchant gains 1 per level.",
      ],
    },
    {
      id: "alchemy",
      icon: stat("alchemy"),
      name: ["Алхимия", "Alchemy"],
      what: [
        "Каждые 10 — +1 ячейка сумки зелий. У Ассасина растёт на 1 с каждым уровнем.",
        "Every 10 — +1 potion bag slot. An Assassin gains 1 per level.",
      ],
    },
    {
      id: "stat-sum",
      icon: { Icon: Sigma, color: "#f5c451" },
      name: ["Откуда числа", "Where numbers come from"],
      what: [
        "Раса и класс на текущем уровне + артефакты + очки навыков. Голод делит это пополам. Сверху — бусты, минус ослабления.",
        "Race and class at the current level + artifacts + skill points. Hunger halves that. Then boosts on top, minus weakenings.",
      ],
      where: [
        "Сильная сторона расы: ур. 10 → 48, ур. 20 → 86, ур. 30 → 124, ур. 40 → 162. Всё видно в карточке героя: «Откуда числа».",
        "Race strong side: lvl 10 → 48, lvl 20 → 86, lvl 30 → 124, lvl 40 → 162. See it in the hero card: “Where the numbers come from”.",
      ],
    },
    {
      id: "satiety",
      icon: { Icon: Apple, color: "#6fcf6f" },
      name: ["Сытость", "Satiety"],
      what: [
        "Запас сил героя. Шаг −1, по воде −2, по океану −4, бой −10, захват шахты −10, подобрать золото −1, срубить руками −30 (меньше 30 — руками не рубит). Бой не состоялся — вернётся.",
        "The hero's stamina. Step −1, on water −2, on ocean −4, fight −10, mine capture −10, picking up gold −1, chopping by hand −30 (below 30 — no chopping by hand). Refunded if a fight didn't happen.",
      ],
      where: [
        "На нуле — голод: 6 боевых характеристик ×0,5. Действовать можно и голодным. Восполняет еда: кнопка «Съесть» в рюкзаке.",
        "At zero — hunger: the 6 combat stats ×0.5. You can still act while hungry. Food refills it: “Eat” in the backpack.",
      ],
    },
    {
      id: "energy",
      icon: { src: "/resources/energy.webp" },
      name: ["Энергия", "Energy"],
      what: [
        "Ресурс игрока, не героя: шаги, бои (10), заклинания, лопата. Предел 200 (+ Интеллект героя). Восстанавливается сама: 5 за 5 минут, быстрее с Интеллектом.",
        "The player's resource, not the hero's: steps, fights (10), spells, shovel. Limit 200 (+ hero Intellect). Refills itself: 5 per 5 minutes, faster with Intellect.",
      ],
    },
  ],
};

export const EFFECTS_SECTION: GuideSection = {
  id: "effects",
  title: ["Эффекты на герое", "Effects on the hero"],
  entries: [
    {
      id: "buff",
      icon: { Icon: Zap, color: "#f5c451" },
      name: ["Буст", "Boost"],
      what: [
        "+N к характеристике на время (обычно 30 минут). Разные бусты складываются.",
        "+N to a stat for a while (usually 30 minutes). Different boosts stack.",
      ],
      where: ["Алтарь, зелья, заклинания, храм замка.", "Altar, potions, spells, castle temple."],
    },
    {
      id: "immune",
      icon: { Icon: ShieldCheck, color: "#9aa4bd" },
      name: ["Иммунитет", "Immunity"],
      what: [
        "Опасность босса против тебя не срабатывает. От артефакта — пока надет, от зелья или заклинания — на время.",
        "A boss danger never triggers on you. From an artifact — while worn, from a potion or spell — for a while.",
      ],
      where: [
        "Уже висящий эффект не снимает. От «Удара по всем» временного иммунитета нет.",
        "Doesn't remove an effect already on you. There's no temporary immunity to Cleave.",
      ],
    },
    {
      id: "oblivion",
      icon: { Icon: BookMinus, color: "#c4b5fd" },
      name: ["Забвение", "Oblivion"],
      what: [
        "Позволяет забыть заклинание прямо из книги — освободить место. Заряды и/или время.",
        "Lets you forget a spell right from the book to free a slot. Charges and/or time.",
      ],
      where: ["Постройка «Забвение».", "The “Oblivion” building."],
    },
    {
      id: "hunger",
      icon: { Icon: Apple, color: "#ff6b6b" },
      name: ["Голод", "Hunger"],
      what: [
        "Сытость на нуле: Атака, Здоровье, Броня, Удача, Скорость и Интеллект ×0,5. Торговлю и Алхимию не трогает.",
        "Satiety at zero: Attack, Health, Armor, Luck, Speed and Intellect ×0.5. Trade and Alchemy are untouched.",
      ],
    },
    {
      id: "cleanse",
      icon: { Icon: BedDouble, color: "#41d3c6" },
      name: ["Снять ослабления", "Remove debuffs"],
      what: [
        "Покои за плату снимают замедление, ослабления, а с фишек — яд и оглушение. Бусты и Забвение остаются.",
        "Chambers remove slow and weakenings for a fee, and poison and stun from chips. Boosts and Oblivion stay.",
      ],
    },
  ],
};
