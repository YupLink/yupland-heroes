// «Забрать» гриб (DARAI, золотой, алмазный — lib/mushroomKinds) с карты в рюкзак
// (владелец, 22.10.2026; lib/daraiMine) —
// это и есть его захват: обычного захвата у грибов нет (mine-capture).
//
// Любой игрок, кроме хозяина, — за MUSHROOM_ENERGY энергии (владелец: «посадить
// или поднять гриб стоит 5 энергии»); раскиданные без хозяина — любой. Подойти
// вплотную, не под куполом, гриб жив; сытость — как за захват. Охраны на
// грибе нет (minebag-02 вернула её подарком); живая — след до выката: «сначала
// бой». Накопленное до этой минуты (целые часы) — прежнему хозяину строкой
// «Отбитых шахт» к «Забрать», не на счёт (minecap-01), ему же тост и письмо
// (mine-lost-notify). Поднявший этот гриб второй раз его не поднимет, пока его не
// поднимет и не посадит другой (отказ базы dmine_once).
//
// Всё остальное — одна функция базы raid_dmine_take под локами (migrations/
// mushroom-03, -04): жизнь вышла — «гриба нет», созревает (защита на час) —
// «Гриб ещё не созрел» до энергии, место — как у стопки (грибы вида лежат
// одной dmine:<вид>), энергия до выдачи; отказ — исключение, назад уходит всё,
// повтор того же нажатия отвечает прошлым итогом. Ответ потерялся после
// коммита — судит ключ нажатия. После записи — клетка всем (dmine-announce).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { actionGate } from "@/server/rateGate";
import { myMapId, playerCell, requireAdjacent } from "@/server/api/beta-raid/encounter-where";
import { requireNotVoid } from "@/server/api/beta-raid/voidGate";
import { loadCellBuilding } from "@/server/api/beta-raid/building-action";
import { accAccountId } from "@/server/api/currency/move";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { guardAlive, loadGuardRow } from "@/server/api/beta-raid/mine-guard-read";
import { isBuilt } from "@/lib/buildingEffect";
import { cellMineConfig } from "@/lib/mineConfig";
import { MUSHROOM_ENERGY, MUSHROOM_ITEM_NAMES } from "@/lib/daraiMine";
import { mushroomKindOf } from "@/lib/mushroomKinds";
import {
  takeDmineSql,
  takeErrorOf,
  takeResOf,
  type DmineTakeRes,
} from "@/server/api/beta-raid/dmine/dmine-take-sql";
import { announceDmine, loadDmineOp } from "@/server/api/beta-raid/dmine/dmine-announce";

const input = z.object({
  q: z.number().int(),
  r: z.number().int(),
  /** Ключ нажатия: повтор того же нажатия второй раз не берёт и не платит. */
  op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
});

export type DmineTaken = { ok: true; id: string; cost: number };

/** Сытость за взятие — как за захват шахты (lib/hero/satiety, остров ×0,1). */
async function spendSatiety(wallet: string, mapId: string): Promise<void> {
  const { moveSatiety } = await import("@/server/api/beta-raid/hero-satiety");
  const { SATIETY_COST } = await import("@/lib/hero/satiety");
  const { satietyMultOf, scaleSatiety } = await import("@/lib/raid/island/satiety");
  const cost = scaleSatiety(SATIETY_COST.mineCapture, satietyMultOf(mapId));
  await moveSatiety(wallet, -cost).catch(() => null);
}

export const takeDaraiMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<DmineTaken> => {
    const wallet = await requireBetaRaid();
    await actionGate("dmine-take", wallet);
    const mapId = await myMapId(wallet);
    const { q, r } = data;
    const account = await accAccountId(wallet).catch(() => null);
    if (!account) throw new Error("market.need_account");
    const op = `dmtake:${account}:${data.op}`;

    // Повтор уже сделанного нажатия: шахта в рюкзаке, клетка пуста — тот же ответ,
    // без второй сытости и второй заметки о трате.
    const prev = await loadDmineOp(op);
    if (prev) {
      if (!prev.sent) await announceDmine(prev);
      return { ok: true, id: prev.dmine_id, cost: Number(prev.paid) || 0 };
    }

    requireAdjacent(await playerCell(wallet), q, r);
    await requireNotVoid(wallet, mapId, q, r);
    const b = await loadCellBuilding(mapId, q, r);
    if (!b) throw new Error("dmine.gone");
    if (b.effect !== "mine") throw new Error("Это не шахта");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Шахта ещё не построена");
    const cfg = cellMineConfig(b.config, b.meta);
    const kind = mushroomKindOf(b.config);
    if (!cfg || !kind) throw new Error("dmine.not_darai");
    const cost = MUSHROOM_ENERGY;

    // До списания: хозяин свою не поднимает; живая охрана (след до выката) — бой.
    const { loadMineCell } = await import("@/server/api/beta-raid/mine-v2-read");
    if ((await loadMineCell(mapId, q, r)).owner === account) throw new Error("dmine.own");
    if (guardAlive(await loadGuardRow(mapId, q, r))) throw new Error("braid.mine_guarded");
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("market.backpack_no_hero");

    const sql = takeDmineSql({
      op,
      mapId,
      q,
      r,
      account,
      wallet,
      heroId: bp.heroId,
      capacity: bp.capacity,
      cost,
      name: MUSHROOM_ITEM_NAMES[kind],
    });
    let res: DmineTakeRes | null = null;
    try {
      res = takeResOf(await mcpExec(sql, { wrapJson: true }));
    } catch (e) {
      // Ответ потерялся после коммита — судит ключ: он лёг только вместе с делом.
      const done = await loadDmineOp(op).catch(() => null);
      if (!done) throw takeErrorOf(e, cost);
      res = { was: true, id: done.dmine_id, paid: Number(done.paid) || 0 };
    }
    if (!res) {
      const done = await loadDmineOp(op);
      if (!done) throw new Error("chest.busy");
      res = { was: true, id: done.dmine_id, paid: Number(done.paid) || 0 };
    }
    // Ключа до этого запроса не было (проверено в начале) — это первое нажатие,
    // даже если база ответила «повтор»: мост повторил наш же запрос вслепую.
    if (res.paid > 0) {
      const { noteEnergySpend } = await import("@/server/api/beta-raid/econ/energy-note");
      void noteEnergySpend(account, res.paid, "mine_capture");
    }
    await spendSatiety(wallet, mapId);
    void import("@/server/api/beta-raid/mine-lost/mine-lost-notify")
      .then((m) => m.kickMineLostNotify())
      .catch(() => {});
    const row = await loadDmineOp(op).catch(() => null);
    if (row && !row.sent) await announceDmine(row);
    return { ok: true, id: res.id, cost: res.paid };
  });
