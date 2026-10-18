// Ошибки турниров: ключ tour.err.* (две точки) переводим сами — humanError
// его не узнаёт, и игрок читал сырой «tour.err.far». Остальное — humanError.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/humanError", () => ({ humanError: (e: unknown) => `human:${String(e)}` }));

const { errText } = await import("./errText");

const dict: Record<string, string> = {
  "tour.err.far": "Подойди к постройке ближе",
  "tour.err.not_here": "Здесь нет турниров",
};
const t = (key: string): string => dict[key] ?? key;

describe("errText", () => {
  it("переводит ключ tour.err.* из ошибки сервера", () => {
    expect(errText(new Error("tour.err.far"), t)).toBe("Подойди к постройке ближе");
    expect(errText(new Error(" tour.err.not_here "), t)).toBe("Здесь нет турниров");
  });

  it("ключа нет в словаре — отдаёт humanError", () => {
    expect(errText(new Error("tour.err.unknown"), t)).toBe("human:Error: tour.err.unknown");
  });

  it("не турнирная ошибка — отдаёт humanError", () => {
    expect(errText(new Error("Сервис обновляется"), t)).toBe("human:Error: Сервис обновляется");
    expect(errText("braid.void_blocked", t)).toBe("human:braid.void_blocked");
  });
});
