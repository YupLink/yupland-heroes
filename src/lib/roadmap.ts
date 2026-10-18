// Роадмап проекта: баги, идеи и задачи, обсуждённые с командой.
// Единый источник правды для /admin/roadmap — редактируется прямо тут,
// без БД, чтобы список не терялся между разговорами.

export type RoadmapCategory = "bug" | "idea" | "task";
export type RoadmapStatus = "planned" | "in_progress" | "done";

export type RoadmapItem = {
  id: string;
  category: RoadmapCategory;
  title: string;
  status: RoadmapStatus;
  note?: string;
};

export const roadmapItems: RoadmapItem[] = [
  // ── Баги ──────────────────────────────────────────────────────────
  { id: "bug-trails-teleport", category: "bug", title: "Баг с тропами и телепортацией", status: "planned" },
  { id: "bug-nft-images-sender", category: "bug", title: "Баг с картинками NFT в сендере", status: "planned" },

  // ── Идеи ──────────────────────────────────────────────────────────
  { id: "idea-land-map", category: "idea", title: "Карта земель с развилками и тропами", status: "planned" },
  { id: "idea-mines", category: "idea", title: "Шахты как источник ресурсов", status: "planned" },
  { id: "idea-castle-tree", category: "idea", title: "Дерево для строительства в замке", status: "planned" },
  {
    id: "idea-castle-staking",
    category: "idea",
    title: "Постройка в замке для стейкинга фишек в лайки",
    status: "planned",
    note: "Улучшение постройки увеличивает доход со стейкинга",
  },
  { id: "idea-auto-tasks", category: "idea", title: "Сервис автоматического создания задач из разговоров", status: "planned" },
  { id: "idea-heroes-from-chips", category: "idea", title: "Механика героев из фишек", status: "planned" },
  { id: "idea-sell-utilize-heroes", category: "idea", title: "Продажа или утилизация героев", status: "planned" },
  { id: "idea-pvp-heroes3", category: "idea", title: "PvP в стиле «Героев 3»", status: "planned" },
  { id: "idea-chip-collection-roles", category: "idea", title: "Роли коллекциям фишек", status: "planned" },
  { id: "idea-mine-capture", category: "idea", title: "Захват шахт с охраной", status: "planned" },
  { id: "idea-artifact-loot", category: "idea", title: "Общий и расовый лут для артефактов", status: "planned" },
  { id: "idea-mage-set", category: "idea", title: "Сет-мага как особый артефакт", status: "planned" },
  { id: "idea-move-cost", category: "idea", title: "Стоимость ходов на разных локациях", status: "planned" },
  { id: "idea-quests-npc", category: "idea", title: "Квесты и NPC в деревнях", status: "planned" },
  { id: "idea-inventory-craft", category: "idea", title: "Инвентарь и крафт", status: "planned" },
  { id: "idea-hidden-locations", category: "idea", title: "Скрытые локации и секретные предложения", status: "planned" },
  { id: "idea-hero-swap-tavern", category: "idea", title: "Смена героя только в таверне", status: "planned" },
  { id: "idea-monster-abilities", category: "idea", title: "Способности монстрам (каменная кожа, потеря сознания)", status: "planned" },
  { id: "idea-free-to-play", category: "idea", title: "Free-to-play возможность", status: "planned" },
  { id: "idea-location-levels", category: "idea", title: "Локации по уровням героев", status: "planned" },
  { id: "idea-boss-regen", category: "idea", title: "Регенерация боссов и пустые земли", status: "planned" },
  { id: "idea-roadmap", category: "idea", title: "Дорожная карта проекта", status: "done", note: "Эта страница" },

  // ── Задачи ────────────────────────────────────────────────────────
  { id: "task-alla-service", category: "task", title: "Разобраться в сервисе Аллы для структурирования информации", status: "planned" },
  { id: "task-map-constructor", category: "task", title: "Конструктор карт и локаций", status: "planned" },
  { id: "task-monster-attack-editor", category: "task", title: "Редактор атаки монстров", status: "planned" },
  { id: "task-forks-map-display", category: "task", title: "Улучшить отображение развилок и карты", status: "planned" },
  {
    id: "task-beta",
    category: "task",
    title: "Бета-версия для тестирования",
    status: "in_progress",
    note: "Доступ только по ADMIN_WALLETS — включается флагом BETA_ADMIN_ONLY",
  },
  { id: "task-mystery-box", category: "task", title: "Мистический бокс с призами", status: "planned" },
];
