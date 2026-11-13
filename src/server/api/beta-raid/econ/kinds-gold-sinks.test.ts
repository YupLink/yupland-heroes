// Траты золотом вместо билетов (§8.61) и их возвраты — сток в res_ledger.
import { describe, expect, it } from "vitest";
import { groupOfKind } from "./kinds";

describe("res_ledger: золото вместо билетов-трат", () => {
  it("все виды трат и возвратов — sink", () => {
    for (const k of [
      "drop_claim",
      "drop_claim_undo",
      "chip_pack",
      "energy_pack",
      "like_purchase",
      "like_purchase_undo",
      "building",
      "university_slot",
      "university_slot_undo",
      "home_castle",
    ]) {
      expect(groupOfKind("res", k, null)).toBe("sink");
    }
  });
});
