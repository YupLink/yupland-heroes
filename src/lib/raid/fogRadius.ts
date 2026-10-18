// Радиус «второго обзора» — активной зоны лёгкого тумана вокруг героя
// (CLAUDE.md «Fog of war», уровень 3). Одно число на сервер и клиент: плёнка
// тумана на канвасе (beta-raid/fogZones) и видимость мешочков (lib/lootBag,
// server/api/beta-raid/loot-bag/bag-read-sql). Дальше — тёмный туман.
export const FOG_ACTIVE_RADIUS = 20;
