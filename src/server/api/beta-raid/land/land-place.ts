// «Положить землю» из рюкзака (владелец, 26.10.2026; lib/landPlace): только в
// мире строителей, в радиусе 3 от героя — в пустоту даром или поверх другой
// местности за энергию (перестройка). Шаблон — по стопке
// land:<местность>. Проверки, клетка, минус штука и ключ нажатия — один
// оператор (land-place-sql). После записи — дельта клетки всем, кто смотрит
// эту карту, со словарём местности (у клиентов её может ещё не быть).
// Повтор того же нажатия вторую клетку не кладёт и вторую штуку не берёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { LAND_REBUILD_ENERGY, landCellReason, landOfStack } from "@/lib/landPlace";
import { requireFeature } from "@/server/api/testers";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { recordMapChange } from "@/server/api/beta-raid/map-journal";
import { isBuilderWorld } from "./builder-world";
import { landPlaceVerdict, placeLandSql, type LandPlaceRow } from "./land-place-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия вторую клетку не кладёт. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type LandPlaced = { ok: true; q: number; r: number };

/** Ключ нажатия: где легло. null — нажатия не было. Ошибку чтения не глотаем. */
async function loadLandOp(op: string): Promise<{ q: number; r: number } | null> {
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.raid_land_place_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ q: number | string; r: number | string }> | null;
  const row = rows?.[0];
  return row ? { q: Number(row.q), r: Number(row.r) } : null;
}

/** Словарь местности для клиентов, у которых её ещё нет (как в снимке карты). */
async function terrainAssets(id: string) {
  const rows = (await mcpExec(
    `SELECT id, name, image_url, stat_amount FROM yuplink.mystic_item_template
      WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; image_url: string | null; stat_amount: number | null }>;
  const t = rows?.[0];
  if (!t) return undefined;
  return {
    terrains: {
      [t.id]: { id: t.id, name: t.name, imageUrl: t.image_url, cost: Number(t.stat_amount) || 1 },
    },
  };
}

/** Нехватка энергии на перестройку — понятным ключом с ценой; прочие сбои — как есть. */
const energyError = (e: unknown): unknown =>
  /not_enough_energy/.test(e instanceof Error ? e.message : String(e))
    ? new Error(`mineplace.no_energy|${JSON.stringify({ need: LAND_REBUILD_ENERGY })}`)
    : e;

/** Разослать новую клетку. Сбой рассылки клетку не отменяет: дошлёт снимок карты. */
async function announce(mapId: string, q: number, r: number, terrainId: string): Promise<void> {
  await recordMapChange(mapId, { patches: [{ q, r, terrainId }] }, () =>
    terrainAssets(terrainId),
  ).catch((e) =>
    console.warn("[land-place] рассылка не прошла:", e instanceof Error ? e.message : e),
  );
}

export const placeLand = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<LandPlaced> => {
    await requireFeature("builder_world");
    const terrainId = landOfStack(data.stackKey);
    if (!terrainId) throw new Error("land.no_item");
    const a = await pchestActor("land-place");
    if (!(await isBuilderWorld(a.mapId))) throw new Error("land.wrong_world");
    const op = `land:${a.account}:${data.op}`;
    const prev = await loadLandOp(op);
    if (prev) return { ok: true, ...prev };

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const pos = await playerCell(a.wallet);
    const { q, r } = data;
    // Здесь — только дальность и край мира; клетку судит оператор под локами.
    const why = landCellReason({
      dq: q - pos.q,
      dr: r - pos.r,
      q,
      r,
      spot: null,
      hero: false,
      terrainId,
    });
    if (why) throw new Error(why);

    const sql = placeLandSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      terrainId,
      op,
      cost: LAND_REBUILD_ENERGY,
    });
    let row: LandPlaceRow | null = null;
    let failed: unknown = null;
    try {
      row = sqlRow<LandPlaceRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = e;
    }
    if (row?.placed && !row.was) {
      const paid = Number(row.paid) || 0;
      if (paid > 0) {
        const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
        void noteEnergySpend(a.account, paid, "build");
      }
      await announce(a.mapId, q, r, terrainId);
      return { ok: true, q, r };
    }
    // Повтор, пустой ответ или обрыв после коммита — судит ключ нажатия.
    const again = await loadLandOp(op).catch(() => null);
    if (again) return { ok: true, ...again };
    if (failed) throw energyError(failed);
    const verdict = landPlaceVerdict(row);
    if (verdict !== "ok") throw new Error(verdict);
    return { ok: true, q, r };
  });
