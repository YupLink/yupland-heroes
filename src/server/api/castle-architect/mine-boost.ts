// «Усилить чертёж» в окне Архитектора (lib/mineBoost): следующий уровень вида за
// его цену в алмазах. Вид — тот, что игрок может изготовить (уровень Архитектора
// или герой-Строитель): усилять чертёж, которого не сделать, — выброшенные алмазы.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { BUILDER_SPEC } from "@/lib/buildingEffect";
import { BLUEPRINT_LEVEL, craftProblem } from "@/lib/castleArchitect";
import { BLUEPRINT_RESOURCES } from "@/lib/mineBlueprint";
import { MINE_BOOST_MAX, mineBoostNext } from "@/lib/mineBoost";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { architectLevel, who } from "./architect-state";
import { architectError } from "./craft-core";
import { buyMineBoostSql, type BoostBuyRow } from "./mine-boost-sql";

export const buyMineBoost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(BLUEPRINT_RESOURCES),
        /** Уровень, который видел игрок: двойное нажатие не купит два. */
        from: z.number().int().min(0).max(MINE_BOOST_MAX),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; level: number; bought: boolean }> => {
    const { wallet, account } = await who();
    const next = mineBoostNext(data.from);
    if (!next) throw new Error("architect.boost_max");
    const [level, bag] = await Promise.all([
      architectLevel(account),
      resolveBackpack(wallet).catch(() => null),
    ]);
    const problem = craftProblem(data.kind, level, bag?.spec === BUILDER_SPEC);
    if (problem === "soon") throw new Error("architect.soon");
    if (problem === "level")
      throw new Error(`architect.level_needed:${BLUEPRINT_LEVEL[data.kind]}`);
    let row: BoostBuyRow | null = null;
    try {
      const sql = buyMineBoostSql({
        account,
        kind: data.kind,
        from: data.from,
        diamonds: next.diamonds,
      });
      row = sqlRow<BoostBuyRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      throw architectError(e);
    }
    if (row?.now != null) return { ok: true, level: Number(row.now), bought: true };
    // Уровень уже этот (вторая вкладка, повтор после обрыва) — ничего не куплено.
    if (row && Number(row.was) === data.from + 1) {
      return { ok: true, level: data.from + 1, bought: false };
    }
    throw new Error("architect.boost_moved");
  });
