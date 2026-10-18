// Справочник: город (ратуша) и замок.
// Сверено с кодом 12.10.2026: townRules, townConfig, townPricing, townYield,
// castleMenus, castleTemple, castleWarehouse, home-castle-core, ПРАВИЛА §8.26, §8.40–8.43.
import {
  Building2,
  Castle,
  ClipboardList,
  Coins,
  DoorOpen,
  Flame,
  LogOut,
  Medal,
  Percent,
  Scale,
  Sparkles,
  Store,
  Swords,
  Users,
  Wallet,
  Warehouse,
  Wheat,
} from "lucide-react";
import type { GuideSection } from "../guideTypes";

const c = (Icon: typeof Castle, color: string) => ({ Icon, color });

export const TOWN_SECTION: GuideSection = {
  id: "town",
  title: ["Город", "Town"],
  entries: [
    {
      id: "town-hall",
      icon: c(Building2, "#f5c451"),
      name: ["Ратуша", "Town hall"],
      what: [
        "Сердце города: жители, склад товаров, цены. Привязанные лавки торгуют товарами города за золото.",
        "The heart of a town: residents, goods stock, prices. Linked shops trade the town's goods for gold.",
      ],
      where: [
        "Любую ратушу можно сделать основным замком.",
        "Any town hall can become your home castle.",
      ],
    },
    {
      id: "residents",
      icon: c(Users, "#9aa4bd"),
      name: ["Жители", "Residents"],
      what: [
        "Едят еду: 0,02 в сутки на жителя (500 жителей — 10 в сутки). Чем больше жителей, тем больше нужно товаров.",
        "They eat food: 0.02 a day per resident (500 residents — 10 a day). More residents need more goods.",
      ],
    },
    {
      id: "norm",
      icon: c(Scale, "#41d3c6"),
      name: ["Норма и НЗ", "Norm and reserve"],
      what: [
        "Норма — запас на 10 дней. НЗ (неприкосновенный запас) — 5–50% нормы: ниже него город не продаёт.",
        "Norm — a 10-day stock. Reserve — 5–50% of the norm: below it the town doesn't sell.",
      ],
    },
    {
      id: "town-price",
      icon: c(Coins, "#f5c451"),
      name: ["Цена от запаса", "Price by stock"],
      what: [
        "Мало товара — дорого, много — дёшево: на НЗ и ниже ×2, на норме ×1, на 20 нормах и выше ×0,1. Продаёт город с наценкой 10–50%.",
        "Low stock — expensive, high — cheap: at reserve or below ×2, at norm ×1, at 20 norms and above ×0.1. The town sells with a 10–50% markup.",
      ],
    },
    {
      id: "rush",
      icon: c(Flame, "#fb923c"),
      name: ["Особый спрос", "Special demand"],
      what: [
        "Товар сутки на НЗ и ниже — город скупает его по ×4, пока запас не вернётся к НЗ. Плашка «Особый спрос ×2» — вдвое к обычной цене на НЗ.",
        "If a good sits at reserve or below for a day, the town buys it at ×4 until stock is back to reserve. The “Special demand ×2” tag means double the usual reserve price.",
      ],
    },
    {
      id: "markup",
      icon: c(Percent, "#9aa4bd"),
      name: ["Наценка", "Markup"],
      what: [
        "Разница между ценой продажи и покупки: купить и сразу продать обратно — всегда в минус.",
        "The gap between the sell and buy price: buying and selling back right away always loses.",
      ],
    },
    {
      id: "famine",
      icon: c(Wheat, "#ff6b6b"),
      name: ["Голод города", "Town famine"],
      what: [
        "В 00:00 UTC жители едят. Не хватило хоть одной еды — город голодает: не производит, его лавки только принимают еду.",
        "Residents eat at 00:00 UTC. If any food runs short, the town starves: no production, its shops only accept food.",
      ],
    },
    {
      id: "yield",
      icon: c(Wheat, "#6fcf6f"),
      name: ["Добыча с окрестности", "Area yield"],
      what: [
        "Местность и декор в 10 клетках вокруг ратуши дают городу товары.",
        "Terrain and decor within 10 hexes of the town hall produce goods for the town.",
      ],
    },
  ],
};

