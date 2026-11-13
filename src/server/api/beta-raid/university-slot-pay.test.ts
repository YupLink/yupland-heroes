// Место в университете за золото (§8.61): цена 12 500 × n, ключ — по номеру
// места; после возврата следующая попытка платит своим ключом (…:N).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextSlotPrice, UNI_SLOT_PRICE_STEP } from "@/lib/university";

const st = vi.hoisted(() => ({ ev: [] as string[], undone: 0, applied: true }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [{ n: st.undone }] }));
vi.mock("../gold-move", () => ({
  goldMove: async (acc: string, delta: number, kind: string, ref: string) => {
    st.ev.push(`${kind}:${acc}:${delta}:${ref}`);
    return st.applied;
  },
  goldRefund: async (acc: string, amount: number, kind: string, ref: string) =>
    void st.ev.push(`${kind}_undo:${acc}:${amount}:${ref}`),
}));

const { payUniversitySlot, refundUniversitySlot } = await import("./university-slot-pay");

beforeEach(() => Object.assign(st, { ev: [], undone: 0, applied: true }));

describe("цена места", () => {
  it("25 × n билетов → 12 500 × n золота", () => {
    expect(UNI_SLOT_PRICE_STEP).toBe(12500);
    expect(nextSlotPrice(3)).toBe(12500);
    expect(nextSlotPrice(4)).toBe(25000);
    expect(nextSlotPrice(12)).toBeNull();
  });
});

describe("payUniversitySlot", () => {
  it("первая попытка — ключ по номеру места", async () => {
    expect(await payUniversitySlot("acc1", 12500, 4)).toBe("uni-slot:acc1:4");
    expect(st.ev).toEqual(["university_slot:acc1:-12500:uni-slot:acc1:4"]);
  });

  it("после возврата — свой ключ, место не бесплатное и не вечный отказ", async () => {
    st.undone = 1;
    expect(await payUniversitySlot("acc1", 12500, 4)).toBe("uni-slot:acc1:4:1");
  });

  it("ключ уже проведён — место не открываем", async () => {
    st.applied = false;
    await expect(payUniversitySlot("acc1", 12500, 4)).rejects.toThrow("Это место уже оплачено");
  });

  it("возврат — тем же ключом", async () => {
    await refundUniversitySlot("acc1", 12500, "uni-slot:acc1:4");
    expect(st.ev).toEqual(["university_slot_undo:acc1:12500:uni-slot:acc1:4"]);
  });
});
