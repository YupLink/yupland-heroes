// Ссылка «Открыть» генератора миров ведёт в редактор с ?map=<id>: открывается
// эта карта; без параметра — живая, как раньше.
import { describe, expect, it } from "vitest";
import { mapFromUrl } from "./bootMapId";

describe("mapFromUrl", () => {
  it("id карты из адреса", () => {
    expect(mapFromUrl("?map=rmap_AbC-12_x")).toBe("rmap_AbC-12_x");
  });
  it("нет параметра или мусор — живая карта", () => {
    expect(mapFromUrl("")).toBeNull();
    expect(mapFromUrl("?map=")).toBeNull();
    expect(mapFromUrl("?map=rmap%27%3B")).toBeNull();
  });
});
