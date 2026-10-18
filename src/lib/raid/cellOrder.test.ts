// Подпись порядка клеток и биты по номерам — общие для сервера и клиента.
import { describe, expect, it } from "vitest";
import { bitAt, cellOrderHash, packBits } from "./cellOrder";

describe("cellOrder", () => {
  it("хэш зависит от порядка и типа массива не зависит", () => {
    const q = [0, 1, 2, -5];
    const r = [0, 0, 1, 7];
    const a = cellOrderHash(q, r, 4);
    expect(a).toBe(cellOrderHash(Int16Array.from(q), Int16Array.from(r), 4));
    expect(a).not.toBe(cellOrderHash([1, 0, 2, -5], [0, 0, 1, 7], 4));
    expect(a).not.toBe(cellOrderHash(q, r, 3));
    expect(a).toMatch(/^[0-9a-f]{1,8}$/);
  });

  it("биты пакуются по восемь и читаются обратно", () => {
    const bits = packBits(19, (i) => i % 3 === 0);
    expect(bits.length).toBe(3);
    for (let i = 0; i < 19; i++) expect(bitAt(bits, i)).toBe(i % 3 === 0);
    expect(bitAt(bits, 23)).toBe(false);
  });
});
