// Из кэша поиска модулей уходят только закэшированные ошибки (память сборки).
import { describe, expect, it } from "vitest";
import { dropResolveErrors } from "../../vite/releaseResolveErrors";

describe("кэш exsolve после окружения сборки", () => {
  it("ошибки уходят, найденные адреса остаются", () => {
    const cache = new Map<string, unknown>([
      ["a", "file:///a.js"],
      ["b", new Error("Cannot resolve module b")],
      ["c", "file:///c.js"],
      ["d", Object.assign(new Error("x"), { code: "ERR_MODULE_NOT_FOUND" })],
    ]);
    expect(dropResolveErrors(cache)).toBe(2);
    expect([...cache.keys()]).toEqual(["a", "c"]);
  });

  it("кэша нет — ничего не делает", () => {
    expect(dropResolveErrors(undefined)).toBe(0);
  });
});
