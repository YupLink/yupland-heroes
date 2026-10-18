// Охрана к своему магическому сундуку, поставленному без неё (или чья охрана
// пала без победителя). Зовёт её placeMineGuard (mine-guard.ts): пикер охраны
// общий с шахтой, а запись — своя.
//
// Третья редакция (28.09.2026): «Забрать сундук» возвращает живую охрану
// владельцу боссом, поэтому строка охраны обязана появиться ровно вместе со
// списанием босса — одним оператором под локами сети и рюкзака
// (chest-place-sql.ts). Шахтный порядок «закреп → списание» здесь дал бы дюп:
// «Забрать» между ними вернул бы неоплаченного босса.
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { publishRaid } from "@/server/raidLive";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { opDone } from "@/server/api/beta-raid/backpack-take-once";
import { abilityView, type MineGuardView } from "@/server/api/beta-raid/mine-guard-read";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { chestGuardSql, type GuardRes } from "@/server/api/beta-raid/chest/chest-place-sql";

export async function placeChestGuard(o: {
  wallet: string;
  account: string;
  mapId: string;
  q: number;
  r: number;
  stackKey: string;
  templateId: string;
  tpl: EncounterTarget;
}): Promise<{ ok: true; guard: MineGuardView }> {
  const bp = await resolveBackpack(o.wallet);
  if (!bp) throw new Error("market.backpack_no_hero");
  const op = `guardplace:${nanoid(12)}`;
  const sql = chestGuardSql(
    { mapId: o.mapId, q: o.q, r: o.r, account: o.account, heroId: bp.heroId },
    { stackKey: o.stackKey, templateId: o.templateId, tpl: o.tpl },
    op,
  );
  // Ошибка после коммита (мост потерял ответ) или ответ не разобрался —
  // спрашиваем ключ операции: он стоит, только если охрана встала.
  const res = await mcpExec(sql).then(
    (rows) => sqlRow<GuardRes>(rows as unknown[]),
    async (e: unknown) => {
      if (await opDone(op)) return { was: true } as GuardRes;
      throw e;
    },
  );
  const done = res?.was || res?.placed || (!res && (await opDone(op)));
  if (!done) {
    // Охрану на бугорок не ставят (29.09) — закопанный отвечает своей причиной.
    if (res && !res.chest) throw new Error(res.buried ? "chest.buried" : "chest.gone");
    if (res?.busy) throw new Error("chest.guard_busy");
    throw new Error("chest.need_guard");
  }
  // Охрану видят все: слой охраны перечитывается по 'built'.
  publishRaid({ mapId: o.mapId, type: "built", cells: [`${o.q},${o.r}`] });
  const t = o.tpl;
  return {
    ok: true as const,
    guard: {
      templateId: o.templateId,
      name: t.name,
      image: t.imageUrl,
      background: t.backgroundUrl,
      maxHp: t.maxHp,
      currentHp: t.maxHp,
      alive: true,
      damage: t.damage != null ? String(t.damage) : null,
      abilities: (t.abilities ?? []).map(abilityView),
    },
  };
}
