// Справочник: герой — редкость, уровень, вместимость.
// Числа сверены с кодом 12.10.2026: heroStats, heroLevels, hero/* (satiety,
// backpackCells, potionBag, spellbookSlots, heroSlots), heroes-convert.
import {
  Backpack,
  BookOpen,
  Clock,
  Crown,
  FlaskConical,
  Hammer,
  Shirt,
  Star,
  TrendingUp,
} from "lucide-react";
import type { GuideSection } from "../guideTypes";

export const HERO_SECTION: GuideSection = {
  id: "hero",
  title: ["Герой", "Hero"],
  entries: [
    {
      id: "hero",
      icon: { Icon: Crown, color: "#f5c451" },
      name: ["Основной герой", "Main hero"],
      what: [
        "Тот, кто ходит по карте и усиливает отряд в бою. Без героя по карте ходит рыцарь — без бонусов.",
        "The one who walks the map and powers up your squad in fights. Without a hero a plain knight walks — no bonuses.",
      ],
      where: [
        "Сменить: в замке — бесплатно, в таверне на карте — за лайки.",
        "Change: free in the castle, for likes in a tavern on the map.",
      ],
    },
    {
      id: "rarity",
      icon: { Icon: Star, color: "#f5c451" },
      name: ["Редкость", "Rarity"],
      what: [
        "Обычный (серый), Редкий (синий), Эпический (фиолетовый), Легендарный (золотой). Чем реже — тем выше уровни и больше мест.",
        "Common (grey), Rare (blue), Epic (purple), Legendary (gold). The rarer, the higher the levels and the more slots.",
      ],
      where: [
        "Обычный — стартовый герой. Из фишки: 3–3,5★ → Редкий (50 лайков), 4–4,5★ → Эпический (1000), 5★ → Легендарный (5000).",
        "Common is the starter hero. From a chip: 3–3.5★ → Rare (50 likes), 4–4.5★ → Epic (1000), 5★ → Legendary (5000).",
      ],
      table: {
        cols: [
          ["", ""],
          ["Обычн.", "Common"],
          ["Редк.", "Rare"],
          ["Эпич.", "Epic"],
          ["Легенд.", "Legend."],
        ],
        rows: [
          [["Рост характеристик до ур.", "Stats grow up to lvl"], "10", "20", "30", "40"],
          [["Максимальный уровень", "Max level"], "10", "30", "40", "60"],
          [["Мест под артефакты", "Artifact slots"], "4", "8", "11", "14"],
          [
            ["Рюкзак: Торговец, Путешественник", "Backpack: Merchant, Traveler"],
            "1",
            "3",
            "4",
            "5",
          ],
          [["Рюкзак: остальные", "Backpack: others"], "1", "1", "2", "3"],
          [["Сумка зелий", "Potion bag"], "1", "3", "4", "5"],
          [
            ["Книга: Маг / остальные", "Spellbook: Mage / others"],
            "1 / 1",
            "11 / 3",
            "13 / 5",
            "15 / 7",
          ],
          [
            ["Сытость / у Ассасина", "Satiety / Assassin"],
            "1000",
            "1500 / 2000",
            "2500 / 3000",
            "4000 / 4500",
          ],
        ],
      },
    },
    {
      id: "level",
      icon: { Icon: TrendingUp, color: "#6fcf6f" },
      name: ["Уровень", "Level"],
      what: [
        "Поднимается за лайки: первый — 50, последний — 400 000. Всего до 10 ур. — 1 900, до 20 — 12 200, до 30 — 62 200, до 40 — 292 200, до 60 — 4 592 200.",
        "Raised for likes: the first costs 50, the last 400,000. Total to lvl 10 — 1,900, to 20 — 12,200, to 30 — 62,200, to 40 — 292,200, to 60 — 4,592,200.",
      ],
      where: [
        "Растит характеристики. Условие для порталов, дверей и грядок. Дерево уровней даёт +1.",
        "Grows stats. A condition for portals, doors and fields. A Level tree gives +1.",
      ],
    },
    {
      id: "boosted",
      icon: { Icon: TrendingUp, color: "#f5c451" },
      name: ["Повышенные уровни", "Boosted levels"],
      what: [
        "Редкий 21–30, Эпический 31–40, Легендарный 41–60. Характеристики больше не растут — вместо них очки навыков.",
        "Rare 21–30, Epic 31–40, Legendary 41–60. Stats stop growing — you get skill points instead.",
      ],
    },
    {
      id: "skills",
      icon: { Icon: Star, color: "#b46bff" },
      name: ["Очки навыков", "Skill points"],
      what: [
        "+2 за повышенный уровень, ещё +10 за каждый 5-й и +20 за каждый 10-й (всего: Редкий 60, Эпический 60, Легендарный 120). Очко — +1 к любой характеристике, Торговле или Алхимии. Сброса нет.",
        "+2 per boosted level, +10 more every 5th and +20 every 10th (total: Rare 60, Epic 60, Legendary 120). A point is +1 to any stat, Trade or Alchemy. No reset.",
      ],
    },
    {
      id: "backpack",
      icon: { Icon: Backpack, color: "#f5c451" },
      name: ["Рюкзак", "Backpack"],
      what: [
        "Ячейки для товаров, по 20 штук одного вида. Число ячеек — по классу и редкости, +1 за каждые 10 Торговли.",
        "Slots for goods, 20 of one kind each. Count depends on class and rarity, +1 per 10 Trade.",
      ],
      where: [
        "Добыча, покупки, инструменты. Не влезло — падает мешочком.",
        "Loot, purchases, tools. If it doesn't fit — it drops as a loot bag.",
      ],
    },
    {
      id: "potion-bag",
      icon: { Icon: FlaskConical, color: "#b46bff" },
      name: ["Сумка зелий", "Potion bag"],
      what: [
        "Зелья лежат только здесь. Ячейки — по редкости, +1 за каждые 10 Алхимии.",
        "Potions live only here. Slots by rarity, +1 per 10 Alchemy.",
      ],
    },
    {
      id: "spellbook",
      icon: { Icon: BookOpen, color: "#b46bff" },
      name: ["Книга заклинаний", "Spellbook"],
      what: [
        "Выученные заклинания. Мест больше у Мага и у редких героев. Учат на Столбе заклинаний.",
        "Learned spells. Mages and rarer heroes get more slots. Learn at a Spell pillar.",
      ],
    },
    {
      id: "artifacts",
      icon: { Icon: Shirt, color: "#5b9bff" },
      name: ["Артефакты", "Artifacts"],
      what: [
        "Вещи на героя: голова, шея, тело, руки, ноги, карманы. Дают характеристики, бонус своей расе или классу, иммунитет к опасностям.",
        "Gear on the hero: head, neck, body, hands, legs, pockets. Give stats, a bonus for their race or class, immunity to dangers.",
      ],
      where: [
        "У Обычного — 4 места: голова, тело, правая рука, ноги.",
        "A Common hero has 4 slots: head, body, right hand, legs.",
      ],
    },
    {
      id: "tool",
      icon: { Icon: Hammer, color: "#9aa4bd" },
      name: ["Основной инструмент", "Main tool"],
      what: [
        "Топор, кирка, лопата или удочка в руках героя. Без него не рубят, не копают и не рыбачат.",
        "An axe, pickaxe, shovel or rod in the hero's hands. Needed to chop, dig and fish.",
      ],
    },
    {
      id: "rest",
      icon: { Icon: Clock, color: "#9aa4bd" },
      name: ["Отдых", "Rest"],
      what: [
        "3 часа после снятия героя с грядки издалека. Отдыхающий не качается, не становится основным и не встаёт на грядку.",
        "3 hours after taking a hero off a field from afar. A resting hero can't level up, become main or work a field.",
      ],
    },
  ],
};
