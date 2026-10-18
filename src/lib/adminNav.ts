// YUPLINK · Админ · единый источник правды для навигации.
//
// И сайдбар (admin.tsx), и дашборд (admin.index.tsx) берут структуру
// отсюда — добавил пункт здесь, появился в обоих местах.

import {
  Gift,
  Heart,
  CheckSquare,
  Ticket,
  Store,
  ScrollText,
  Gamepad2,
  Sparkles,
  Wallet,
  Send,
  Wrench,
  Map,
  MapPinned,
  Milestone,
  Gem,
  Wand2,
  PackageSearch,
  FlaskConical,
  Vault,
  Gauge,
  ListTodo,
  CalendarClock,
  Trophy,
  Mail,
  Globe,
  type LucideIcon,
} from "lucide-react";

// Все админ-роуты, на которые ведёт навигация. Литеральный union —
// TanStack Router типизирует <Link to=…> по нему.
export type AdminNavTo =
  | "/admin/drops"
  | "/admin/testers"
  | "/admin/likes"
  | "/admin/tasks"
  | "/admin/tickets"
  | "/admin/shop"
  | "/admin/chips"
  | "/admin/nft-inputs"
  | "/admin/hallway"
  | "/admin/hov"
  | "/admin/raids"
  | "/admin/hex-editor"
  | "/admin/worldgen"
  | "/admin/spells"
  | "/admin/tournaments"
  | "/admin/letters"
  | "/admin/assets"
  | "/admin/payouts"
  | "/admin/redemptions"
  | "/admin/treasury"
  | "/admin/subscriptions"
  | "/admin/kits"
  | "/admin/nft-batch"
  | "/admin/mint"
  | "/admin/wallet"
  | "/admin/optimize"
  | "/admin/roadmap";

// Внутренний маршрут (Link) или внешняя ссылка под тем же доменом (<a href>):
// так подключён Блок задач — отдельный сервис, который Caddy отдаёт с /tasks/.
export type AdminNavItem = {
  label: string;
  icon: LucideIcon;
  desc?: string;
} & ({ to: AdminNavTo } | { href: string });

