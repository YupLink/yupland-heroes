// Остров новичка (владелец, 14.10.2026): личная маленькая карта одного игрока.
//
// Карта острова узнаётся по id — без запроса в базу и одинаково на сервере и в
// клиенте: шапка карты уже несёт id, портал и окно задания решают по нему.
export const ISLAND_PREFIX = "isle_";

export const isIslandMapId = (id: string | null | undefined): boolean =>
  typeof id === "string" && id.startsWith(ISLAND_PREFIX);
