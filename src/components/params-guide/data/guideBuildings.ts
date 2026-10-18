// Справочник: постройки на карте мира — что делают и сколько стоят.
// Сверено с кодом 12.10.2026: buildingEffect, shipRules, mineConfig, fieldConfig,
// warehouseCells, marketItem, portal, heroSwapLimit, university, chips-farm,
// boost, spellbookConfig, oblivionConfig, chambers, tree-levelup.
import {
  Anchor,
  BedDouble,
  BookMinus,
  BookOpen,
  DoorOpen,
  GraduationCap,
  Landmark,
  Layers,
  Orbit,
  Pickaxe,
  Signpost,
  Sparkles,
  Store,
  TowerControl,
  TreeDeciduous,
  Trophy,
  Beer,
  Warehouse,
  Wheat,
} from "lucide-react";
import type { GuideSection } from "../guideTypes";

const c = (Icon: typeof Anchor, color: string) => ({ Icon, color });

export const BUILDINGS_SECTION: GuideSection = {
  id: "buildings",
  title: ["Постройки на карте", "Buildings on the map"],
  entries: [
    {
      id: "tier",
      icon: c(Layers, "#f5c451"),
      name: ["Тир постройки", "Building tier"],
      what: [
        "Уровень постройки. Строят все вместе: игрок рядом платит — следующий тир получают все. Большинство построек работают, когда достроены.",
        "A building's level. Everyone builds together: a player next to it pays and everyone gets the next tier. Most buildings work once fully built.",
      ],
    },
    {
      id: "shipyard",
      icon: c(Anchor, "#38bdf8"),
      name: ["Верфь", "Shipyard"],
      what: [
        "Спускает корабль на соседнюю воду. Обычный — со 2-го тира за 500 лайков (Строителю — 50), большой — с 3-го за 10 дерева и Молоток.",
        "Launches a ship onto nearby water. Regular — from tier 2 for 500 likes (50 for a Builder), big — from tier 3 for 10 wood and a Hammer.",
      ],
    },
    {
      id: "watchtower",
      icon: c(TowerControl, "#9aa4bd"),
      name: ["Вышка", "Watchtower"],
      what: [
        "Открывает туман на 5 клеток вокруг за 1 энергию. С одной вышки — один раз.",
        "Clears fog 5 hexes around for 1 energy. Once per tower for each player.",
      ],
    },
    {
      id: "leveltree",
      icon: c(TreeDeciduous, "#6fcf6f"),
      name: ["Дерево уровней", "Level tree"],
      what: [
        "+1 уровень выбранному герою за плату (на выбор: билеты, лайки, токен, энергия). Одно дерево — один раз, до потолка роста редкости.",
        "+1 level to the chosen hero for a fee (your pick: tickets, likes, token, energy). Once per tree, up to the rarity's growth cap.",
      ],
    },
    {
      id: "sign",
      icon: c(Signpost, "#c9a26b"),
      name: ["Табличка", "Sign"],
      what: [
        "Текст от администрации: название города, подсказка. Читается бесплатно.",
        "Text from the team: a town name, a hint. Free to read.",
      ],
    },
    {
      id: "mine",
      icon: c(Pickaxe, "#f5c451"),
      name: ["Шахта", "Mine"],
      what: [
        "Каждый час добывает ресурс владельцу. Захватить можно за энергию и −10 сытости; хозяин один.",
        "Produces a resource for its owner every hour. Capture it for energy and −10 satiety; one owner at a time.",
      ],
      where: [
        "Прежнему хозяину доплачиваются целые несобранные часы. Есть охранник — сначала победи его.",
        "The previous owner is paid for full uncollected hours. If there's a guard — beat it first.",
      ],
    },
    {
      id: "field",
      icon: c(Wheat, "#f5c451"),
      name: ["Поле (грядка, ферма)", "Field (farm)"],
      what: [
        "Здесь работают герои, кроме основного. Урожай в час делится поровну между работниками.",
        "Heroes except your main one work here. Hourly harvest is split evenly between workers.",
      ],
      where: [
        "Товар уходит на ближайший склад (до 3 клеток), ресурс — на счёт. Бывают ограничения по редкости, уровню и числу героев. Снять издалека — 3 часа отдыха.",
        "Goods go to the nearest warehouse (within 3 hexes), resources — to your balance. May limit rarity, level and hero count. Recalling from afar — 3 hours of rest.",
      ],
    },
    {
      id: "warehouse",
      icon: c(Warehouse, "#c9a26b"),
      name: ["Склад", "Warehouse"],
      what: [
        "10 ячеек по 20: 2 личные у каждого игрока и 8 общих — через них можно обмениваться.",
        "10 slots of 20: 2 personal for each player and 8 shared — use them to trade items.",
      ],
    },
    {
      id: "market",
      icon: c(Store, "#f5c451"),
      name: ["Лавка (рынок, казарма)", "Shop (market, barracks)"],
      what: [
        "Витрина: продаёт и скупает ресурсы, паки, героев, артефакты, воинов, товары. Бывает дневной лимит и условие по расе или классу.",
        "A storefront: sells and buys resources, packs, heroes, artifacts, warriors, goods. May have a daily limit and a race or class condition.",
      ],
      where: [
        "Лавка у ратуши торгует товарами города по его ценам.",
        "A shop tied to a town hall trades the town's goods at its prices.",
      ],
    },
    {
      id: "portal",
      icon: c(Orbit, "#a78bfa"),
      name: ["Портал", "Portal"],
      what: [
        "Вошёл в один — вышел в другом портале той же сети, бывает на другом этаже. Может требовать плату, уровень героя или потраченную энергию.",
        "Enter one — exit at another portal of the same network, sometimes on another floor. May require a fee, hero level or energy already spent.",
      ],
    },
    {
      id: "door",
      icon: c(DoorOpen, "#c9a26b"),
      name: ["Дверь (ворота)", "Door (gate)"],
      what: [
        "Платный проход без переноса. Маршрут показывает плату заранее. Дверь на воде и недостроенная — бесплатно.",
        "A paid passage without teleport. The route shows the fee in advance. Doors on water and unfinished ones are free.",
      ],
    },
    {
      id: "tavern",
      icon: c(Beer, "#f59e0b"),
      name: ["Таверна", "Tavern"],
      what: [
        "Смена основного героя за лайки: 2-й тир — 1 раз в сутки за 50, 3-й — 2 раза (каждый раз восстанавливается через 12 ч) за 30.",
        "Change your main hero for likes: tier 2 — once a day for 50, tier 3 — twice (each recharges in 12 h) for 30.",
      ],
      where: [
        "Здесь же — окно героев и артефактов.",
        "Also opens the heroes and artifacts window.",
      ],
    },
    {
      id: "university",
      icon: c(GraduationCap, "#5b9bff"),
      name: ["Университет", "University"],
      what: [
        "Фишки учатся и приносят лайки: 5★ — 6 в сутки на 1-м уровне, каждые −0,5★ — вдвое меньше. Уровень здания: +20% за каждый.",
        "Chips study and earn likes: 5★ — 6 a day at level 1, each −0.5★ halves it. Building level: +20% each.",
      ],
      where: [
        "3 места сразу, до 12 (следующее — 25, 50, 75… билетов). Забирать раз в 4 ч, копится до 7 суток. Учащиеся фишки не воюют.",
        "3 seats at once, up to 12 (next — 25, 50, 75… tickets). Collect every 4 h, stores up to 7 days. Studying chips don't fight.",
      ],
    },
    {
      id: "museum",
      icon: c(Landmark, "#f5c451"),
      name: ["Музей", "Museum"],
      what: [
        "Билеты за собранные коллекции: все фишки от 5★ — 1 в сутки, от 4★ — 0,5, от 3★ — 0,1. С 3-го тира +20% за тир.",
        "Tickets for completed collections: all chips 5★+ — 1 a day, 4★+ — 0.5, 3★+ — 0.1. From tier 3, +20% per tier.",
      ],
      where: ["Забирать раз в 6 ч, копится до 3 суток.", "Collect every 6 h, stores up to 3 days."],
    },
    {
      id: "tournament",
      icon: c(Trophy, "#f5c451"),
      name: ["Турнир (арена)", "Tournament (arena)"],
      what: [
        "Таблицы турниров: идущие, скоро и прошедшие.",
        "Tournament tables: running, upcoming and past.",
      ],
    },
    {
      id: "altar",
      icon: c(Sparkles, "#f5c451"),
      name: ["Алтарь (храм в городе)", "Altar (town temple)"],
      what: [
        "За плату — буст на время (обычно 30 мин): характеристика, Торговля, Алхимия, иммунитет, сытость или Забвение. Пока такой же висит — второй не купить.",
        "For a fee — a timed boost (usually 30 min): a stat, Trade, Alchemy, immunity, satiety or Oblivion. Can't buy the same one while it's active.",
      ],
    },
    {
      id: "spell-pillar",
      icon: c(BookOpen, "#b46bff"),
      name: ["Столб заклинаний", "Spell pillar"],
      what: [
        "Учат заклинания за цену изучения. Забыть здесь можно, только если задана цена забвения.",
        "Learn spells for a fee. You can forget here only if a forget price is set.",
      ],
    },
    {
      id: "oblivion-b",
      icon: c(BookMinus, "#c4b5fd"),
      name: ["Забвение", "Oblivion"],
      what: [
        "За плату даёт эффект «Забвение»: забывать заклинания прямо из книги — зарядами или на время.",
        "For a fee gives the Oblivion effect: forget spells right from your book — by charges or for a time.",
      ],
    },
    {
      id: "chambers",
      icon: c(BedDouble, "#41d3c6"),
      name: ["Покои", "Chambers"],
      what: [
        "За плату снимают замедление и ослабления с героя, яд и оглушение — с фишек.",
        "For a fee remove slow and weakenings from the hero, poison and stun from chips.",
      ],
    },
  ],
};
