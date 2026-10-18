import { describe, expect, it } from "vitest";
import {
  BURN_PER_TX,
  MAX_BURN,
  chunkIds,
  clampQty,
  pickTokenIds,
  setQty,
  totalQty,
  withoutBurned,
} from "./burnPlan";
import { groupBurnable, type BurnGroup } from "@/server/api/nft-burn";

const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i));
const grass: BurnGroup = { title: "Grass", media: "", tokenIds: ids(100, 90) };
const stone: BurnGroup = { title: "Stone", media: "", tokenIds: ids(500, 50) };

describe("выбор на сжигание", () => {
  it("не больше, чем есть копий", () => {
    expect(clampQty({}, stone, 999)).toBe(50);
    expect(clampQty({}, stone, -3)).toBe(0);
  });

  it("общий лимит 120 на все названия вместе", () => {
    let q = setQty({}, grass, 90);
    q = setQty(q, stone, 50);
    expect(q.Stone).toBe(MAX_BURN - 90);
    expect(totalQty(q)).toBe(MAX_BURN);
  });

  it("ноль убирает название из выбора", () => {
    const q = setQty(setQty({}, stone, 5), stone, 0);
    expect(q).toEqual({});
  });

  it("берёт первые N каждого названия, вперемешку", () => {
    const picked = pickTokenIds([grass, stone], { Grass: 2, Stone: 3 });
    expect(picked).toEqual(["100", "101", "500", "501", "502"]);
  });

  it("120 штук — две транзакции по 60", () => {
    const chunks = chunkIds(ids(1, MAX_BURN));
    expect(chunks.map((c) => c.length)).toEqual([BURN_PER_TX, BURN_PER_TX]);
    expect(chunkIds([])).toEqual([]);
  });

  it("сожжённое пропадает из списка, пустые названия — тоже", () => {
    const left = withoutBurned([grass, stone], new Set(stone.tokenIds.concat(["100"])));
    expect(left).toHaveLength(1);
    expect(left[0].tokenIds[0]).toBe("101");
  });
});

describe("список с блокчейна", () => {
  it("группирует по названию, сверху больше копий, номера по возрастанию, дубли отбрасывает", () => {
    const tok = (id: string, title?: string) => ({ token_id: id, metadata: { title, media: "m" } });
    const groups = groupBurnable([
      tok("12", "Grass"),
      tok("3", "Grass"),
      tok("7", "Stone"),
      tok("3", "Grass"), // страница сдвинулась — тот же токен дважды
      tok("15"),
    ]);
    expect(groups.map((g) => [g.title, g.tokenIds])).toEqual([
      ["Grass", ["3", "12"]], // больше всего копий — первым
      ["#15", ["15"]],
      ["Stone", ["7"]],
    ]);
  });
});
