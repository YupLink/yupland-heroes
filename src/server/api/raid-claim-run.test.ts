// Клейм не должен обрываться на одной недоставляемой награде.
import { describe, it, expect } from "vitest";
import {
  runRewardClaim,
  claimRef,
  grantRow,
  isSoftGrantError,
  type ClaimRow,
  type GrantFn,
} from "./raid-claim-run";

const row = (
  id: string,
  kind: string,
  amount = 1,
  packId: string | null = null,
  origin: string | null = null,
): ClaimRow => ({
  id,
  reward_kind: kind,
  reward_amount: amount,
  pack_id: packId,
  raid_location_id: "map1",
  raid_cycle_no: 3,
  origin,
});

/** Заглушка очереди: помнит, какие строки вернулись в очередь. */
function deps(grant: (r: ClaimRow) => Promise<void>, taken?: (id: string) => boolean) {
  const released: string[] = [];
  const granted: string[] = [];
  return {
    released,
    granted,
    api: {
      take: async (r: ClaimRow) => (taken ? taken(r.id) : true),
      release: async (r: ClaimRow) => {
        released.push(r.id);
      },
      grant: async (r: ClaimRow) => {
        granted.push(r.id);
        await grant(r);
      },
    },
  };
}

describe("ключ начисления", () => {
  it("свой на каждую строку", () => {
    expect(claimRef(row("rr_1", "likes"))).toBe("raidtour:map1:c3:rr_1");
    expect(claimRef(row("rr_2", "likes"))).not.toBe(claimRef(row("rr_1", "likes")));
  });
});

describe("бытовые отказы", () => {
  it("узнаются по ключу, а сбой базы — нет", () => {
    expect(isSoftGrantError(new Error("market.need_hero"))).toBe(true);
    expect(isSoftGrantError(new Error("market.backpack_need:3:1"))).toBe(true);
    expect(isSoftGrantError(new Error("raid.reward_bad_ref"))).toBe(true);
    expect(isSoftGrantError(new Error("pool is closed"))).toBe(false);
    expect(isSoftGrantError(new Error("timeout"))).toBe(false);
  });
});

describe("выдача очереди", () => {
  it("недоставляемая награда не роняет остальные", async () => {
    const d = deps(async (r) => {
      if (r.reward_kind === "custom") throw new Error("market.need_hero");
    });
    const out = await runRewardClaim(
      [row("rr_1", "likes", 25), row("rr_2", "custom", 2, "cst_a"), row("rr_3", "energy", 10)],
      d.api,
    );
    expect(out.credited).toBe(2);
    expect(out.summary).toEqual({ likes: 25, energy: 10 });
    // Товар остался в очереди, игрок читает почему.
    expect(d.released).toEqual(["rr_2"]);
    expect(out.warnings).toEqual(["market.need_hero"]);
  });

  it("рюкзак полон: вторую такую же строку не гоняет, дробную меньше — пробует", async () => {
    const d = deps(async () => {
      throw new Error("market.backpack_need:2:0");
    });
    const out = await runRewardClaim(
      [row("a", "custom", 1), row("b", "custom", 1), row("c", "custom", 0.2)],
      d.api,
    );
    expect(out.credited).toBe(0);
    expect(out.warnings).toEqual(["market.backpack_need:2:0"]);
    // «b» (тот же товар, не меньше) пропущена без take; «c» (0.2 < 1) — попытка была.
    expect(d.released).toEqual(["a", "c"]);
  });

  it("одинаковые предупреждения не дублируются, если место ещё есть (free>0)", async () => {
    const d = deps(async () => {
      throw new Error("market.backpack_need:2:1");
    });
    const out = await runRewardClaim([row("a", "custom"), row("b", "custom")], d.api);
    expect(out.credited).toBe(0);
    expect(out.warnings).toEqual(["market.backpack_need:2:1"]);
    expect(d.released).toEqual(["a", "b"]);
  });

  it("настоящий сбой базы возвращает строку и летит наружу", async () => {
    const d = deps(async (r) => {
      if (r.id === "rr_2") throw new Error("pool is closed");
    });
    await expect(
      runRewardClaim([row("rr_1", "likes", 5), row("rr_2", "Darai", 3)], d.api),
    ).rejects.toThrow("pool is closed");
    expect(d.released).toEqual(["rr_2"]);
  });

  it("перехваченную параллельным заходом строку пропускает молча", async () => {
    const d = deps(
      async () => {},
      (id) => id !== "rr_1",
    );
    const out = await runRewardClaim([row("rr_1", "likes", 5), row("rr_2", "likes", 7)], d.api);
    expect(d.granted).toEqual(["rr_2"]);
    expect(out.credited).toBe(1);
    expect(out.summary).toEqual({ likes: 7 });
  });

  it("итог называет вид по-человечески", async () => {
    const d = deps(async () => {});
    const out = await runRewardClaim(
      [
        row("p", "pack", 0, "cp_1"),
        row("r", "resource", 40, "gold"),
        row("c", "custom", 2, "cst_a"),
      ],
      d.api,
    );
    expect(out.summary).toEqual({ пак: 1, gold: 40, товар: 2 });
  });
});

describe("происхождение награды", () => {
  it("метка строки доезжает до выдачи: бой — mob, объект — loot, без метки — null", async () => {
    const calls: Array<Parameters<GrantFn>> = [];
    const grant: GrantFn = async (...args) => {
      calls.push(args);
    };
    await runRewardClaim(
      [
        row("boss", "custom", 2, "cst_a", "mob"),
        row("chest", "custom", 1, "cst_a", "loot"),
        row("box", "custom", 1, "cst_mc"),
        row("junk", "custom", 1, "cst_a", "bought"),
      ],
      { take: async () => true, release: async () => {}, grant: grantRow(grant, "w.near") },
    );
    expect(calls).toEqual([
      ["w.near", "custom", 2, "cst_a", "raidtour:map1:c3:boss", { origin: "mob" }],
      ["w.near", "custom", 1, "cst_a", "raidtour:map1:c3:chest", { origin: "loot" }],
      ["w.near", "custom", 1, "cst_mc", "raidtour:map1:c3:box", { origin: null }],
      // Незнакомое слово метки — безымянное, а не выдумка.
      ["w.near", "custom", 1, "cst_a", "raidtour:map1:c3:junk", { origin: null }],
    ]);
  });
});
