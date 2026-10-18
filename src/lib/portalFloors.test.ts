import { describe, expect, it } from "vitest";
import { floorLabel, roomLabel, roomNumbers, type Floor } from "./portalFloors";

const floors: Floor[] = [
  { mapId: "alpha", num: 1, name: "Мир Альфа", mapName: "Мир Альфа" },
  { mapId: "maze", num: 2, name: "Мир лабиринта", mapName: "Генерация 128" },
];

describe("подписи этажей и комнат", () => {
  it("комната этажа — «этаж.номер»", () => {
    expect(roomLabel(floors, "maze", 3)).toBe("2.3");
    expect(roomLabel(floors, "alpha", 12)).toBe("1.12");
  });
  it("комната на карте-черновике — один номер", () => {
    expect(roomLabel(floors, "draft", 5)).toBe("5");
  });
  it("этаж — номер и название", () => {
    expect(floorLabel(floors[1]!)).toBe("2 · Мир лабиринта");
  });
});

describe("roomNumbers", () => {
  it("названные и занятые порталами — вместе, по порядку, без двери и дублей", () => {
    const rooms = {
      names: { "3": { name: "Шахты" }, "1": { name: "Вход" } },
      counts: { "3": 2, "7": 1, "0": 4 },
    };
    expect(roomNumbers(rooms)).toEqual([1, 3, 7]);
  });
  it("пусто — пусто", () => {
    expect(roomNumbers({ names: {}, counts: {} })).toEqual([]);
  });
});
