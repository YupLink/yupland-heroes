// Клад нашли (08.11.2026): приз — строкой «Клад» в «Добычу», выдача — по «Забрать»
// и только нашедшему; ресурс/токен — по ключу treasure:<id> (повтор безопасен),
// предмет — сначала отметка своим ключом; админам и нашедшему — по письму, один раз.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => {
  const fresh = () => ({
    row: null as Record<string, unknown> | null,
    queued: [] as Array<Record<string, unknown>>,
    queueFails: false,
    credits: [] as Array<{ res: string; amount: number; ref: string; account: string }>,
    creditFails: false,
    creditError: "boom <x>",
    hero: true,
    texts: [] as string[],
    dms: [] as string[],
    alerts: [] as string[],
    unsettled: [] as Array<{ id: string }>,
    unpaid: [] as Array<{ id: string; wallet: string }>,
    released: [] as string[],
  });
  return Object.assign(fresh(), { fresh });
});

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("NOT EXISTS (SELECT 1 FROM yuplink.raid_reward")) return s.unsettled;
    if (sql.includes("JOIN yuplink.raid_reward rr")) return s.unpaid;
    if (sql.includes("t.found_by IS NOT NULL AND")) {
      const op = /t\.found_op = '([^']+)'/.exec(sql)?.[1];
      const by = /t\.found_by = '([^']+)'/.exec(sql)?.[1];
      if (!s.row || (op && op !== s.row.found_op) || (by && by !== s.row.found_by)) return [];
      return [{ ...s.row, paid: !!s.row.paid || !!s.row.paidMark, told: !!s.row.toldMark }];
    }
    const mark = /SET (paid_at|found_notified_at) = now\(\), (pay_op|told_op) = '([^']+)'/.exec(
      sql,
    );
    if (mark) {
      const col = mark[1] === "paid_at" ? "paidMark" : "toldMark";
      const mine = s.row?.[col];
      if (mine && mine !== mark[3]) return [];
      s.row = { ...s.row, [col]: mark[3] };
      return [{ id: "trs_1" }];
    }
    if (sql.includes("SET paid_at = COALESCE(paid_at, now())")) s.row = { ...s.row, paid: true };
    const unmark =
      /SET paid_at = NULL, pay_op = NULL\s+WHERE id = '[^']+' AND pay_op = '([^']+)'/.exec(sql);
    if (unmark && s.row?.paidMark === unmark[1]) s.row = { ...s.row, paidMark: null };
    if (sql.includes("SET claimed_at = NULL")) s.released.push(sql);
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/reward-queue", () => ({
  queueEncounterReward: async (r: Record<string, unknown>) => {
    if (s.queueFails) throw new Error("db down");
    if (!s.queued.some((x) => x.key === r.key)) s.queued.push(r);
  },
}));
vi.mock("@/server/api/raid-reward-extra", () => ({
  BAD_REF: "raid.reward_bad_ref",
  SOFT_GRANT_ERRORS: ["market.need_hero", "market.backpack_need", "raid.reward_bad_ref"],
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => (s.hero ? { heroId: "h1" } : null),
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async (w: string) => `acc_${w}` }));
vi.mock("@/server/api/beta-raid/market-money", () => ({
  credit: async (
    _w: string,
    account: string,
    res: string,
    _t: string,
    amount: number,
    ref: string,
  ) => {
    if (s.creditFails) throw new Error(s.creditError);
    s.credits.push({ res, amount, ref, account });
  },
}));
vi.mock("./treasure-tg", () => ({
  esc: (x: string) => x.replace(/</g, "&lt;"),
  foundText: (_t: unknown, nick: string | null) => `found ${nick}`,
  sendAdminsText: async (text: string) => (s.texts.push(text), 2),
  alertOnce: async (_r: string, _m: string, text: string) => void s.alerts.push(text),
}));
vi.mock("./treasure-dm", () => ({
  tellFinder: async (t: { account: string }) => (s.dms.push(t.account), true),
}));

const { settleTreasure } = await import("./treasure-pay");
const { claimTreasure, treasureHarvestPass, unpaidSql, unsettledSql } =
  await import("./treasure-harvest");

const base = {
  id: "trs_1",
  map_id: "rmap_1",
  found_by: "acc_w",
  found_op: "gdig:acc_w:1",
  q: 3,
  r: 4,
  resource: "gold",
  token: null,
  amount: 500,
  name: null,
  world: "Хель",
  nick: "Player_One",
};

beforeEach(() => void Object.assign(s, s.fresh(), { row: { ...base } }));

const settle = () => settleTreasure("gdig:acc_w:1", "w", "acc_w");
const flush = () => new Promise((res) => setTimeout(res, 0));

describe("клад найден → «Добыча»", () => {
  it("строка «Клад» нашедшему, на счёт ничего; админам и нашедшему — по письму один раз", async () => {
    const got = { resource: "gold", token: null, amount: 500, name: null };
    expect(await settle()).toEqual(got);
    expect(await settle()).toEqual(got);
    const who = { account: "acc_w", mapId: "rmap_1", cycleNo: 0, amount: 500, unlabeled: true };
    const what = {
      sourceName: "treasure",
      kind: "treasure",
      packId: "trs_1",
      key: "treasure:trs_1",
    };
    expect(s.queued).toEqual([{ ...who, ...what }]);
    expect(s.credits).toEqual([]);
    await flush();
    expect(s.texts).toEqual(["found Player_One"]);
    expect(s.dms).toEqual(["acc_w"]);
  });

  it("не этим нажатием — ничего", async () => {
    s.row = null;
    expect(await settle()).toBeNull();
    expect(s.queued).toEqual([]);
  });

  it("строка не встала — тост всё равно о кладе (встанет обходом)", async () => {
    s.queueFails = true;
    expect((await settle())?.amount).toBe(500);
  });
});

