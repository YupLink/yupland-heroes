// «Бросить» динамит из рюкзака (владелец, 22–23.10.2026; синий — 25.10; lib/dynamite): на
// клетку в радиусе 3 от героя, 100 энергии — «сначала списывается энергия,
// потом бросаешь». Энергия, минус штука и весь взрыв по 7 клеткам — одна
// функция базы под локами (raid_dynamite_blast, migrations/dynamite-01): отказ
// (нет энергии, нет динамита, далеко, купол, город) — исключение, назад уходит
// всё, не списано ничего. Повтор того же нажатия отвечает прошлым итогом без
// второй платы; ответ потерялся после коммита — судит ключ нажатия.
//
// Сразу после записи — экипаж взорванных синим кораблей в свой основной город
// (dynamite-crew-home: повтор нажатия доносит недонесённых), затем рассылка и
// награды (dynamite-announce): взрыв шахт, дельты карты, мешочки, корабли,
// поверженные и их награда по топу, как после удара.
//
// Красный в воду (30.10.2026) — рыбалка: шанс удочки на каждой клетке воды взрыва
// бросает сервер до вызова базы (dynamite-fish, зерно от ключа нажатия), всплывшее —
// мешочками-рыбами той же функцией базы; в ответе — сколько всплыло (тост).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { isIslandMapId } from "@/lib/raid/island/ids";
import {
  DYNAMITE_ENERGY,
  dynamiteKindOf,
  inThrowRange,
  type DynamiteSummary,
} from "@/lib/dynamite";
import { playerCell } from "@/server/api/beta-raid/encounter-where";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import type { GrantedReward } from "@/server/api/beta-raid/encounter-rewards";
import { blastDecor } from "@/server/api/beta-raid/dynamite/dynamite-decor";
import { blastFish } from "@/server/api/beta-raid/dynamite/dynamite-fish";
import { noteDynamiteCatch } from "@/server/api/beta-raid/dynamite/dynamite-fish-note";
import { announceBlast } from "@/server/api/beta-raid/dynamite/dynamite-announce";
import { sendCrewsHome } from "@/server/api/beta-raid/dynamite/dynamite-crew-home";
import {
  blastErrorKey,
  blastOf,
  blastOpSql,
  blastSql,
  summaryOfBlast,
  type BlastDetail,
  type BlastOpRow,
} from "@/server/api/beta-raid/dynamite/dynamite-sql";

const input = z.object({
  stackKey: z.string().min(1).max(200),
  /** Клетка падения (абсолютная): сервер сверит радиус от героя сам. */
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия второй раз не взрывает и не платит. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

/** Ответ окну: итог, клетки для правки своей карты и добыча бросившего. */
export type DynamiteThrown = DynamiteSummary & {
  ok: true;
  /** Клетки, где декор снят (своя карта — сразу, не дожидаясь дельты). */
  decorCells: Array<{ q: number; r: number }>;
  /** Клетки, где повержен верхний объект. */
  killedCells: Array<{ q: number; r: number }>;
  rewards: GrantedReward[];
};

/** Ключ нажатия или null — нажатия не было. Ошибку чтения не глотаем. */
async function loadOp(op: string): Promise<BlastOpRow | null> {
  const rows = (await mcpExec(blastOpSql(op), { wrapJson: true })) as BlastOpRow[] | null;
  return rows?.[0] ?? null;
}

function answer(d: BlastDetail, rewards: GrantedReward[]): DynamiteThrown {
  return {
    ok: true,
    ...summaryOfBlast(d),
    decorCells: d.decor.map((x) => ({ q: x.q, r: x.r })),
    killedCells: d.hits.filter((h) => h.killed && h.layer === 0).map((h) => ({ q: h.q, r: h.r })),
    rewards,
  };
}

export const throwDynamite = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<DynamiteThrown> => {
    const kind = dynamiteKindOf(data.stackKey);
    if (!kind) throw new Error("dynamite.no_item");
    const a = await pchestActor("dynamite");
    if (isIslandMapId(a.mapId)) throw new Error("dynamite.island");
    // Ключ повтора — в пределах аккаунта: чужой одинаковый op не мешает.
    const op = `dyn:${a.account}:${data.op}`;
    const prev = await loadOp(op);
    const done = prev ? blastOf(prev.detail) : null;
    if (done) {
      await sendCrewsHome({ op, mapId: a.mapId, detail: done });
      const rewards = prev?.sent
        ? []
        : await announceBlast({ mapId: a.mapId, wallet: a.wallet, op, detail: done });
      return answer(done, rewards);
    }

    const bp = await resolveBackpack(a.wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const pos = await playerCell(a.wallet);
    if (!inThrowRange(pos, data)) throw new Error("dynamite.far");
    const fishIn = await blastFish({
      mapId: a.mapId,
      at: data,
      kind,
      account: a.account,
      wallet: a.wallet,
      op,
    });
    const sql = blastSql({
      op,
      mapId: a.mapId,
      q: data.q,
      r: data.r,
      account: a.account,
      wallet: a.wallet,
      heroId: bp.heroId,
      stackKey: data.stackKey,
      cost: DYNAMITE_ENERGY,
      decor: await blastDecor(a.mapId, data, kind),
      kind,
      fish: fishIn,
    });

    let res: BlastDetail | null = null;
    try {
      const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ res?: unknown }> | null;
      res = blastOf(rows?.[0]?.res);
    } catch (e) {
      // Ответ потерялся после коммита — судит ключ: он лёг только вместе с делом.
      const row = await loadOp(op).catch(() => null);
      res = row ? blastOf(row.detail) : null;
      if (!res)
        throw new Error(blastErrorKey(e instanceof Error ? e.message : String(e), DYNAMITE_ENERGY));
    }
    if (!res) throw new Error("dynamite.busy");
    // Ключа до этого запроса не было — это первое нажатие, даже если база
    // ответила «повтор» (мост повторил наш же запрос вслепую).
    if (res.paid > 0) {
      const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
      void noteEnergySpend(a.account, res.paid, "other");
    }
    await sendCrewsHome({ op, mapId: a.mapId, detail: res });
    // Всплывшая рыба — улов бросившего: журнал и турнир «Улов» (повтор не задваивает).
    if (res.fish.length > 0)
      await noteDynamiteCatch({
        account: a.account,
        mapId: a.mapId,
        op,
        fishIn,
        spawned: res.fish,
      });
    const rewards = await announceBlast({ mapId: a.mapId, wallet: a.wallet, op, detail: res });
    return answer(res, rewards);
  });
