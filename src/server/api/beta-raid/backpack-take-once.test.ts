// Установка из рюкзака на клетку: списание с ключом и снятие закрепа только
// при подтверждённом «не списали». Базы нет — SQL проверяем текстом, развилки
// takeOneOrRelease — подменой mcpExec.
import { beforeEach, describe, expect, it, vi } from "vitest";

const execSql = vi.fn();
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: (...a: unknown[]) => execSql(...a) }));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  sqlRow: <T>(rows: unknown[] | undefined) => rows?.[0] as T | undefined,
}));

import {
  releaseSql,
  takeOneOrRelease,
  takeOneSql,
} from "@/server/api/beta-raid/backpack-take-once";
import { claimGuardSql } from "@/server/api/beta-raid/mine-guard-claim";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";

const flat = (s: string) => s.replace(/\s+/g, " ");
const hold = { table: "yuplink.raid_magic_chest", where: "map_id = 'm' AND q = 1 AND r = 2" };
const take = { heroId: "h1", stackKey: "boss:b1", op: "guardplace-take:n1", hold };

describe("списание одной штуки", () => {
  it("ключ операции, запертая строка и вид стека", () => {
    const sql = flat(takeOneSql({ ...take, kind: "boss" }));
    expect(sql).toContain("WHERE op = 'guardplace-take:n1'");
    expect(sql).toContain("AND b.kind = 'boss' AND b.count >= 1 FOR UPDATE");
    expect(sql).toContain("mob_count = LEAST(b.mob_count, b.count - 1)");
    // Метки шахт и грядок — тем же правилом траты (stack-origin): сумма не больше count.
    expect(sql).toContain(
      "field_count = (LEAST(b.mob_count + b.mine_count + b.field_count, b.count - 1)) - (LEAST(b.mob_count + b.mine_count, b.count - 1))",
    );
    expect(sql).toContain("SELECT 'guardplace-take:n1' FROM src, prior WHERE NOT prior.was");
  });

  it("закреп снимается только под запертым нами ключом", () => {
    const sql = flat(releaseSql("k1", hold));
    expect(sql).toContain("VALUES ('k1') ON CONFLICT (op) DO NOTHING");
    expect(sql).toContain(
      "DELETE FROM yuplink.raid_magic_chest WHERE map_id = 'm' AND q = 1 AND r = 2 AND EXISTS (SELECT 1 FROM blk)",
    );
  });
});

describe("takeOneOrRelease", () => {
  beforeEach(() => execSql.mockReset());

  it("списано — закреп не трогаем", async () => {
    execSql.mockResolvedValueOnce([{ took: true }]);
    await expect(takeOneOrRelease(take)).resolves.toBe(true);
    expect(execSql).toHaveBeenCalledTimes(1);
  });

  it("нет в рюкзаке — ключ заперт нами, закреп снят", async () => {
    execSql.mockResolvedValueOnce([{ took: false }]);
    execSql.mockResolvedValueOnce([{ blocked: true, here: true }]);
    await expect(takeOneOrRelease(take)).resolves.toBe(false);
  });

  it("ошибка после коммита: ключ уже стоит — списание было, клетка наша", async () => {
    execSql.mockRejectedValueOnce(new Error("Connection terminated"));
    execSql.mockResolvedValueOnce([{ blocked: false, here: true }]);
    await expect(takeOneOrRelease(take)).resolves.toBe(true);
  });

  it("ошибка и списания не было — закреп снят, ошибка наверх", async () => {
    execSql.mockRejectedValueOnce(new Error("pool is closed"));
    execSql.mockResolvedValueOnce([{ blocked: true, here: true }]);
    await expect(takeOneOrRelease(take)).rejects.toThrow("pool is closed");
  });

  it("повтор снятия (закрепа уже нет) — не «списано»", async () => {
    execSql.mockResolvedValueOnce([{ took: false }]);
    execSql.mockResolvedValueOnce([{ blocked: false, here: false }]);
    await expect(takeOneOrRelease(take)).resolves.toBe(false);
  });
});

describe("закреп клетки охранником", () => {
  const tpl = {
    name: "Тролль O'Brien",
    imageUrl: null,
    backgroundUrl: null,
    maxHp: 500,
    interactionCost: 10,
    abilities: [],
    damage: 25,
  } as unknown as EncounterTarget;
  const sql = flat(
    claimGuardSql({
      mapId: "m",
      q: 1,
      r: 2,
      account: "acc",
      templateId: "b1",
      tpl,
      op: "guardplace:n1",
    }),
  );

  it("повтор моста по ключу — «закреплено», а не «охранник уже стоит»", () => {
    expect(sql).toContain("WHERE op = 'guardplace:n1'");
    expect(sql).toContain("FROM prior WHERE NOT prior.was");
    expect(sql).toContain("SELECT 'guardplace:n1' FROM g");
    expect(sql).toContain("((SELECT was FROM prior) OR EXISTS (SELECT 1 FROM g)) AS placed");
  });

  it("живого не заменяет, имя экранировано", () => {
    expect(sql).toContain(
      "WHERE (yuplink.raid_mine_guard.killed_at IS NOT NULL OR yuplink.raid_mine_guard.current_hp <= 0)",
    );
    expect(sql).toContain("'Тролль O''Brien'");
  });

  it("труп охраны сундука, чей захват не прошёл, не заменяет", () => {
    expect(sql).toContain(
      "AND NOT (yuplink.raid_mine_guard.killed_by IS NOT NULL AND EXISTS ( SELECT 1 FROM yuplink.raid_magic_chest mc",
    );
    expect(sql).toContain("AND mc.owner_account <> yuplink.raid_mine_guard.killed_by))");
  });
});
