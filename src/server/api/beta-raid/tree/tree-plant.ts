// «Посадить дерево» из рюкзака (владелец, 22.10.2026; lib/treePlant): на свою
// или соседнюю клетку по правилам постановки шахт (§8.59 п. 8 — без природы,
// жилы и прохода), но на кучку можно. Шаблон — по стопке tree:<шаблон>; встаёт
// обычный срубаемый декор этого шаблона — стена для прохода, рубится и
// отрастает как такой же на карте (decor-interact, decor-respawn). Стоит
// TREE_PLANT_ENERGY энергии — тем же оператором, только вместе с деревом. Карта —
// та, где стоит герой: любой мир и этаж, кроме острова новичка (как шахты).
//
// Проверки, энергия, клетка, минус штука из стопки и ключ нажатия — один
// оператор (tree-plant-sql). После записи — дельта клетки всем путём отросшего
// декора (decor-respawn: словарь шаблона, слой мешочков над кучкой). Повтор того
// же нажатия второе дерево не сажает и энергию второй раз не берёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isPlaceDir } from "@/lib/plainChest";
import { TREE_PLANT_ENERGY, plantOfStack } from "@/lib/treePlant";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import {
  plantTreeSql,
  treePlantVerdict,
  type TreePlantRow,
} from "@/server/api/beta-raid/tree/tree-plant-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  /** Куда: 0,0 — под себя, иначе одна из шести соседних клеток. */
  dq: z.number().int().min(-1).max(1),
  dr: z.number().int().min(-1).max(1),
  /** Ключ нажатия: повтор того же нажатия второе дерево не сажает. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type TreePlanted = { ok: true; q: number; r: number };

/** Ключ нажатия: где посажено. null — нажатия не было. Ошибку чтения не глотаем. */
async function loadTreeOp(op: string): Promise<{ q: number; r: number } | null> {
  const rows = (await mcpExec(
    `SELECT q, r FROM yuplink.raid_tree_plant_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ q: number | string; r: number | string }> | null;
  const row = rows?.[0];
  return row ? { q: Number(row.q), r: Number(row.r) } : null;
}

/** Разослать вставший декор (и недосланный прошлым нажатием). Сбой дошлёт минутный цикл. */
async function announce(): Promise<void> {
  const { startDecorRespawner, sweepDecorRespawns } =
    await import("@/server/api/beta-raid/decor-respawn");
  await sweepDecorRespawns().catch((e) =>
    console.warn("[tree-plant] рассылка не прошла:", e instanceof Error ? e.message : e),
  );
  startDecorRespawner();
}

/** Повтор уже посаженного нажатия: дошлём и ответим тем же. */
async function replayOf(op: string): Promise<TreePlanted | null> {
  const prev = await loadTreeOp(op);
  if (!prev) return null;
  await announce();
  return { ok: true, ...prev };
}

/** Нехватка энергии — понятным ключом с ценой; прочие сбои — как есть. */
const energyError = (e: unknown): unknown =>
  /not_enough_energy/.test(e instanceof Error ? e.message : String(e))
    ? new Error(`mineplace.no_energy|${JSON.stringify({ need: TREE_PLANT_ENERGY })}`)
    : e;

export const plantTree = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<TreePlanted> => {
    if (!isPlaceDir(data.dq, data.dr)) throw new Error("pchest.place_far");
    // Дерево (tree:) или камень (rock:) — тот же путь, свой шаблон и стопка.
    const plant = plantOfStack(data.stackKey);
    if (!plant) throw new Error("tree.no_item");
    const { decorId, kind } = plant;
    const a = await pchestActor("tree-plant");
    if (isIslandMapId(a.mapId)) throw new Error("tree.island");
    const op = `tplant:${a.account}:${data.op}`;
    const again = await replayOf(op);
    if (again) return again;

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const pos = await playerCell(a.wallet);
    const [q, r] = [pos.q + data.dq, pos.r + data.dr];
    await requireNotVoid(a.wallet, a.mapId, q, r);

    const sql = plantTreeSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      decorId,
      kind,
      op,
      cost: TREE_PLANT_ENERGY,
    });
    let row: TreePlantRow | null = null;
    let failed: unknown = null;
    try {
      row = sqlRow<TreePlantRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = e;
    }
    if (row?.placed && !row.was) {
      const paid = Number(row.paid) || 0;
      if (paid > 0) {
        const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
        void noteEnergySpend(a.account, paid, "build");
      }
      await announce();
      return { ok: true, q, r };
    }
    // Повтор, пустой ответ или обрыв после коммита — судит ключ нажатия.
    const prev = await replayOf(op).catch(() => null);
    if (prev) return prev;
    if (failed) throw energyError(failed);
    const verdict = treePlantVerdict(row);
    if (verdict !== "ok") throw new Error(verdict);
    return { ok: true, q, r };
  });
