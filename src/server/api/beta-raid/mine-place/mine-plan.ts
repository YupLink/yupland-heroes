// Режим стройки шахты и чертёж (ПРАВИЛА §8.59 п. 8, владелец 21.10.2026):
//  · minePlaceCandidates — 19 клеток в радиусе 2 вокруг героя, зелёная или
//    красная, по правилам самой постановки (mine-plan-candidates);
//  · createMinePlan — «✓»: чертёж на зелёную клетку (та же проверка заново);
//    один на аккаунт, новый заменяет прежний, повтор безвреден;
//  · getMyMinePlan / removeMinePlan — мой чертёж на этой карте и «Убрать».
// Чертёж — не стена и не шахта: виден только хозяину, никого не держит.
// Саму шахту ставит placeMineBlueprint (mine-place), подойдя к чертежу.
// На острове новичка шахты из заготовок не ставят (§8.59 п. 11).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { isIslandMapId } from "@/lib/raid/island/ids";
import {
  MINE_BUILD_RADIUS,
  isPlaceableBlueprint,
  type PlaceableBlueprint,
} from "@/lib/minePlacement";
import { boostedCaptureCost } from "@/lib/mineBoost";
import { mineBoostLevel } from "@/server/api/castle-architect/mine-boost-sql";
import { hexDist, type MineCandidate, type MinePlanView } from "@/lib/mineBuild";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { blueprintKind } from "@/server/api/beta-raid/mine-place/mine-place-kind";
import { mineCandidates } from "@/server/api/beta-raid/mine-place/mine-plan-candidates";
import {
  planDropAtSql,
  planDropSql,
  planLookSql,
  planPutSql,
  planViewOf,
  type MinePlanRow,
} from "@/server/api/beta-raid/mine-place/mine-plan-sql";

const stackInput = z.object({ stackKey: z.string().min(1).max(200) });

/** Круг кандидатов вокруг героя для заготовки этой стопки. */
async function around(stackKey: string) {
  const a = await pchestActor("mine-plan");
  if (isIslandMapId(a.mapId)) throw new Error("mineplace.island");
  const kind = await blueprintKind(stackKey);
  const pos = await playerCell(a.wallet);
  const cells = await mineCandidates({
    mapId: a.mapId,
    q: pos.q,
    r: pos.r,
    account: a.account,
    kind,
  });
  return { a, kind, center: { q: pos.q, r: pos.r }, cells };
}

export type MineCandidates = {
  kind: PlaceableBlueprint;
  center: { q: number; r: number };
  cells: MineCandidate[];
};

export const minePlaceCandidates = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => stackInput.parse(d))
  .handler(async ({ data }): Promise<MineCandidates> => {
    const { kind, center, cells } = await around(data.stackKey);
    return { kind, center, cells };
  });

export const createMinePlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    stackInput.extend({ q: z.number().int(), r: z.number().int() }).parse(d),
  )
  .handler(async ({ data }): Promise<MinePlanView> => {
    const { a, kind, center, cells } = await around(data.stackKey);
    if (hexDist(center, data) > MINE_BUILD_RADIUS) throw new Error("mineplace.plan_far");
    const at = cells.find((c) => c.q === data.q && c.r === data.r);
    if (!at?.ok) throw new Error(at?.reason ?? "mineplace.busy");
    await mcpExec(
      planPutSql({
        account: a.account,
        mapId: a.mapId,
        q: data.q,
        r: data.r,
        kind,
        stackKey: data.stackKey,
      }),
    );
    return {
      mapId: a.mapId,
      q: data.q,
      r: data.r,
      kind,
      stackKey: data.stackKey,
      energy: boostedCaptureCost(kind, await mineBoostLevel(a.account, kind)),
    };
  });

/**
 * Мой чертёж на этой карте. Клетку чертежа заняли насовсем (постройка, объект,
 * мешочек, декор, блок…) — его уже не поставить: стираем и отвечаем «нет».
 */
export const getMyMinePlan = createServerFn({ method: "GET" }).handler(
  async (): Promise<MinePlanView | null> => {
    const a = await pchestActor(null);
    const rows = (await mcpExec(planLookSql(a.account), { wrapJson: true })) as Array<
      MinePlanRow & { held?: boolean | null }
    > | null;
    const row = rows?.[0];
    if (row?.held) {
      await mcpExec(planDropAtSql(a.account, row.map_id, Number(row.q), Number(row.r)));
      return null;
    }
    const kind = row?.kind as PlaceableBlueprint | undefined;
    const boost = kind && isPlaceableBlueprint(kind) ? await mineBoostLevel(a.account, kind) : 0;
    return planViewOf(row, a.mapId, boost);
  },
);

export const removeMinePlan = createServerFn({ method: "POST" }).handler(async () => {
  const a = await pchestActor("mine-plan");
  await mcpExec(planDropSql(a.account));
  return { ok: true as const };
});
