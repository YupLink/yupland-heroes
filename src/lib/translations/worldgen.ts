import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Генератор миров (админка /admin/worldgen, владелец 06.10.2026): новые карты
// и бесконечные миры по логике живой карты. Отказы сервера — ключами
// worldgen.*: humanError переводит их сам.
export const dict: Record<string, Entry> = {
  "worldgen.title": { ru: "Генератор миров", en: "World generator" },
  "worldgen.create": { ru: "Создать", en: "Create" },
  "worldgen.creating": { ru: "Создаём…", en: "Creating…" },
  "worldgen.name": { ru: "Название", en: "Name" },
  "worldgen.name_default": { ru: "Новый мир", en: "New world" },
  "worldgen.seed": { ru: "Сид или фраза", en: "Seed or phrase" },
  "worldgen.kind_map": { ru: "Карта", en: "Map" },
  "worldgen.kind_endless": { ru: "Бесконечный", en: "Endless" },
  "worldgen.land": { ru: "Суша", en: "Land" },
  "worldgen.land_live": { ru: "Как живая карта", en: "Like the live map" },
  "worldgen.terrain": { ru: "Местность", en: "Terrain" },
  "worldgen.terrain_all": { ru: "Все", en: "All" },
  "worldgen.open": { ru: "Открыть", en: "Open" },
  "worldgen.grow": { ru: "Дорастить", en: "Grow" },
  "worldgen.empty": { ru: "Миров пока нет", en: "No worlds yet" },
  "worldgen.chunks": { ru: "чанков: {n}", en: "chunks: {n}" },
  "worldgen.halls": { ru: "ратуш: {n}", en: "town halls: {n}" },
  "worldgen.done": {
    ru: "Готово: городов {towns}, ратуш {halls}, клеток {cells}",
    en: "Done: {towns} towns, {halls} town halls, {cells} cells",
  },
  "worldgen.grown": { ru: "Мир дорос: чанков {chunks}", en: "World grown: {chunks} chunks" },

  // Отказы сервера.
  "worldgen.no_water": {
    ru: "На живой карте нет воды — генератору не с чего брать берега",
    en: "The live map has no water to learn shores from",
  },
  "worldgen.no_land": {
    ru: "На живой карте нет земель для областей",
    en: "The live map has no land types to learn from",
  },
  "worldgen.no_source": { ru: "Живая карта не найдена", en: "Live map not found" },
  "worldgen.not_found": { ru: "Такого мира нет", en: "No such world" },
  "worldgen.not_endless": {
    ru: "Дорастить можно только бесконечный мир",
    en: "Only an endless world can grow",
  },
};