export type AdminNavGroup = {
  title: string;
  blurb: string;
  items: AdminNavItem[];
  // Вторая ступень доступа: группа видна только владельцу (payouts-admin).
  // Сайдбар и дашборд скрывают её, если session.isPayoutsAdmin === false.
  gate?: "payouts";
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: "Розыгрыши",
    blurb: "Раздаёшь NFT и токены; юзеры голосуют лайками за кандидатов.",
    items: [
      {
        to: "/admin/drops",
        label: "Дропы (раздачи NFT)",
        icon: Gift,
        desc: "Создать раздачу NFT/токенов/пака",
      },
      {
        to: "/admin/likes",
        label: "Голосование лайками",
        icon: Heart,
        desc: "Кандидаты по лайкам → запуск дропа",
      },
    ],
  },
  {
    title: "Билеты",
    blurb: "Как игрок зарабатывает и тратит билеты.",
    items: [
      {
        to: "/admin/tasks",
        label: "Задания (+билеты)",
        icon: CheckSquare,
        desc: "Подписки/кастомные за +1 билет",
      },
      {
        to: "/admin/tickets",
        label: "Билеты за NFT",
        icon: Ticket,
        desc: "Билеты за держание набора NFT",
      },
      {
        to: "/admin/shop",
        label: "Магазин билетов",
        icon: Store,
        desc: "Цены: энергия/токен → билеты",
      },
    ],
  },
  {
    title: "Игра «Фишки»",
    blurb: "Коллекции, паки, онбординг.",
    items: [
      {
        to: "/admin/chips",
        label: "Фишки",
        icon: Gamepad2,
        desc: "Коллекции · паки",
      },
      {
        to: "/admin/nft-inputs",
        label: "Ввод NFT",
        icon: PackageSearch,
        desc: "Жалобы «отправил — не пришло» · догон",
      },
      {
        to: "/admin/hov",
        label: "Герои NFT",
        icon: Sparkles,
        desc: "Heroes of Valdir · картинки",
      },
      {
        to: "/admin/hallway",
        label: "Онбординг новичка",
        icon: Sparkles,
        desc: "Уровни · сундуки · старт-задания",
      },
    ],
  },
  {
    title: "Рейды",
    blurb: "Локации, цепочки боссов и сундуков, награды за суммарный урон.",
    // Открыто всем админам (в т.ч. Ярославу/darai_collection.near), не только владельцу.
    items: [
      {
        to: "/admin/raids",
        label: "Рейд-локации",
        icon: Map,
        desc: "Локации · конструктор цепочки · награды",
      },
      {
        to: "/admin/hex-editor",
        label: "Редактор карт (β)",
        icon: MapPinned,
        desc: "Гекс-редактор · коридоры, объекты, дороги",
      },
      {
        to: "/admin/worldgen",
        label: "Генератор миров",
        icon: Globe,
        desc: "Новые карты и бесконечные миры · черновики",
      },
      {
        to: "/admin/spells",
        label: "Заклинания",
        icon: Wand2,
        desc: "Каталог книги героя · эффекты · энергия · откат",
      },
      {
        to: "/admin/tournaments",
        label: "Турниры",
        icon: Trophy,
        desc: "Категория · дни · места и призы · запуск",
      },
      { to: "/admin/letters", label: "Письма игрокам", icon: Mail, desc: "Окно при входе в игру" },
      {
        to: "/admin/assets",
        label: "Редактор ассетов",
        icon: Gem,
        desc: "Мобы · боссы · сундуки · шахты · артефакты · местность",
      },
    ],
  },
  {
    title: "Роадмап",
    blurb: "Баги, идеи и задачи проекта — единый список.",
    items: [
      {
        to: "/admin/roadmap",
        label: "Роадмап",
        icon: Milestone,
        desc: "Баги · идеи · задачи",
      },
      {
        href: "/tasks/",
        label: "Блок задач",
        icon: ListTodo,
        desc: "Задачник по стихиям · разработчик · админ · тестеры",
      },
    ],
  },
  {
    title: "Тестеры",
    blurb: "Группа игроков, которым механики открываются раньше остальных.",
    gate: "payouts",
    items: [
      {
        to: "/admin/testers",
        label: "Тестеры",
        icon: FlaskConical,
        desc: "Кошельки · что им открыто",
      },
    ],
  },
  {
    title: "Выплаты",
    blurb: "Казна по токенам и журнал выплат NFT. Раздача DARAI — в «Магазине билетов».",
    gate: "payouts",
    items: [
      {
        to: "/admin/treasury",
        label: "Казна",
        icon: Vault,
        desc: "Долг игрокам по токенам и чем покрыт",
      },
      {
        to: "/admin/subscriptions",
        label: "Подписка и авторассылки",
        icon: CalendarClock,
        desc: "Тарифы в $ · авторассылки · корзины · звёзды",
      },
      { to: "/admin/kits", label: "Наборы", icon: Gem, desc: "Набор новичка · фаундерпаки" },
      {
        to: "/admin/redemptions",
        label: "Журнал выплат NFT",
        icon: ScrollText,
        desc: "Очередь выплат: paid/stuck/cancel",
      },
    ],
  },
];

// Личное/инструменты — внизу сайдбара, мелким. Не повседневные пункты.
export const adminFooterItems: Extract<AdminNavItem, { to: AdminNavTo }>[] = [
  { to: "/admin/mint", label: "Минт NFT", icon: Wrench },
  { to: "/admin/nft-batch", label: "Раздача NFT (CSV)", icon: Send },
  { to: "/admin/optimize", label: "Оптимизация", icon: Gauge },
  { to: "/admin/wallet", label: "Мой кошелёк", icon: Wallet },
];
