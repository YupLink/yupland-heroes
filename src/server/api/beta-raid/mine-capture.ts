// Захват шахты: списать энергию (цена захвата), стать единственным владельцем.
// Открыт всем игрокам. Пендинг-модель: SQL raid_mine_capture в одной
// транзакции считает прежнему хозяину целые незаклеймленные часы и пишет их
// строкой raid_mine_capture_log — НЕ на счёт: они ждут его «Забрать» в блоке
// «Отбитые шахты» «Добычи» (владелец, 23.10.2026; minecap-01). Новому —
// секундомер с нуля. Прежнему — тост и письмо бота (mine-lost-notify).
//
// Владелец шахты = account_id (не кошелёк): деньги идут на учётку и переживают
// смену/детач коша; owner_account имеет смысл для raid_mine_state/начислений.
//
// Шахты v2 (§8.59): перехват не трогает режим и запас службы; сломанную или
// ничью v2 боем не взять — только починкой (mine-v2.ts), отказ — до списания
// энергии, а гонку с поломкой ловит SQL ('mine_broken').
// На острове новичка энергия на захват — вдвое меньше (lib/raid/island/energy).
// DARAI-шахту не захватывают: «Забрать в рюкзак» и есть её захват (dmine-take).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { captureMineSql } from "./mine-capture-sql";
import { sqlRow } from "./chest/chest-row";
import { loadMineCell, mineV2ErrorKey } from "./mine-v2-read";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { loadCellBuilding } from "./building-action";
import { isBuilt } from "@/lib/buildingEffect";
import { cellMineConfig } from "@/lib/mineConfig";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import { accAccountId } from "../currency/move";
import { noteEnergySpend } from "./econ/energy-note";
import { requireMineGuardDefeated, clearDefeatedGuard } from "./mine-guard";
import { isMushroomConfig } from "@/lib/mushroomKinds";
import { publishRaid } from "../../raidLive";
import { WARD_LOCKED } from "@/lib/mineWard";
import { mineWardLeft } from "./mine-ward/mine-ward-read";

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
    // DARAI-шахту не захватывают — её забирают в рюкзак (dmine-take), до энергии.
    if (isMushroomConfig(b.config)) throw new Error("dmine.capture_is_take");
    const captureCost = scaleEnergy(cfg.captureCost, energyMultOf(mapId));

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
    const cell = await loadMineCell(mapId, data.q, data.r);
    if (cell.view?.broken) throw new Error("braid.mine_broken");
    if (cell.owner === account) throw new Error("braid.mine_yours");
    // Замок шахтёра (§8.123) — тоже до энергии; охрану снести можно, захватить нет.
    if ((await mineWardLeft(mapId, data.q, data.r)) > 0) throw new Error(WARD_LOCKED);

    // Энергия за захват (guarded, как шаг по карте). 0 — бесплатно.
    if (captureCost > 0) {
      const { error } = await sb.rpc("touch_energy_atomic", {
        p_wallet: wallet,
        p_spend: captureCost,
      });
      if (error) {
        if (String(error.message).includes("not_enough_energy"))
          throw new Error(`Не хватает энергии — на захват нужно ${captureCost}`);
        throw new Error(error.message);
      }
    }
    try {
      // settle-старому + журнал захвата + смена владельца + секундомер с нуля
      // (в SQL, атомарно; см. migrations/acc-48-mine-capture-log.sql) — под
      // локом шахты и только пока она на клетке (mine-capture-sql).
      const at = { mapId, q: data.q, r: data.r, account, wallet, buildingId: b.buildingId };
      const row = sqlRow<{ captured?: boolean; locked?: boolean }>(
        (await mcpExec(captureMineSql(at))) as unknown[],
      );
      // Замок встал после проверки выше — захвата нет, энергия вернётся.
      if (row?.locked === true) throw new Error(WARD_LOCKED);
      // Шахту успели забрать в рюкзак (DARAI) — захватывать нечего.
      if (row?.captured !== true) throw new Error("dmine.gone");
    } catch (e) {
      // Захват не прошёл — вернуть списанную энергию (best-effort).
      if (captureCost > 0) {
        try {
          await sb.rpc("add_energy", {
            p_wallet: wallet,
            p_amount: captureCost,
            p_kind: "mine_refund",
          });
        } catch {
          /* возврат энергии не критичен для отката владельца */
        }
      }
      // Сломалась между проверкой и захватом — понятный текст, не код базы.
      throw new Error(mineV2ErrorKey(e instanceof Error ? e.message : String(e)));
    }
    if (captureCost > 0) void noteEnergySpend(account, captureCost, "mine_capture");
    // Захват шахты стоит герою сытости, как бой (lib/hero/satiety), на острове ×0,1.
    {
      const { moveSatiety } = await import("./hero-satiety");
      const { SATIETY_COST } = await import("@/lib/hero/satiety");
      const { satietyMultOf, scaleSatiety } = await import("@/lib/raid/island/satiety");
      const cost = scaleSatiety(SATIETY_COST.mineCapture, satietyMultOf(mapId));
      await moveSatiety(wallet, -cost).catch(() => null);
    }
    // Захватили — поверженного охранника с клетки убираем (новый владелец
    // поставит своего). Только мёртвого: живого (если владелец успел поставить
    // в узкое окно) не трогаем.
    await clearDefeatedGuard(mapId, data.q, data.r);
    publishRaid({ mapId, type: "built", mine: true, cells: [`${data.q},${data.r}`] });
    // Прежнему хозяину — тост и письмо через несколько секунд (пачкой), в фоне.
    void import("./mine-lost/mine-lost-notify").then((m) => m.kickMineLostNotify()).catch(() => {});
    return { ok: true as const, resource: cfg.resource, captureCost };
  });
