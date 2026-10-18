// Захват шахты: списать энергию (цена захвата), стать единственным владельцем.
// Открыт всем игрокам. Пендинг-модель: SQL raid_mine_capture в одной
// транзакции досчитывает прежнему хозяину целые незаклеймленные часы
// (raid_mine_credit), пишет строку в raid_mine_capture_log (секция «Шахты
// отбили» в «Добыче») и ставит новому секундомер с нуля.
//
// Владелец шахты = account_id (не кошелёк): деньги идут на учётку и переживают
// смену/детач коша; owner_account имеет смысл для raid_mine_state/начислений.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { loadCellBuilding } from "./building-action";
import { isBuilt } from "@/lib/buildingEffect";
import { cellMineConfig } from "@/lib/mineConfig";
import { accAccountId } from "../currency/move";
import { noteEnergySpend } from "./econ/energy-note";
import { requireMineGuardDefeated, clearDefeatedGuard } from "./mine-guard";
import { publishRaid } from "../../raidLive";

export const captureMine = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    // Захват шахты открыт всем игрокам: подошёл вплотную, заплатил энергией —
    // занял. Настройку шахты (что добывает, цена) правит только админ (в редакторе).
    const mapId = await myMapId(wallet);
    requireAdjacent(await playerCell(wallet), data.q, data.r);
    await requireNotVoid(wallet, mapId, data.q, data.r);

    const b = await loadCellBuilding(mapId, data.q, data.r);
    if (!b) throw new Error("Здесь нет постройки");
    if (b.effect !== "mine") throw new Error("Это не шахта");
    if (!isBuilt(b.tier, b.tiers.length)) throw new Error("Шахта ещё не построена");
    const cfg = cellMineConfig(b.config, b.meta);
    if (!cfg) throw new Error("Шахта не настроена — добыча не задана");

    const account = await accAccountId(wallet);
    if (!account) throw new Error("Нужен аккаунт — привяжи Telegram");

    // Жив охранник — сначала бой. Проверяем ДО списания энергии за захват,
    // чтобы заблокированный захват не съедал её впустую.
    await requireMineGuardDefeated(mapId, data.q, data.r);
    // Своя шахта — тоже ДО списания: гейт «нельзя захватить свою» жил только
    // на клиенте, и устаревшее окно (двойной тап, вторая вкладка) списывало
    // энергию за ничто. В SQL это же тихий no-op (без сброса секундомера):
    // исключение там нельзя — слепой ретрай моста после коммита получил бы
    // ошибку, энергия вернулась бы, и захват стал бы бесплатным.
    const owner = (await mcpExec(
      `SELECT owner_account FROM yuplink.raid_mine_state
        WHERE map_id=${sqlStr(mapId)} AND q=${data.q} AND r=${data.r};`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ owner_account: string | null }>;
    if (owner?.[0]?.owner_account === account) throw new Error("braid.mine_yours");

    // Энергия за захват (guarded, как шаг по карте). 0 — бесплатно.
    if (cfg.captureCost > 0) {
      const { error } = await sb.rpc("touch_energy_atomic", {
        p_wallet: wallet,
        p_spend: cfg.captureCost,
      });
      if (error) {
        if (String(error.message).includes("not_enough_energy"))
          throw new Error(`Не хватает энергии — на захват нужно ${cfg.captureCost}`);
        throw new Error(error.message);
      }
    }
    try {
      // settle-старому + журнал захвата + смена владельца + секундомер с нуля
      // (в SQL, атомарно; см. migrations/acc-48-mine-capture-log.sql).
      await mcpExec(
        `SELECT yuplink.raid_mine_capture(${sqlStr(mapId)}, ${data.q}, ${data.r}, ${sqlStr(account)}, ${sqlStr(wallet)});`,
      );
    } catch (e) {
      // Захват не прошёл — вернуть списанную энергию (best-effort).
      if (cfg.captureCost > 0) {
        try {
          await sb.rpc("add_energy", {
            p_wallet: wallet,
            p_amount: cfg.captureCost,
            p_kind: "mine_refund",
          });
        } catch {
          /* возврат энергии не критичен для отката владельца */
        }
      }
      throw e;
    }
    if (cfg.captureCost > 0) void noteEnergySpend(account, cfg.captureCost, "mine_capture");
    // Захват шахты стоит герою сытости, как бой (lib/hero/satiety).
    {
      const { moveSatiety } = await import("./hero-satiety");
      const { SATIETY_COST } = await import("@/lib/hero/satiety");
      await moveSatiety(wallet, -SATIETY_COST.mineCapture).catch(() => null);
    }
    // Захватили — поверженного охранника с клетки убираем (новый владелец
    // поставит своего). Только мёртвого: живого (если владелец успел поставить
    // в узкое окно) не трогаем.
    await clearDefeatedGuard(mapId, data.q, data.r);
    publishRaid({ mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    return { ok: true as const, resource: cfg.resource, captureCost: cfg.captureCost };
  });
