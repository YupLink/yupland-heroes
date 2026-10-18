// Список архива картинок: справочники одним запросом + файлы приложения
// (ресурсы, герои и корабли на карте); облик — с подписью как в игре; ответ
// живёт минуту, а не ходит в базу на каждого гостя.
import { describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../db/mcpClient", () => ({
  mcpExec: async () => {
    s.calls++;
    return [
      { cat: "building", sub: null, name: "Ратуша", url: "/uploads/h.webp", id: "b1", base: null },
      {
        cat: "skin",
        sub: "Ратуши",
        name: "1000031099",
        url: "/uploads/s.webp",
        id: "s1",
        base: "Ратуша",
      },
      {
        cat: "skin",
        sub: "Ратуши",
        name: "Единорог",
        url: "/uploads/u.webp",
        id: "s2",
        base: "Ратуша",
      },
    ];
  },
}));

const { archiveItems } = await import("./media-archive");

describe("archiveItems", () => {
  it("справочники + ресурсы и спрайты; облик подписан по-игровому", async () => {
    const items = await archiveItems();
    const by = new Map(items.map((i) => [i.key, i]));
    expect(by.get("building:b1")).toMatchObject({ cat: "building", name: "Ратуша" });
    // Мусорное имя файла откатывается на базу, раса — «Ратуша единорогов».
    expect(by.get("skin:s1")?.name).toBe("Ратуша");
    expect(by.get("skin:s2")?.name).toBe("Ратуша единорогов");
    expect(items.filter((i) => i.cat === "resource").map((i) => i.name)).toContain("Золото");
    expect(items.some((i) => i.cat === "sprite" && i.url === "/ships/free.webp")).toBe(true);
  });

  it("второй гость в ту же минуту — из памяти, без похода в базу", async () => {
    const before = s.calls;
    await archiveItems();
    expect(s.calls).toBe(before);
  });
});