describe("«Забрать» клад", () => {
  it("золото: по ключу treasure:<id> на аккаунт нашедшего, второй раз — ничего", async () => {
    await claimTreasure("trs_1", "w");
    await claimTreasure("trs_1", "w");
    expect(s.credits).toEqual([
      { res: "gold", amount: 500, ref: "treasure:trs_1", account: "acc_w" },
    ]);
  });

  it("чужой аккаунт — отказ «битая ссылка» (строка ждёт), без выдачи", async () => {
    await expect(claimTreasure("trs_1", "x")).rejects.toThrow("raid.reward_bad_ref");
    expect(s.credits).toEqual([]);
  });

  it("сбой золота — «пока не вышло» (строка остаётся), сигнал; следующий раз — выдано", async () => {
    s.creditFails = true;
    await expect(claimTreasure("trs_1", "w")).rejects.toThrow("treasure.pay_later");
    expect(s.row?.paid).toBeFalsy();
    expect(s.alerts[0]).toContain("следующим «Забрать»");
    expect(s.alerts[0]).toContain("&lt;x>");
    s.creditFails = false;
    await claimTreasure("trs_1", "w");
    expect(s.credits).toHaveLength(1);
  });

  it("свой товар: сначала отметка; сбой — без повтора (строка забрана), сигнал", async () => {
    s.row = { ...base, resource: "custom", token: "cst_1", name: "Ключ" };
    s.creditFails = true;
    await claimTreasure("trs_1", "w");
    expect(s.row?.paidMark).toBeTruthy();
    expect(s.alerts[0]).toContain("повтора не будет");
    s.creditFails = false;
    await claimTreasure("trs_1", "w");
    expect(s.credits).toEqual([]);
  });
});

describe("свой товар без героя / полный рюкзак", () => {
  it("героя нет — «нужен герой» до отметки, строка ждёт (свой товар и пак)", async () => {
    for (const resource of ["custom", "pack"]) {
      s.row = { ...base, resource, token: "x_1", name: "Ключ" };
      s.hero = false;
      await expect(claimTreasure("trs_1", "w")).rejects.toThrow("market.need_hero");
      expect(s.row?.paidMark).toBeFalsy();
    }
    expect(s.credits).toEqual([]);
  });

  it("полный рюкзак — отметка снята, строка ждёт; потом выдано", async () => {
    s.row = { ...base, resource: "custom", token: "cst_1", name: "Ключ" };
    s.creditFails = true;
    s.creditError = "market.backpack_need:1:0";
    await expect(claimTreasure("trs_1", "w")).rejects.toThrow("market.backpack_need");
    expect(s.row?.paidMark).toBeFalsy();
    expect(s.alerts).toEqual([]);
    s.creditFails = false;
    await claimTreasure("trs_1", "w");
    expect(s.credits).toHaveLength(1);
  });

  it("обход: бытовой отказ — строку обратно в «Добычу»", async () => {
    s.row = { ...base, resource: "custom", token: "cst_1", name: "Ключ" };
    s.creditFails = true;
    s.creditError = "market.backpack_need:1:0";
    s.unpaid = [{ id: "trs_1", wallet: "w" }];
    await treasureHarvestPass();
    expect(s.released[0]).toContain("md5('treasure:' || 'trs_1')");
  });

  it("обход: нет героя или сбой золота — строку обратно, приз не сгорел", async () => {
    s.row = { ...base, resource: "pack", token: "pk_1", name: "Пак" };
    s.hero = false;
    s.unpaid = [{ id: "trs_1", wallet: "w" }];
    await treasureHarvestPass();
    expect(s.row?.paidMark).toBeFalsy();
    s.row = { ...base };
    s.creditFails = true;
    await treasureHarvestPass();
    expect(s.released).toHaveLength(2);
  });
});

describe("обход расписания", () => {
  it("id строки очереди — тот же, что кладёт ключ treasure:<id>", () => {
    for (const sql of [unsettledSql, unpaidSql]) expect(sql).toContain("md5('treasure:' || t.id)");
    expect(unsettledSql).toContain("t.paid_at IS NULL");
    expect(unpaidSql).toContain("rr.claimed_at < now() - interval '5 minutes'");
  });

  it("без строки — ставит строку и пишет; забранный и не выданный — выдаёт", async () => {
    s.unsettled = [{ id: "trs_1" }];
    await treasureHarvestPass();
    expect(s.queued).toHaveLength(1);
    await flush();
    expect(s.dms).toEqual(["acc_w"]);
    s.unsettled = [];
    s.unpaid = [{ id: "trs_1", wallet: "w" }];
    await treasureHarvestPass();
    expect(s.credits).toEqual([
      { res: "gold", amount: 500, ref: "treasure:trs_1", account: "acc_w" },
    ]);
  });
});
