import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { distributeRaidRewards } from "./raid-distribute";
import { grantRaidReward } from "./raid-helpers";
import { grantRow, runRewardClaim, type ClaimRow } from "./raid-claim-run";
import { groupWhereSql, rewardGroupInput, type RewardGroup } from "./raid-claim-group";
import { liveRewardSql, rewardOriginSql } from "./raid-reward-live";

type ClaimResponse = {
  ok: true;
  claimed: number;
  empty: boolean;
  summary: Record<string, number>;
  warnings: string[];
  /** Сколько строк было в выборке и сколько осталось ждать после цикла. */
  total: number;
  left: number;
};

const EMPTY: ClaimResponse = {
  ok: true,
  claimed: 0,
  empty: true,
  summary: {},
  warnings: [],
  total: 0,
  left: 0,
};

/**
 * Забрать очередь аккаунта — всю или одну группу (kind + pack_id).
 *
 * Доставка та же, что была: take (CAS от двойного тапа) → grant → release при
 * бытовом отказе. Новое здесь — только фильтр по группе и порядок: раньше
 * строки шли порядком кучи, и в полный рюкзак влезало «что попало»; теперь
 * старые первыми — самая залежавшаяся награда уезжает раньше свежей.
 * Сгоревшую (срок вышел, raid-reward-live.ts) не выдаём и не считаем, а
 * награды со сроком идут первыми: иначе полный рюкзак дожидался бы их сгорания.
 */
async function claimPending(wallet: string, group?: RewardGroup): Promise<ClaimResponse> {
  const { raidOwner } = await import("./beta-raid/owner");
  const account = await raidOwner(wallet);
  const where = `account_id = ${sqlStr(account)} AND claimed_at IS NULL AND ${liveRewardSql()}${groupWhereSql(group)}`;
  // origin — с какой меткой свой товар ляжет в рюкзак (см. ClaimRow.origin).
  const cands = (await mcpExec(
    `SELECT id, reward_kind, reward_amount, pack_id, location_id AS raid_location_id, cycle_no AS raid_cycle_no,
            ${rewardOriginSql("raid_reward")} AS origin
       FROM yuplink.raid_reward
      WHERE ${where}
      ORDER BY expires_at NULLS LAST, created_at, id;`,
    { wrapJson: true },
  )) as ClaimRow[];
  // Пусто с самого начала — это НЕ ошибка. Баннер держит награду в кэше до
  // минуты и мог показать уже забранную: игрок жмёт, а забирать нечего.
  // Грубое «Нет наград к получению» читается как «не могу забрать своё».
  // Отвечаем мягко: клиент погасит баннер и покажет нейтральное «уже забрано».
  if (cands.length === 0) return EMPTY;

  // Свой товар едет в рюкзак ВЫБРАННОГО героя; героя нет — не доедет ни одна
  // строка. Проверяем один раз до цикла: иначе группа в 349 «Хлебов» гоняла
  // бы take → need_hero → release по каждой строке ради того же красного тоста.
  if (group?.kind === "custom") {
    const { resolveBackpack } = await import("./beta-raid/market-backpack");
    if (!(await resolveBackpack(wallet)))
      return {
        ...EMPTY,
        empty: false,
        warnings: ["market.need_hero"],
        total: cands.length,
        left: cands.length,
      };
  }

  // Цикл с зависимостями — в raid-claim-run: там же правило, по которому
  // недоставленная награда откладывается, а не рушит весь клейм.
  const { credited, summary, warnings } = await runRewardClaim(cands, {
    take: async (r) => {
      const won = (await mcpExec(
        `UPDATE yuplink.raid_reward SET claimed_at=now()
            WHERE id=${sqlStr(r.id)} AND claimed_at IS NULL AND ${liveRewardSql()} RETURNING id;`,
        { wrapJsonCte: true },
      )) as Array<{ id: string }>;
      return !!won && won.length > 0;
    },
    release: async (r) => {
      await mcpExec(`UPDATE yuplink.raid_reward SET claimed_at=NULL WHERE id=${sqlStr(r.id)};`);
    },
    grant: grantRow(grantRaidReward, wallet),
  });

  // Все строки уже перехватил параллельный запрос (take=false на каждой) —
  // значит их забирают прямо сейчас другим заходом. Тоже не ошибка: мягко
  // гасим. А вот отложенную награду гасить нельзя: она осталась в очереди,
  // и игрок должен прочитать, чего ей не хватило.
  if (credited === 0 && warnings.length === 0) return EMPTY;

  // «Что осталось» считаем по базе, а не как total − claimed: параллельный
  // «Забрать всё» с другого устройства уносит строки, и разность врала бы.
  const rest = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.raid_reward WHERE ${where};`,
    {
      wrapJson: true,
    },
  ).catch(() => [])) as Array<{ n: number }>;
  const left = Number(rest?.[0]?.n) || 0;
  return {
    ok: true,
    claimed: credited,
    empty: false,
    summary,
    warnings,
    total: cands.length,
    left,
  };
}

/** Награды карты: боссы, сундуки, рейд — очередь одна. */
export const claimRaidRewards = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = requireWallet();
  return claimPending(wallet);
});

/**
 * Забрать все ожидающие награды ОДНОГО типа. Ключ группы тот же, что у
 * строки в окне «Добыча»; что не влезло — вернулось в очередь с причиной в
 * warnings, остаток — в left.
 */
export const claimRaidRewardGroup = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => rewardGroupInput.parse(d))
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    return claimPending(wallet, data);
  });

export async function closeRaidCycle(
  locationId: string,
): Promise<{ recipients: number; cycle: number } | null> {
  const loc = await pg.raidLocation.findOne({ id: locationId });
  if (!loc) return null;
  const cycle = loc.cycle_no;
  const recipients = await distributeRaidRewards(locationId, cycle);
  await mcpExec(
    `UPDATE yuplink.chip_boss SET current_hp=max_hp, killed_at=NULL
      WHERE raid_node_id IN (SELECT id FROM yuplink.raid_node WHERE location_id=${sqlStr(
        locationId,
      )});`,
  );
  await mcpExec(
    `UPDATE yuplink.raid_current SET location_id=NULL, updated_at=now()
      WHERE location_id=${sqlStr(locationId)};`,
  ).catch(() => {});
  await pg.raidLocation.update(
    { id: locationId },
    { cycle_no: cycle + 1, cycle_started_at: new Date().toISOString() },
  );
  try {
    const { sendTgMessageToAdmins } = await import("../tg");
    await sendTgMessageToAdmins(
      `🗺️ Рейд «${loc.name}»: цикл ${cycle} закрыт, награды розданы (получателей ${recipients}), боссы отхилены.`,
    );
  } catch {
    /* noop */
  }
  return { recipients, cycle };
}
