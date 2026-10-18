// Этаж и комната портала глазами админа (владелец, 07.10.2026): этажи списком
// «номер · название» с пометкой своего, «+ Новый этаж»; комнаты — «этаж.номер ·
// имя», дверь только на своём этаже, «+ Новая комната»; безымянной комнате —
// поле для имени с её номером.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FloorPlaces } from "@/lib/portalFloors";

vi.mock("@/server/api/beta-raid/floors", () => ({
  adminCreateFloor: async () => ({}),
  adminDropFloor: async () => ({}),
  adminPortalPlaces: async () => ({}),
  adminRenameFloor: async () => ({}),
}));
vi.mock("@/server/api/beta-raid/portal-rooms", () => ({ adminPortalRooms: async () => ({}) }));

const { PortalFloorPicker } = await import("./PortalFloorPicker");
const { PortalRoomPicker } = await import("./PortalRoomPicker");

const places: FloorPlaces = {
  here: "alpha",
  floors: [
    { mapId: "alpha", num: 1, name: "Мир Альфа", mapName: "Мир Альфа" },
    { mapId: "maze", num: 2, name: "Мир лабиринта", mapName: "Генерация 128" },
  ],
  free: [{ id: "draft", name: "Черновик1" }],
};

const floorPicker = (p: FloorPlaces, floorMap: string) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PortalFloorPicker mapId={p.here} places={p} floorMap={floorMap} onPick={() => {}} />
    </QueryClientProvider>,
  );

const roomPicker = (o: { group: number; own: boolean; floor: number }) =>
  renderToStaticMarkup(
    <PortalRoomPicker
      group={o.group}
      names={{ "1": { name: "Вход в лабиринт" }, "3": { name: "Шахты" } }}
      nums={[1, 3, 4]}
      own={o.own}
      label={(g) => `${o.floor}.${g}`}
      saving={false}
      onPick={() => {}}
      onSave={() => {}}
    />,
  );

describe("этаж", () => {
  it("этажи по номерам, свой помечен, есть «+ Новый этаж»", () => {
    const out = floorPicker(places, "alpha");
    expect(out).toContain("1 · Мир Альфа · здесь");
    expect(out).toContain("2 · Мир лабиринта");
    expect(out).toContain("+ Новый этаж");
    expect(out.indexOf("Мир Альфа")).toBeLessThan(out.indexOf("Мир лабиринта"));
  });

  it("главный мир не снимается, другой этаж — снимается", () => {
    expect(floorPicker(places, "alpha")).not.toContain("Снять этаж");
    expect(floorPicker(places, "maze")).toContain("Снять этаж");
  });

  it("карта-черновик в редакторе — своей строкой", () => {
    const out = floorPicker({ ...places, here: "draft" }, "draft");
    expect(out).toContain("Черновик1 · эта карта");
  });
});

describe("комната", () => {
  it("свой этаж: дверь и комнаты «этаж.номер · имя»", () => {
    const out = roomPicker({ group: 3, own: true, floor: 1 });
    expect(out).toContain("Дверь");
    expect(out).toContain("1.1 · Вход в лабиринт");
    expect(out).toContain("1.3 · Шахты");
    expect(out).toContain("1.4 · без названия");
    expect(out).toContain("+ Новая комната");
  });

  it("чужой этаж: двери нет", () => {
    const out = roomPicker({ group: 1, own: false, floor: 2 });
    expect(out).not.toContain("Дверь");
    expect(out).toContain("2.1 · Вход в лабиринт");
  });

  it("безымянная комната просит имя со своим номером", () => {
    expect(roomPicker({ group: 4, own: false, floor: 2 })).toContain("Название комнаты 2.4");
    expect(roomPicker({ group: 3, own: false, floor: 2 })).not.toContain("Название комнаты");
  });
});
