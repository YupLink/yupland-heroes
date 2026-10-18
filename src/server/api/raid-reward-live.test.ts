// Срок награды очереди: сгоревшее не видно и не выдаётся нигде, добыча
// выдаётся с меткой происхождения строки (бой — mob, объект/декор/грабёж —
// loot, сам сундук — без метки), со сроком — первой. Базы нет — mcpExec
// подменён, проверяем операторы и то, что уехало в выдачу.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  expired: new Set<string>(),
  grants: [] as Array<{ packId: string | null; origin?: string | null }>,
  pending: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({ pg: {} }));
vi.mock("../auth", () => ({ requireWallet: () => "w1" }));
vi.mock("./raid-distribute", () => ({ distributeRaidRewards: async () => 0 }));
vi.mock("./beta-raid/owner", () => ({ raidOwner: async () => "acc_w" }));
vi.mock("./raid-helpers", () => ({
  grantRaidReward: async (
    _w: string,
    _k: string,
    _a: number,
    packId: string | null,
    _r: string,
    o?: { origin?: string | null },
  ) => void s.grants.push({ packId, origin: o?.origin }),
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("AS raid_location_id")) {
      const row = (id: string, pack: string, origin: string | null) => ({
        id,
        reward_kind: "custom",
        reward_amount: 1,
        pack_id: pack,
        raid_location_id: "rmap_x",
        raid_cycle_no: 0,
        origin,
      });
      return [
        row("rr_1", "cst_mc", null),
        row("rr_2", "cst_ore", "loot"),
        row("rr_3", "cst_old", "mob"),
      ];
    }
    // Забор строки: сгоревшую оператор не отдаёт — условие срока стоит в нём самом.
    if (sql.startsWith("UPDATE yuplink.raid_reward SET claimed_at=now()")) {
      const id = /id='([^']+)'/.exec(sql)?.[1] ?? "";
      return sql.includes("expires_at > now()") && s.expired.has(id) ? [] : [{ id }];
    }
    if (sql.includes("min(expires_at)")) return s.pending;
    return [{ n: 0 }];
  },
}));

const { liveRewardSql, rewardOriginSql } = await import("@/server/api/raid-reward-live");
const { claimRaidRewards } = await import("@/server/api/raid-rewards");
const { pendingRaidRewardsFor } = await import("@/server/api/raid-rewards-pending");
const claimAll = claimRaidRewards as unknown as () => Promise<{ claimed: number }>;
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  s.sql = [];
  s.expired = new Set();
  s.grants = [];
  s.pending = [];
});

describe("условие срока", () => {
  it("жива, пока срок не вышел; без срока — всегда", () => {
    expect(liveRewardSql()).toBe("(expires_at IS NULL OR expires_at > now())");
    expect(liveRewardSql("r")).toBe("(r.expires_at IS NULL OR r.expires_at > now())");
  });

  it("происхождение: явная метка; без неё — mob-флаг строки, потом шаблон босса, иначе loot", () => {
    expect(flat(rewardOriginSql("raid_reward"))).toBe(
      "COALESCE(raid_reward.origin, CASE WHEN raid_reward.mob THEN 'mob' " +
        "WHEN NOT raid_reward.mob THEN NULL " +
        "WHEN EXISTS (SELECT 1 FROM yuplink.raid_boss_template bt WHERE bt.id = raid_reward.boss_id) THEN 'mob' " +
        "ELSE 'loot' END)",
    );
  });
});

