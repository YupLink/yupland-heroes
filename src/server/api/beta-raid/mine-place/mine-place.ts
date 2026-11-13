// Поставить шахту по своему чертежу (ПРАВИЛА §8.59 п. 8, владелец 21.10.2026):
// чертёж кладут в режиме стройки (mine-plan), потом к нему подходят — герой на
// клетке чертежа или рядом — и ставят шахту за энергию (столько же, сколько стоит
// её захват; усиленный чертёж — lib/mineBoost — дороже и то, и другое). Лесопилка, каменная, золотая или алмазная;
// золотая и алмазная — только на жилу своего вида. Шахта сразу твоя: режим
// «база», запас службы 100 %, добыча — с этой минуты. Охраны нет.
//
// Проверки клетки, постройка, хозяин, списание заготовки и энергии, чертёж и
// ключ нажатия — один оператор (mine-place-sql); отказ приходит им же, нехватка
// энергии откатывает всё. После записи — дельта клетки всем (журнал карты,
// словарь постройки) и 'built' с хозяином: до этой минуты шахту не видел никто,
// кроме хозяина чертежа. Ключ отмечается разосланным, только когда дельта
// записалась (mine-place-announce), иначе её дошлёт повтор нажатия или минутный
// цикл (mine-place-resend). Повтор того же нажатия вторую шахту не ставит и
// второй раз не платит. На острове новичка шахты из заготовок не ставят.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import type { PlaceableBlueprint } from "@/lib/minePlacement";
import { boostedCaptureCost } from "@/lib/mineBoost";
import { hexDist } from "@/lib/mineBuild";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { placeMineSql, type PlaceMineRow } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import {
  placeOpSql,
  placeOpSweepSql,
  type PlaceOpRow,
} from "@/server/api/beta-raid/mine-place/mine-place-op-sql";
import { placeVerdict } from "@/server/api/beta-raid/mine-place/mine-place-verdict";
import { blueprintKind } from "@/server/api/beta-raid/mine-place/mine-place-kind";
import {
  planReadSql,
  planViewOf,
  type MinePlanRow,
} from "@/server/api/beta-raid/mine-place/mine-plan-sql";
import type { PlacedOp } from "@/server/api/beta-raid/mine-place/mine-place-announce";

const input = z.object({
  /** Ключ нажатия: повтор того же нажатия вторую шахту не ставит и не платит. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  /** Цена постановки, что видел игрок: усилил чертёж после — отказ с новой ценой. */
  energy: z.number().int().min(0).optional(),
});

type Placed = { ok: true; q: number; r: number; kind: PlaceableBlueprint };

/** Постановка этого нажатия или null — нажатия не было. Ошибку чтения не глотаем. */
async function opAt(op: string): Promise<PlacedOp | null> {
  const { placedOpOf } = await import("@/server/api/beta-raid/mine-place/mine-place-announce");
  const rows = (await mcpExec(placeOpSql(op), { wrapJson: true })) as PlaceOpRow[] | null;
  return placedOpOf(rows?.[0]);
}

/** Разослать постановку и отметить ключ (сбой — дошлёт цикл, ответ игроку тот же). */
async function announce(p: Omit<PlacedOp, "sent">): Promise<void> {
  const { announcePlaced } = await import("@/server/api/beta-raid/mine-place/mine-place-announce");
  await announcePlaced(p);
}

/** Повтор уже поставленного нажатия: дошлём, если не разослано, и ответим тем же. */
async function replay(prev: PlacedOp): Promise<Placed> {
  if (!prev.sent) await announce(prev);
  return { ok: true, q: prev.q, r: prev.r, kind: prev.kind };
}

/** Нехватка энергии — понятным ключом с ценой; прочие сбои — как есть. */
const energyError = (e: unknown, need: number): unknown =>
  /not_enough_energy/.test(e instanceof Error ? e.message : String(e))
    ? new Error(`mineplace.no_energy|${JSON.stringify({ need })}`)
    : e;

export const placeMineBlueprint = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<Placed> => {
    const a = await pchestActor("mine-place");
    if (isIslandMapId(a.mapId)) throw new Error("mineplace.island");
    const op = `mplace:${a.account}:${data.op}`;
    const rows = (await mcpExec(planReadSql(a.account), { wrapJson: true })) as
      | MinePlanRow[]
      | null;
    const plan = planViewOf(rows?.[0], a.mapId);
    if (!plan) {
      // Чертёж стёрла сама постановка — это повтор того же нажатия.
      const prev = await opAt(op);
      if (prev) return replay(prev);
      throw new Error("mineplace.no_plan");
    }
    const kind = await blueprintKind(plan.stackKey);
    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");

    const { q, r } = plan;
    if (hexDist(await playerCell(a.wallet), plan) > 1) throw new Error("mineplace.far");
    await requireNotVoid(a.wallet, a.mapId, q, r);

    // Проход не проверяем (владелец, 22.10.2026: «если шахта преградит путь —
    // то и пусть — давать размещать её и всё»).
    // Усиленный чертёж (lib/mineBoost): захват дороже — и постановка тоже.
    const { mineBoostLevel } = await import("@/server/api/castle-architect/mine-boost-sql");
    const energy = boostedCaptureCost(kind, await mineBoostLevel(a.account, kind));
    if (data.energy !== undefined && data.energy !== energy) {
      throw new Error(`mineplace.energy_changed|${JSON.stringify({ need: energy })}`);
    }
    const sql = placeMineSql({
      mapId: a.mapId,
      q,
      r,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      stackKey: plan.stackKey,
      kind,
      op,
      energy,
      captureCost: energy,
    });
    let row: PlaceMineRow | null = null;
    let failed: unknown = null;
    try {
      row = sqlRow<PlaceMineRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = energyError(e, energy);
    }
    if (row?.placed) {
      await announce({ op, mapId: a.mapId, q, r, kind, here: true });
      void mcpExec(placeOpSweepSql()).catch(() => {});
      if (Number(row.paid) > 0) {
        const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
        void noteEnergySpend(a.account, energy, "build");
      }
      return { ok: true, q, r, kind };
    }

    // Повтор нажатия, пустой ответ или обрыв после коммита — судит ключ: он лёг
    // только с шахтой (и с платой). Первый не разослал — досылаем сейчас.
    const prev = row && !row.was ? null : await opAt(op);
    if (prev) return replay(prev);
    if (failed) throw failed;
    const verdict = placeVerdict(row, kind);
    if (verdict !== "ok") throw new Error(verdict);
    return { ok: true, q, r, kind };
  });
