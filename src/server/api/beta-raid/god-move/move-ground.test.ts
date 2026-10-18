// Земля клетки глазами админа: сундук (магический или обычный, бугорок) и
// живые мешочки — с ref для переноса. Под декором мешочков и бугорков не видно
// никому, и админу тоже (§8.19); стоящий сундук декор не накрывает.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { parseGround } from "@/server/api/beta-raid/god-move/move-ground";

describe("земля клетки для окна админа", () => {
  it("магический — ref по хозяину, обычный — по id; мешочки — id и сколько закопано", () => {
    expect(
      parseGround({
        magic: { owner: "acc_1", name: "Магический сундук", buried: false },
        plain: null,
        bags: [
          { id: "lb_a", buried: false },
          { id: "lb_b", buried: true },
        ],
        decor: false,
      }),
    ).toEqual({
      chest: { ref: "magic:acc_1", magic: true, name: "Магический сундук", buried: false },
      bags: { ids: ["lb_a", "lb_b"], buried: 1 },
    });
    expect(
      parseGround({
        magic: null,
        plain: { id: "pc_1", name: "Сундук", buried: true },
        bags: null,
        decor: false,
      }),
    ).toEqual({
      chest: { ref: "plain:pc_1", magic: false, name: "Сундук", buried: true },
      bags: null,
    });
  });

  it("под декором: мешочков и бугорка нет, стоящий сундук — есть", () => {
    const covered = { bags: [{ id: "lb_a", buried: false }], decor: true };
    expect(
      parseGround({ ...covered, magic: null, plain: { id: "pc_1", name: "Сундук", buried: true } }),
    ).toEqual({ chest: null, bags: null });
    expect(
      parseGround({ ...covered, magic: { owner: "acc_1", name: "М", buried: false }, plain: null })
        .chest,
    ).toMatchObject({ ref: "magic:acc_1" });
  });

  it("пусто — пусто", () => {
    expect(parseGround(undefined)).toEqual({ chest: null, bags: null });
  });
});
