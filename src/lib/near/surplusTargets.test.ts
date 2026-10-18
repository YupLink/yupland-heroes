// Излишки NEAR с NFT-контрактов: каждый кошелёк — только свой контракт;
// YupAI — свободное минус запас 1 NEAR, не больше показанного.
import { describe, expect, it } from "vitest";
import { nearText, surplusTargetOf, withdrawable } from "./surplusTargets";

const NEAR = BigInt("1000000000000000000000000");

describe("цели вывода", () => {
  it("контракт — по подписанту, чужой кошелёк — ничего", () => {
    expect(surplusTargetOf("yupland_nfts.near")?.contract).toBe("yupai.nfts.tg");
    expect(surplusTargetOf("darai_collection.near")?.contract).toBe("yuplandshop.mintbase1.near");
    expect(surplusTargetOf("owner.example.tg")).toBeUndefined();
    expect(surplusTargetOf(null)).toBeUndefined();
  });

  it("YupAI: storage_refund с суммой строкой и депозитом 0", () => {
    const t = surplusTargetOf("yupland_nfts.near")!;
    expect(t.method).toBe("storage_refund");
    expect(t.deposit).toBe("0");
    expect(t.args(BigInt("56884405546461796100023566"))).toEqual({
      amount: "56884405546461796100023566",
    });
  });
});

describe("сумма", () => {
  it("свободное минус запас 1 NEAR (прод 18.10: 57,8844 → 56,8844)", () => {
    const free = BigInt("57884405546461796100023566");
    const w = withdrawable(free, NEAR);
    expect(w).toBe(BigInt("56884405546461796100023566"));
    expect(nearText(w, true)).toBe("56,8844");
  });

  it("свободного меньше запаса — ноль; не больше показанного", () => {
    expect(withdrawable(NEAR / BigInt(2), NEAR)).toBe(BigInt(0));
    expect(withdrawable(NEAR * BigInt(10), NEAR, NEAR * BigInt(3))).toBe(NEAR * BigInt(3));
  });
});
