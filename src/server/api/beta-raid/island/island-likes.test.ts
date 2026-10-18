// Лайки за боссов острова (§8.47): жирно до первых 500 на аккаунт, дальше по
// чуть-чуть; только босс и только на острове. Базы нет: mcpExec подменён.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  earned: 0,
  queued: [] as Array<{ kind: string; amount: number; account: string; mapId: string }>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.beta_raid_object_run r"))
      return [{ account: "acc_w", total: "900", first_at: "2026-10-17" }];
    if (sql.includes("raid_reward_distributed")) return [{ scope_key: "beta:hp1" }];
    if (sql.includes("reward_kind = 'likes'")) return [{ n: String(s.earned) }];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/reward-queue", async () => ({
  ...(await vi.importActual<object>("@/server/api/beta-raid/reward-queue")),
  queueEncounterReward: async (r: (typeof s.queued)[number]) => void s.queued.push(r),
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc_w" }));
vi.mock("@/server/api/achievements/bump", () => ({ bumpBossKill: () => {} }));

const { payoutByTop } = await import("@/server/api/beta-raid/encounter-payout");

const target = (kind: EncounterTarget["kind"]): EncounterTarget => ({
  kind,
  templateId: `tpl_${kind}`,
  name: kind,
  imageUrl: null,
  backgroundUrl: null,
  badgeLabel: kind,
  maxHp: 10,
  interactionCost: 0,
  rewardConfig: { fillers: [], packs: [], split: [100] },
  abilities: [],
  damage: null,
});
const run = (kind: EncounterTarget["kind"], mapId: string) =>
  payoutByTop({ target: target(kind), hpId: "hp1", viewer: "w", mapId, cycleNo: 0, q: 1, r: 2 });
const likes = () => s.queued.filter((r) => r.kind === "likes");

beforeEach(() => {
  s.sql = [];
  s.queued = [];
  s.earned = 0;
});

describe("лайки за босса острова", () => {
  it("новичку — 100, и окно боя их показывает", async () => {
    const mine = await run("boss", "isle_abc");
    expect(likes()).toEqual([
      expect.objectContaining({ account: "acc_w", amount: 100, mapId: "isle_abc" }),
    ]);
    expect(mine).toContainEqual({ kind: "likes", amount: 100, packId: null });
  });

  it("счёт — по аккаунту и с островов вообще, включая не забранное", async () => {
    await run("boss", "isle_abc");
    const q = s.sql.find((x) => x.includes("reward_kind = 'likes'")) ?? "";
    expect(q).toContain("account_id = 'acc_w'");
    expect(q).toContain("left(location_id, 5) = 'isle_'");
    expect(q).not.toContain("claimed_at");
  });

  it("добирает ровно до 500, дальше — по 2", async () => {
    s.earned = 450;
    await run("boss", "isle_abc");
    expect(likes()[0].amount).toBe(50);
    s.queued = [];
    s.earned = 500;
    await run("boss", "isle_abc");
    expect(likes()[0].amount).toBe(2);
  });

  it("в мире и за сундук острова — ничего лишнего", async () => {
    await run("boss", "main_map");
    await run("chest", "isle_abc");
    expect(likes()).toEqual([]);
    expect(s.sql.some((x) => x.includes("reward_kind = 'likes'"))).toBe(false);
  });
});