export const CASTLE_SECTION: GuideSection = {
  id: "castle",
  title: ["Замок", "Castle"],
  entries: [
    {
      id: "home-castle",
      icon: c(Castle, "#f5c451"),
      name: ["Основной замок", "Home castle"],
      what: [
        "Твоя ратуша-дом. Первый выбор бесплатно, переезд — 5 билетов. «Телепорт к замку» переносит сюда из любого мира.",
        "Your home town hall. First pick is free, moving costs 5 tickets. “Teleport to castle” brings you here from any world.",
      ],
    },
    {
      id: "c-shop",
      icon: c(Store, "#f5c451"),
      name: ["Торговый дом", "Trading house"],
      what: ["Паки и артефакты.", "Packs and artifacts."],
    },
    {
      id: "c-market",
      icon: c(Coins, "#f5c451"),
      name: ["Рынок", "Market"],
      what: [
        "Фишки между игроками, комиссия 9%. За раз можно купить до 20 лотов.",
        "Chips between players, 9% fee. Buy up to 20 lots at once.",
      ],
    },
    {
      id: "c-tavern",
      icon: c(Users, "#f59e0b"),
      name: ["Таверна замка", "Castle tavern"],
      what: [
        "Герои (выбор основного здесь бесплатный), артефакты, алхимия, книга заклинаний.",
        "Heroes (picking your main one here is free), artifacts, alchemy, spellbook.",
      ],
    },
    {
      id: "c-temple",
      icon: c(Sparkles, "#f5c451"),
      name: ["Храм", "Temple"],
      what: [
        "Свой у каждого, уровни 1–100 за дерево, камень, золото и кристаллы. Молитва раз в 6 ч у замка или ратуши: 1–6 бонусов (больше с уровнем) делят 10 минут, за 100★ — 20.",
        "Your own, levels 1–100 for wood, stone, gold and crystals. Pray every 6 h at a castle or town hall: 1–6 boosts (more with level) share 10 minutes, 20 for 100★.",
      ],
      where: [
        "Сила = уровень храма × за очко: Атака 3, Броня 4, Здоровье 5, Скорость 2, Удача 3, Интеллект 0,5, Торговля 1, Алхимия 1.",
        "Power = temple level × per point: Attack 3, Armor 4, Health 5, Speed 2, Luck 3, Intellect 0.5, Trade 1, Alchemy 1.",
      ],
    },
    {
      id: "c-training",
      icon: c(Swords, "#fb7185"),
      name: ["Тренировочный лагерь", "Training camp"],
      what: [
        "Фишки и паки: улучшить, сделать героем.",
        "Chips and packs: upgrade, turn into a hero.",
      ],
    },
    {
      id: "c-warehouse",
      icon: c(Warehouse, "#c9a26b"),
      name: ["Склад замка", "Castle warehouse"],
      what: [
        "Личные ячейки по 20 штук: сначала 1, докупаются за ресурсы до 20. Перекладывать — когда герой у замка или ратуши.",
        "Personal slots of 20: 1 at first, buy more for resources up to 20. Move items while the hero is at a castle or town hall.",
      ],
    },
    {
      id: "c-glory",
      icon: c(Medal, "#f5c451"),
      name: ["Слава", "Glory"],
      what: ["Рейтинг игроков по урону.", "Player ranking by damage."],
    },
    {
      id: "c-tasks",
      icon: c(ClipboardList, "#9aa4bd"),
      name: ["Задания", "Tasks"],
      what: ["Доска заданий — в разработке.", "Task board — in development."],
    },
    {
      id: "c-treasury",
      icon: c(Wallet, "#f5c451"),
      name: ["Казна", "Treasury"],
      what: ["Звёзды и токены — в профиле.", "Stars and tokens — in the profile."],
    },
    {
      id: "c-gates",
      icon: c(LogOut, "#9aa4bd"),
      name: ["Выход в мир", "Exit to world"],
      what: ["Переход на карту мира.", "Go to the world map."],
    },
    {
      id: "c-hall",
      icon: c(DoorOpen, "#f5c451"),
      name: ["Ратуша замка", "Castle town hall"],
      what: ["Кнопка «Сделать основным замком».", "The “Make home castle” button."],
    },
  ],
};