describe("«Забрать» (все и по типу)", () => {
  it("выборка без сгоревших, со сроком — первыми; метка «с мобов» от строки", async () => {
    await claimAll();
    const pick = flat(s.sql[0] ?? "");
    expect(pick).toContain("claimed_at IS NULL AND (expires_at IS NULL OR expires_at > now())");
    expect(pick).toContain("ORDER BY expires_at NULLS LAST, created_at, id");
    expect(pick).toContain("COALESCE(raid_reward.origin, CASE WHEN raid_reward.mob THEN 'mob'");
    expect(pick).toContain("AS origin");
  });

  it("сундук ложится без метки, товары сети — «собрано прочее», бой — с мобов", async () => {
    await claimAll();
    expect(s.grants).toEqual([
      { packId: "cst_mc", origin: null },
      { packId: "cst_ore", origin: "loot" },
      { packId: "cst_old", origin: "mob" },
    ]);
  });

  it("сгоревшая между выборкой и забором — не выдаётся", async () => {
    s.expired.add("rr_3");
    const res = await claimAll();
    expect(res.claimed).toBe(2);
    expect(s.grants.map((g) => g.packId)).toEqual(["cst_mc", "cst_ore"]);
    const count = flat(s.sql.at(-1) ?? "");
    expect(count).toContain("SELECT count(*)::int AS n FROM yuplink.raid_reward");
    expect(count).toContain("(expires_at IS NULL OR expires_at > now())");
  });
});

describe("сводка «Добычи»", () => {
  it("сгоревшее не видно; у группы — ближайший срок в мс", async () => {
    s.pending = [
      {
        source: "Магический сундук",
        place: null,
        reward_kind: "custom",
        pack_id: "cst_ore",
        amount: "40",
        cnt: 1,
        expires_at: "2026-09-29T12:00:00+00:00",
      },
      {
        source: "Тролль",
        place: 1,
        reward_kind: "custom",
        pack_id: "cst_ore",
        amount: "5",
        cnt: 1,
        expires_at: null,
      },
      {
        source: "Магический сундук",
        place: null,
        reward_kind: "custom",
        pack_id: "cst_mc",
        amount: "1",
        cnt: 1,
        expires_at: null,
      },
    ];
    const res = await pendingRaidRewardsFor("acc_w");
    const sql = flat(s.sql.find((x) => x.includes("min(expires_at)")) ?? "");
    expect(sql).toContain("claimed_at IS NULL AND (expires_at IS NULL OR expires_at > now())");
    const ore = res.rewards.find((r) => r.packId === "cst_ore");
    expect(ore).toMatchObject({
      amount: 45,
      count: 2,
      expiresAt: Date.parse("2026-09-29T12:00:00Z"),
    });
    expect(res.rewards.find((r) => r.packId === "cst_mc")?.expiresAt).toBeNull();
  });
});

/** Все файлы сервера без тестов. */
function serverFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(path);
    }
  };
  walk(join(process.cwd(), "src/server"));
  return files;
}

describe("все читатели очереди знают про срок", () => {
  it("каждый файл сервера, который читает или забирает raid_reward, зовёт liveRewardSql", () => {
    const files = serverFiles();
    const readers = files.filter((f) =>
      /(FROM|UPDATE) yuplink\.raid_reward\b(?!_)/.test(readFileSync(f, "utf8")),
    );
    expect(readers.length).toBeGreaterThanOrEqual(6);
    const blind = readers.filter((f) => !readFileSync(f, "utf8").includes("liveRewardSql("));
    expect(blind).toEqual([]);
  });
});

describe("все писатели очереди знают про происхождение", () => {
  it("каждая вставка в raid_reward пишет origin — иначе товар решит запасная ветка", () => {
    const writers = serverFiles().filter((f) =>
      /INSERT INTO yuplink\.raid_reward\b(?!_)|raidReward\.insert/.test(readFileSync(f, "utf8")),
    );
    // Захват магического сундука (chest-seize-sql) снят 29.09 — писателей два.
    expect(writers.length).toBeGreaterThanOrEqual(2);
    // Турнир локации (raid-distribute) товара и ресурса не раздаёт — метка не нужна.
    const blind = writers.filter(
      (f) => !f.endsWith("raid-distribute.ts") && !/\borigin\b/.test(readFileSync(f, "utf8")),
    );
    expect(blind).toEqual([]);
    const dist = readFileSync(join(process.cwd(), "src/server/api/raid-distribute.ts"), "utf8");
    expect(dist.match(/if \(isExtraFiller\(fl\)\) continue;/g)).toHaveLength(2);
  });
});
