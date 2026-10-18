// Справочник: карта — шаги, туман, корабли, объекты, сундуки, значки.
// Числа сверены с кодом 12.10.2026: shipRules, shipHealth, useFogOfWar,
// encounter-pickup/loot, magicChest, plainChest, lootBag, openPass, drawPlayers.
import {
  Archive,
  Box,
  Eye,
  Footprints,
  Gem,
  Hash,
  Package,
  Pickaxe,
  Route,
  Ship,
  Shovel,
  Waves,
} from "lucide-react";
import type { GuideSection } from "../guideTypes";

export const MAP_SECTION: GuideSection = {
  id: "map",
  title: ["Карта и объекты", "Map and objects"],
  entries: [
    {
      id: "step",
      icon: { Icon: Footprints, color: "#f5c451" },
      name: ["Цена шага", "Step cost"],
      what: [
        "Золотые числа у героя — сколько энергии стоит шаг на соседнюю клетку. Зависит от местности; дорога — своя цена.",
        "Gold numbers around the hero show the energy for a step to that hex. Depends on terrain; a road has its own price.",
      ],
      where: [
        "Скорость героя удешевляет шаг, замедление — удорожает.",
        "Hero Speed makes steps cheaper, Slow makes them pricier.",
      ],
    },
    {
      id: "road",
      icon: { Icon: Route, color: "#c9a26b" },
      name: ["Дорога", "Road"],
      what: [
        "На клетке с дорогой шаг стоит цену дороги, а не местности.",
        "On a road hex a step costs the road's price, not the terrain's.",
      ],
    },
    {
      id: "fog",
      icon: { Icon: Eye, color: "#9aa4bd" },
      name: ["Туман", "Fog"],
      what: [
        "Герой видит на 2 клетки вокруг. Разведанное остаётся открытым. Вышка открывает 5 клеток.",
        "The hero sees 2 hexes around. Explored land stays open. A watchtower reveals 5 hexes.",
      ],
    },
    {
      id: "water",
      icon: { Icon: Waves, color: "#38bdf8" },
      name: ["Вода и океан", "Water and ocean"],
      what: [
        "Пешком по воде не ходят — нужен корабль. Океан (глубокая вода) — только на большом корабле.",
        "No walking on water — you need a ship. The ocean (deep water) is for big ships only.",
      ],
    },
    {
      id: "ship",
      icon: { Icon: Ship, color: "#38bdf8" },
      name: ["Корабль", "Ship"],
      what: [
        "Посадка — 3 энергии, шаг по воде — 3 (на большом — 2). Запас хода: малый 1000, большой 2000; посадка и сход −50, шаг −3, по океану −5.",
        "Boarding — 3 energy, a water step — 3 (2 on a big ship). Hull: small 1000, big 2000; boarding and leaving −50, step −3, ocean −5.",
      ],
      where: [
        "Запас кончился — корабль разбит. Чинят досками вплотную: доска +20. Свободный обломок может починить любой.",
        "Hull at zero — the ship is wrecked. Repair from next to it with planks: +20 each. Anyone can repair a free wreck.",
      ],
    },
    {
      id: "chest",
      icon: { Icon: Box, color: "#c9a26b" },
      name: ["Сундук и монетка", "Chest and coin"],
      what: [
        "Забираются без боя за энергию (обычно 10). Награда — тому, кто забрал первым. Монетка ещё −1 сытости.",
        "Taken without a fight for energy (usually 10). The reward goes to whoever takes it first. A coin also costs 1 satiety.",
      ],
    },
    {
      id: "map-artifact",
      icon: { Icon: Gem, color: "#a78bfa" },
      name: ["Артефакт на карте", "Artifact on the map"],
      what: [
        "Забирается как сундук. Цвет ободка — редкость: серый, синий, фиолетовый, золотой.",
        "Taken like a chest. The ring colour is its rarity: grey, blue, purple, gold.",
      ],
    },
    {
      id: "mine-object",
      icon: { Icon: Pickaxe, color: "#f5c451" },
      name: ["Объект «Вскрыть»", "“Break open” object"],
      what: [
        "Бьётся отрядом, как босс, но награду получает только тот, кто добил.",
        "Fought with the squad like a boss, but only the one who finishes it gets the reward.",
      ],
    },
    {
      id: "magic-chest",
      icon: { Icon: Archive, color: "#b46bff" },
      name: ["Магический сундук", "Magic chest"],
      what: [
        "Твоё личное хранилище на карте: 10 ячеек по 20. Купить может только Торговец. Можно поставить охрану.",
        "Your personal storage on the map: 10 slots of 20. Only a Merchant can buy it. Can have a guard.",
      ],
      where: [
        "Открыть стоит столько энергии, сколько ячеек занято (минимум 1).",
        "Opening costs as much energy as slots are filled (at least 1).",
      ],
    },
    {
      id: "plain-chest",
      icon: { Icon: Archive, color: "#c9a26b" },
      name: ["Обычный сундук", "Chest (shared)"],
      what: [
        "10 ячеек, общие для всех игроков, без срока. Охраны нет. Открыть — как у магического.",
        "10 slots shared by all players, no expiry. No guard. Opening costs like a magic chest.",
      ],
    },
    {
      id: "bag",
      icon: { Icon: Package, color: "#c9a26b" },
      name: ["Мешочек", "Loot bag"],
      what: [
        "Падает, когда добыча не влезла в рюкзак. Живёт 24 часа. Открыть — 1 энергия.",
        "Drops when loot doesn't fit the backpack. Lasts 24 hours. Opening costs 1 energy.",
      ],
      where: [
        "Стоит живой объект на клетке — сначала бой.",
        "If a living object stands on the hex — fight it first.",
      ],
    },
    {
      id: "mound",
      icon: { Icon: Shovel, color: "#a16207" },
      name: ["Бугорок", "Mound"],
      what: [
        "Закопанный мешочек или сундук. Закопать или выкопать — 2 энергии и износ лопаты.",
        "A buried loot bag or chest. Burying or digging up costs 2 energy and shovel wear.",
      ],
    },
    {
      id: "players-badge",
      icon: { Icon: Hash, color: "#ff5470" },
      name: ["Цифры в красных кружках", "Numbers in red circles"],
      what: [
        "Сколько других игроков стоит на этой клетке. Себя ты в счёте не видишь.",
        "How many other players stand on that hex. You don't count yourself.",
      ],
      where: [
        "Над грядкой — «занято/мест». На мешочках — сколько их на клетке.",
        "Above a field — “taken/slots”. On loot bags — how many are on the hex.",
      ],
    },
  ],
};
