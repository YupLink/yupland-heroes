// Справочник: раса и класс героя — что дают.
// Сверено с кодом 12.10.2026: heroStats (профиль расы), heroMeta, hero/* (книга,
// рюкзак, сытость), buildingEffect (корабль Строителю), chest-item (Торговец).
import { Coins, Compass, Hammer, Skull, Sword, Users, Wand2 } from "lucide-react";
import type { GuideSection } from "../guideTypes";

const race = (id: string, ru: string, en: string, statRu: string, statEn: string) => ({
  id: `race-${id}`,
  icon: { src: `/heroes/${id}.webp` },
  name: [ru, en] as const,
  what: [
    `Сильная сторона — ${statRu}: больше с самого начала и быстрее растёт.`,
    `Strong side — ${statEn}: higher from the start and grows faster.`,
  ] as const,
});

export const RACE_SECTION: GuideSection = {
  id: "race",
  title: ["Раса и класс", "Race and class"],
  entries: [
    {
      id: "race",
      icon: { src: "/heroes/yupik.webp" },
      name: ["Раса", "Race"],
      what: [
        "Народ героя. Даёт одну сильную характеристику. Больше раса ни на что не влияет.",
        "The hero's people. Gives one strong stat. Race changes nothing else.",
      ],
      where: [
        "Бывает условием: бонус артефакта, тир постройки, покупатели лавки.",
        "Can be a condition: artifact bonus, building tier, shop buyers.",
      ],
    },
    race("boar", "Кабан", "Boar", "Броня", "Armor"),
    race("dracat", "ДраКошка", "Dragon Cat", "Атака", "Attack"),
    race("unicorn", "Единорог", "Unicorn", "Удача", "Luck"),
    race("yupik", "Юпик", "Yupik", "Интеллект", "Intellect"),
    race("bee", "Пчела", "Bee", "Скорость", "Speed"),
    race("dragon", "Дракон", "Dragon", "Здоровье", "Health"),
    {
      id: "class",
      icon: { Icon: Users, color: "#9aa4bd" },
      name: ["Класс (специализация)", "Class"],
      what: [
        "Ремесло героя: даёт особое свойство. Класс не указан — герой считается Воином.",
        "The hero's trade: gives a special perk. No class set — the hero counts as a Warrior.",
      ],
    },
    {
      id: "class-mage",
      icon: { Icon: Wand2, color: "#b46bff" },
      name: ["Маг", "Mage"],
      what: ["Большая книга заклинаний: 11 / 13 / 15 мест.", "Big spellbook: 11 / 13 / 15 slots."],
    },
    {
      id: "class-warrior",
      icon: { Icon: Sword, color: "#ff6b6b" },
      name: ["Воин", "Warrior"],
      what: [
        "Без особых свойств — сила только от расы и вещей.",
        "No special perk — power comes from race and gear.",
      ],
    },
    {
      id: "class-merchant",
      icon: { Icon: Coins, color: "#f5c451" },
      name: ["Торговец", "Merchant"],
      what: [
        "+1 Торговли за уровень, большой рюкзак. Только он может купить Магический сундук.",
        "+1 Trade per level, big backpack. Only he can buy a Magic Chest.",
      ],
    },
    {
      id: "class-assassin",
      icon: { Icon: Skull, color: "#fb7185" },
      name: ["Ассасин", "Assassin"],
      what: ["+1 Алхимии за уровень и больше сытости.", "+1 Alchemy per level and more satiety."],
    },
    {
      id: "class-traveler",
      icon: { Icon: Compass, color: "#41d3c6" },
      name: ["Путешественник", "Traveler"],
      what: ["Большой рюкзак, как у Торговца.", "Big backpack, like a Merchant's."],
    },
    {
      id: "class-builder",
      icon: { Icon: Hammer, color: "#f59e0b" },
      name: ["Строитель", "Builder"],
      what: [
        "Корабль на верфи — за 50 лайков вместо 500.",
        "A ship at the shipyard costs 50 likes instead of 500.",
      ],
    },
  ],
};
