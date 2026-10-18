// Закрытие старых рейдов — разовая операция перед переходом на гекс-карту.
//
// Делается на сервере (а не скриптом с ноутбука): здесь под рукой и база, и
// вся логика раздачи наград.
//
// Порядок: раздать награды за текущий цикл каждой активной локации → погасить
// локации → переключить игру на гекс-карту.
//
// Незабранные награды НЕ зачисляем молча: игрок должен увидеть, что именно ему
// досталось. Они ждут его на новой карте — кнопкой «Забрать награды» сверху.
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { liveRewardSql } from "./raid-reward-live";
import { distributeRaidRewards } from "./raid-distribute";
import { grantRaidReward } from "./raid-helpers";
import { dropRaidModeCache, LEGACY_RAIDS_KEY } from "./raid-mode";

export type FinishPlan = {
  locations: Array<{ id: string; name: string; cycle: number; participants: number }>;
  unclaimed: number;
};

/** Что будет сделано: локации с участниками текущего цикла и хвост наград. */
export async function planRaidFinish(): Promise<FinishPlan> {
  const rows = (await mcpExec(
    `SELECT l.id, l.name, l.cycle_no,
            (SELECT count(DISTINCT r.account_id)
               FROM yuplink.chip_boss_run r
               LEFT JOIN yuplink.users u ON u.wallet = r.wallet
              WHERE r.raid_location_id = l.id AND r.raid_cycle_no = l.cycle_no)::int AS participants
       FROM yuplink.raid_location l WHERE l.active ORDER BY participants DESC;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; cycle_no: number; participants: number }>;

  const pending = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.raid_reward
      WHERE claimed_at IS NULL AND ${liveRewardSql()};`,
    { wrapJson: true },
  )) as Array<{ n: number }>;

  return {
    locations: (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      cycle: Number(r.cycle_no),
      participants: Number(r.participants),
    })),
    unclaimed: Number(pending?.[0]?.n ?? 0),
  };
}

export type FinishResult = {
  closed: Array<{ name: string; recipients: number }>;
  /** Сколько наград осталось ждать игроков — они заберут их сами. */
  pending: number;
};

/** Выполнить закрытие. Идемпотентно: повторный запуск ничего не задвоит. */
export async function runRaidFinish(): Promise<FinishResult> {
  const plan = await planRaidFinish();
  const closed: FinishResult["closed"] = [];

  for (const loc of plan.locations) {
    const recipients = await distributeRaidRewards(loc.id, loc.cycle).catch((e) => {
      console.warn("[raid-finish] раздача не прошла", loc.name, e);
      return 0;
    });
    await pg.raidLocation.update({ id: loc.id }, { active: false });
    closed.push({ name: loc.name, recipients });
  }

  await pg.settings.upsert({ key: LEGACY_RAIDS_KEY, value: "false" }, { onConflict: "key" });
  // Переключатель читается из кэша (полминуты) — сбрасываем сами, иначе рейд
  // ещё полминуты считался бы «старым» и гекс-карта не открылась бы всем.
  dropRaidModeCache();

  const { sendTgMessageToAdmins } = await import("../tg");
  await sendTgMessageToAdmins(
    `🏁 Старые рейды закрыты: локаций ${closed.length}, наград роздано по топам ` +
      `${closed.reduce((sum, c) => sum + c.recipients, 0)}. ` +
      `Игроки заберут их на новой карте. Рейдом стала гекс-карта.`,
  ).catch(() => {});

  return { closed, pending: plan.unclaimed };
}
