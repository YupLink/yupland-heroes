// «Съесть» гриб из рюкзака (владелец, 25.10.2026, ПРАВИЛА §8.85): за 50 энергии
// награда сразу — алмазный 5 алмазов, золотой 5 золота, DARAI 25 000 DARAI (из
// пула карты, как добыча); через 12 часов с шансом 50 % гриб того же вида встаёт
// на одной из свободных жил (dmine-respawn, минутный обход).
//
// Всё решает база (migrations/mushroom-10): raid_mushroom_eat — под локом рюкзака
// гриб вида с ближайшим выпадением, энергия, минус штука, награда, журнал с ключом
// нажатия (повтор ни энергию, ни награду второй раз не трогает).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { MUSHROOM_EAT_ENERGY, mushroomKindOfStack, type MushroomKind } from "@/lib/mushroomKinds";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  /** Ключ нажатия: повтор того же нажатия второй гриб не ест. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  /**
   * Цена, которую игрок видел и подтвердил («Подтвердить» шлёт её). Обязательна:
   * вкладка старой сборки (кнопка без подтверждения) её не шлёт — отказ, ничего
   * не списано.
   */
  cost: z.literal(MUSHROOM_EAT_ENERGY),
});

export type MushroomEaten = { ok: true; kind: MushroomKind; reward: number; paid: number };

export const eatMushroomSql = (o: {
  op: string;
  account: string;
  wallet: string;
  heroId: string;
  kind: MushroomKind;
  /** Энергия «Съесть» (MUSHROOM_EAT_ENERGY). */
  cost: number;
}): string =>
  `SELECT yuplink.raid_mushroom_eat(${sqlStr(o.op)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)},
            ${sqlStr(o.heroId)}, ${sqlStr(o.kind)}, ${Math.max(0, Math.floor(o.cost))}) AS res`;

/** Ответ базы (jsonb объектом или строкой) → награда; не разобрали — null. */
export function eatResOf(
  rows: unknown,
): { kind: string; reward: number; paid: number; was: boolean } | null {
  const row = Array.isArray(rows) ? (rows[0] as { res?: unknown } | undefined) : undefined;
  let res = row?.res;
  if (typeof res === "string") {
    try {
      res = JSON.parse(res);
    } catch {
      return null;
    }
  }
  if (!res || typeof res !== "object") return null;
  const o = res as { kind?: unknown; reward?: unknown; paid?: unknown; was?: unknown };
  if (typeof o.kind !== "string") return null;
  return {
    kind: o.kind,
    reward: Number(o.reward) || 0,
    paid: Number(o.paid) || 0,
    was: o.was === true,
  };
}

export const eatMushroom = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<MushroomEaten> => {
    const kind = mushroomKindOfStack(data.stackKey);
    if (!kind) throw new Error("dmine.no_item");
    const a = await pchestActor("dmine-eat");
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const sql = eatMushroomSql({
      op: `dmeat:${a.account}:${data.op}`,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      kind,
      cost: MUSHROOM_EAT_ENERGY,
    });
    let rows: unknown;
    try {
      rows = await mcpExec(sql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not_enough_energy/.test(msg)) {
        throw new Error(`mineplace.no_energy|${JSON.stringify({ need: MUSHROOM_EAT_ENERGY })}`);
      }
      throw /dmine_no_item/.test(msg) ? new Error("dmine.no_item") : e;
    }
    const res = eatResOf(rows);
    if (!res) throw new Error("dmine.no_item");
    if (!res.was && res.paid > 0) {
      const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
      void noteEnergySpend(a.account, res.paid, "other");
    }
    return { ok: true, kind, reward: res.reward, paid: res.paid };
  });
