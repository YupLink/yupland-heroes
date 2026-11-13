// «Посадить» гриб из рюкзака (владелец, 22.10.2026; lib/daraiMine): на свою или
// соседнюю клетку по правилам постановки шахт v2 (§8.59 п. 8 — клетка, дорога,
// игрок, мешочек; природа и жила не нужны; проход не проверяем — владелец:
// «если шахта преградит путь — то и пусть»). Вид — по стопке рюкзака. Стоит
// MUSHROOM_ENERGY энергии — тем же оператором, только вместе с грибом. Встаёт гриб с
// ближайшим выпадением; работает у посадившего с этой минуты, с прежними
// настройками и пределом часов до конца жизни. Карта — та, где стоит герой:
// любой мир и этаж, кроме острова новичка (как заготовки, §8.59 п. 11).
//
// Проверки клетки, энергия, постройка, хозяин, минус штука из стопки и ключ
// нажатия — один оператор (dmine-place-sql). После записи — дельта клетки
// всем (dmine-announce). Повтор того же нажатия второй гриб не ставит и
// энергию второй раз не берёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { isPlaceDir } from "@/lib/plainChest";
import { MUSHROOM_ENERGY } from "@/lib/daraiMine";
import { mushroomKindOfStack } from "@/lib/mushroomKinds";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import {
  dminePlaceVerdict,
  placeDmineSql,
  type DminePlaceRow,
} from "@/server/api/beta-raid/dmine/dmine-place-sql";
import { announceDmine, loadDmineOp } from "@/server/api/beta-raid/dmine/dmine-announce";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  /** Куда: 0,0 — под себя, иначе одна из шести соседних клеток. */
  dq: z.number().int().min(-1).max(1),
  dr: z.number().int().min(-1).max(1),
  /** Ключ нажатия: повтор того же нажатия второй гриб не ставит. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type DminePlaced = { ok: true; q: number; r: number };

/** Повтор уже поставленного нажатия: дошлём, если не разослано, и ответим тем же. */
async function replayOf(op: string): Promise<DminePlaced | null> {
  const prev = await loadDmineOp(op);
  if (!prev) return null;
  if (!prev.sent) await announceDmine(prev);
  return { ok: true, q: Number(prev.q), r: Number(prev.r) };
}

/** Нехватка энергии — понятным ключом с ценой; прочие сбои — как есть. */
const energyError = (e: unknown): unknown =>
  /not_enough_energy/.test(e instanceof Error ? e.message : String(e))
    ? new Error(`mineplace.no_energy|${JSON.stringify({ need: MUSHROOM_ENERGY })}`)
    : e;

export const placeDaraiMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<DminePlaced> => {
    if (!isPlaceDir(data.dq, data.dr)) throw new Error("pchest.place_far");
    const kind = mushroomKindOfStack(data.stackKey);
    if (!kind) throw new Error("dmine.no_item");
    const a = await pchestActor("dmine-place");
    if (isIslandMapId(a.mapId)) throw new Error("dmine.island");
    const op = `dmplace:${a.account}:${data.op}`;
    const again = await replayOf(op);
    if (again) return again;

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const pos = await playerCell(a.wallet);
    const [q, r] = [pos.q + data.dq, pos.r + data.dr];
    await requireNotVoid(a.wallet, a.mapId, q, r);

    const sql = placeDmineSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      op,
      kind,
      cost: MUSHROOM_ENERGY,
    });
    let row: DminePlaceRow | null = null;
    let failed: unknown = null;
    try {
      row = sqlRow<DminePlaceRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = e;
    }
    if (row?.placed && !row.was) {
      const paid = Number(row.paid) || 0;
      if (paid > 0) {
        const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
        void noteEnergySpend(a.account, paid, "build");
      }
      const fresh = await loadDmineOp(op).catch(() => null);
      if (fresh) await announceDmine(fresh);
      return { ok: true, q, r };
    }
    // Повтор, пустой ответ или обрыв после коммита — судит ключ нажатия.
    const prev = await replayOf(op).catch(() => null);
    if (prev) return prev;
    if (failed) throw energyError(failed);
    const verdict = dminePlaceVerdict(row);
    if (verdict !== "ok") throw new Error(verdict);
    return { ok: true, q, r };
  });
