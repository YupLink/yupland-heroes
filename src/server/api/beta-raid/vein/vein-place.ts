// «Положить жилу» из рюкзака (владелец, 29.10.2026; lib/veinPlace): в радиусе 3
// от героя на клетку, что держит жилу (правила minev2-30 и «жилы ещё нет»). Вид
// — по стопке vein:<вид>, поворот — случайный из шести. Проверки, жила, минус
// штука и ключ нажатия — один оператор (vein-place-sql).
//
// После записи — дельта клетки {vein} всем, кто смотрит эту карту (recordMapChange:
// журнал, живой канал, сброс снимка — следующий снимок прочтёт жилу из базы).
// Повтор того же нажатия вторую жилу не кладёт и вторую штуку не берёт, но
// рассылку досылает: ответ первого нажатия мог потеряться ДО рассылки, и без неё
// жилу никто, кроме полного снимка, не увидел бы. Лишняя рассылка безвредна —
// правка клетки та же.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { VEIN_RADIUS, isVeinKind, randomVeinRot, veinDist, veinOfStack } from "@/lib/veinPlace";
import type { VeinKind } from "@/lib/veinPlace";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { refuseMainWorld } from "./vein-main";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { recordMapChange } from "@/server/api/beta-raid/map-journal";
import { placeVeinSql, veinPlaceVerdict, type VeinPlaceRow } from "./vein-place-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия вторую жилу не кладёт. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type VeinPlaced = { ok: true; q: number; r: number };

/** Легшая жила: где, какая и как повёрнута. */
type VeinDone = { mapId: string; q: number; r: number; kind: VeinKind; rot: number };

/** Ключ нажатия: что легло. null — нажатия не было. Ошибку чтения не глотаем. */
async function loadVeinOp(op: string): Promise<VeinDone | null> {
  const rows = (await mcpExec(
    `SELECT map_id, q, r, kind, rot FROM yuplink.raid_vein_place_op
      WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ map_id: string; q: unknown; r: unknown; kind: unknown; rot: unknown }> | null;
  const row = rows?.[0];
  if (!row || !isVeinKind(row.kind)) return null;
  return {
    mapId: String(row.map_id),
    q: Number(row.q),
    r: Number(row.r),
    kind: row.kind,
    rot: Number(row.rot) || 0,
  };
}

/** Разослать жилу клетки. Сбой рассылки жилу не отменяет: дошлёт снимок карты. */
async function announce(v: VeinDone): Promise<VeinPlaced> {
  await recordMapChange(v.mapId, {
    patches: [{ q: v.q, r: v.r, vein: { kind: v.kind, rot: v.rot } }],
  }).catch((e) =>
    console.warn("[vein-place] рассылка не прошла:", e instanceof Error ? e.message : e),
  );
  return { ok: true, q: v.q, r: v.r };
}

export const placeVein = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<VeinPlaced> => {
    const kind = veinOfStack(data.stackKey);
    if (!kind) throw new Error("vein.no_item");
    const a = await pchestActor("vein-place");
    if (isIslandMapId(a.mapId)) throw new Error("vein.island");
    await refuseMainWorld(a.mapId);
    const op = `vein:${a.account}:${data.op}`;
    // Повтор уже исполненного нажатия — «ok» без новой рассылки: она ушла с первым нажатием,
    // а повтор старого ключа иначе бесплатно дёргал бы версию карты у всех (критик 29.10).
    const prev = await loadVeinOp(op);
    if (prev) return { ok: true, q: prev.q, r: prev.r };

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const pos = await playerCell(a.wallet);
    const { q, r } = data;
    // Здесь — только дальность; клетку судит оператор под локами.
    if (veinDist(pos, { q, r }) > VEIN_RADIUS) throw new Error("vein.far");

    const sql = placeVeinSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      heroId: bp.heroId,
      kind,
      rot: randomVeinRot(),
      op,
    });
    let row: VeinPlaceRow | null = null;
    let failed: unknown = null;
    try {
      row = sqlRow<VeinPlaceRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = e;
    }
    if (row?.placed && !row.was) {
      return announce({ mapId: a.mapId, q, r, kind, rot: Number(row.rot) || 0 });
    }
    // Повтор, пустой ответ или обрыв после коммита — судит ключ нажатия.
    const again = await loadVeinOp(op).catch(() => null);
    if (again) return announce(again);
    if (failed) throw failed;
    const verdict = veinPlaceVerdict(row);
    if (verdict !== "ok") throw new Error(verdict);
    return { ok: true, q, r };
  });
