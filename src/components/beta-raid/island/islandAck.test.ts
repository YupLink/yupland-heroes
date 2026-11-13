// «Понятно» вне острова: шаг кладётся в кэш сам — выключенный запрос перечитка
// не трогает, и окно «ты в основном мире» иначе висело бы до перезагрузки.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/api/beta-raid/island/island-api", () => ({
  ackIsland: async () => ({ ok: true }),
  getMyIsland: async () => ({ island: null }),
}));

const { withAck } = await import("./useIsland");

describe("withAck", () => {
  const view = { island: { done: ["hello"], finished: true } } as never;
  it("шаг добавляется один раз", () => {
    const next = withAck(view, "final") as { island: { done: string[] } };
    expect(next.island.done).toEqual(["hello", "final"]);
    expect(withAck(next as never, "final")).toBe(next);
  });
  it("кэша или острова нет — без изменений", () => {
    expect(withAck(undefined, "final")).toBeUndefined();
    const empty = { island: null } as never;
    expect(withAck(empty, "final")).toBe(empty);
  });
});
