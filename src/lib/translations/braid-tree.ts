import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Посадка деревьев и установка камней (lib/treePlant): кнопка в рюкзаке, окно
// выбора клетки и отказы сервера (tree.*, у камня — rock.*). Нехватка энергии —
// общий mineplace.no_energy.
export const dict: Record<string, Entry> = {
  "tree.plant": { ru: "Посадить", en: "Plant" },
  "tree.plant_title": { ru: "Посадить дерево", en: "Plant a tree" },
  "tree.plant_cost": { ru: "Посадить · ⚡{n}", en: "Plant · ⚡{n}" },
  "tree.planted": { ru: "Дерево посажено", en: "The tree is planted" },
  "tree.cells_failed": { ru: "Не удалось проверить клетки", en: "Couldn't check the cells" },
  // Отказы сервера и красные клетки окна
  "tree.busy": { ru: "Здесь занято", en: "This cell is taken" },
  "tree.road": { ru: "На дороге дерево не посадить", en: "You can't plant a tree on a road" },
  "tree.water": { ru: "В воду дерево не посадить", en: "You can't plant a tree in water" },
  "tree.player": {
    ru: "На этой клетке стоит игрок",
    en: "A player is standing on this cell",
  },
  "tree.bag": {
    ru: "На мешочек нельзя — только на кучку",
    en: "Not on a bag — only on a mound",
  },
  "tree.no_item": {
    ru: "Дерева в рюкзаке уже нет",
    en: "The tree is no longer in your backpack",
  },
  "tree.gone_kind": {
    ru: "Это дерево больше не сажают",
    en: "This tree can no longer be planted",
  },
  "tree.island": {
    ru: "На острове деревья не сажают",
    en: "Trees can't be planted on the island",
  },
  // Камни и горы (rock:, lib/treePlant plantTextKey): общие отказы — tree.*
  "rock.plant_title": { ru: "Поставить камень", en: "Place a rock" },
  "rock.plant_cost": { ru: "Поставить · ⚡{n}", en: "Place · ⚡{n}" },
  "rock.planted": { ru: "Камень поставлен", en: "The rock is placed" },
  "rock.road": { ru: "На дорогу камень не поставить", en: "You can't place a rock on a road" },
  "rock.water": { ru: "В воду камень не поставить", en: "You can't place a rock in water" },
  "rock.no_item": {
    ru: "Камня в рюкзаке уже нет",
    en: "The rock is no longer in your backpack",
  },
  "rock.gone_kind": {
    ru: "Этот камень больше не ставят",
    en: "This rock can no longer be placed",
  },
  "rock.island": {
    ru: "На острове камни не ставят",
    en: "Rocks can't be placed on the island",
  },
};
