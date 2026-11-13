// Награды рейда, которые игрок ещё не забрал.
//
// Показываем их прямо на карте: награда за цель не начисляется молча — человек
// нажимает, видит, ЗА КОГО и что именно получает, забирает — и список пуст.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { requireWallet } from "../auth";
import { liveRewardSql } from "./raid-reward-live";
import { soonestExpiry } from "@/lib/rewardExpiry";

export type PendingReward = {
  kind: string;
  amount: number;
  packId: string | null;
  count: number;
  /**
   * Имя своего товара (kind='custom') или артефакта (kind='item'): без него
   * в списке была бы «cst_7ce4…», а 37 разных артефактов — одинаковым «предмет».
   */
  name?: string;
  /** Картинка справочника: два шаблона с одним именем различаются только ею. */
  image?: string | null;
  /**
   * Когда сгорит ближайшая награда группы (мс эпохи); null — бессрочные.
   * Срок есть у добычи разграбленного сундука (24 ч; захват снят 29.09 —
   * так дозревают записи прошлой редакции).
   */
  expiresAt?: number | null;
  /** Клад (kind='treasure', pack_id — id клада): что внутри — подпись и картинка строки. */
  prize?: { resource: string; token: string | null };
};
/** Награды одной цели: «Зимний Йети (1 Lv)» — лайки 25, GDarai 12.5, пак ×1. */
export type PendingSource = { source: string; place: number | null; rewards: PendingReward[] };

type RefMeta = { name: string; image: string | null };

/** Срок из базы в мс эпохи; нет срока или мусор — null. */
const expiryMs = (v: string | null | undefined): number | null => {
  const ms = v ? Date.parse(String(v)) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** Имя и картинка по id справочника для строк одного вида; нет строк — нет запроса. */
async function refMeta(
  rows: Array<{ reward_kind: string; pack_id: string | null }>,
  kind: string,
  select: string,
): Promise<Map<string, RefMeta>> {
  const ids = [
    ...new Set(rows.filter((r) => r.reward_kind === kind && r.pack_id).map((r) => r.pack_id!)),
  ];
  const out = new Map<string, RefMeta>();
  if (ids.length === 0) return out;
  const named = (await mcpExec(
    `${select} WHERE id IN (${ids.map((id) => sqlStr(id)).join(",")});`,
    {
      wrapJson: true,
    },
  ).catch(() => [])) as Array<{ id: string; name: string | null; image: string | null }>;
  for (const r of named ?? [])
    out.set(String(r.id), { name: String(r.name ?? ""), image: r.image ?? null });
  return out;
}

type TreasureMeta = RefMeta & { resource: string; token: string | null };

/** Призы кладов в очереди (§8.117): строка «Клад» показывает, что внутри. */
async function treasureMeta(
  rows: Array<{ reward_kind: string; pack_id: string | null }>,
): Promise<Map<string, TreasureMeta>> {
  const ids = [
    ...new Set(
      rows.filter((r) => r.reward_kind === "treasure" && r.pack_id).map((r) => r.pack_id!),
    ),
  ];
  const out = new Map<string, TreasureMeta>();
  if (ids.length === 0) return out;
  const got = (await mcpExec(
    `SELECT id, resource, token, name, image FROM yuplink.raid_treasure
      WHERE id IN (${ids.map((id) => sqlStr(id)).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<Record<string, string | null>>;
  for (const r of got ?? [])
    out.set(String(r.id), {
      name: String(r.name ?? ""),
      image: r.image ?? null,
      resource: String(r.resource),
      token: r.token ?? null,
    });
  return out;
}

/**
 * Непринятые награды АККАУНТА. Обычная функция, а не ручка: её зовёт и окно
 * «Добыча» (harvest-summary), а серверная функция изнутри другой серверной
 * функции не работает — вызов молча возвращал пустоту, и заваленный босс
 * выглядел как «наград нет».
 */
export async function pendingRaidRewardsFor(account: string): Promise<{
  rewards: PendingReward[];
  sources: PendingSource[];
  total: number;
}> {
  const list = sqlStr(account);

  const rows = (await mcpExec(
    `SELECT COALESCE(source_name, 'Рейд') AS source, min(place) AS place,
            reward_kind, pack_id, sum(reward_amount) AS amount, count(*)::int AS cnt,
            max(created_at) AS last_at, min(expires_at) AS expires_at
       FROM yuplink.raid_reward
      WHERE account_id = ${list} AND claimed_at IS NULL AND ${liveRewardSql()}
      GROUP BY COALESCE(source_name, 'Рейд'), reward_kind, pack_id
      ORDER BY max(created_at) DESC;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    source: string;
    place: number | null;
    reward_kind: string;
    pack_id: string | null;
    amount: number | string;
    cnt: number;
    expires_at: string | null;
  }>;

  // Свой товар и артефакт несут в pack_id id справочника — подпись и картинку
  // тянем одним запросом на вид: иначе в «Добыче» игрок читал бы «товар
  // cst_7ce4…», а все артефакты — одинаковым «предмет ×1».
  // Босс (промокод в «Добыче») — имя и картинка его шаблона.
  const [customMeta, itemMeta, bossMeta, prizeMeta] = await Promise.all([
    refMeta(rows ?? [], "custom", "SELECT id, name, image FROM yuplink.raid_custom_item"),
    refMeta(
      rows ?? [],
      "item",
      "SELECT id, name, image_url AS image FROM yuplink.mystic_item_template",
    ),
    refMeta(
      rows ?? [],
      "boss",
      "SELECT id, name, image_url AS image FROM yuplink.raid_boss_template",
    ),
    treasureMeta(rows ?? []),
  ]);

  // Плоский список для итога и разбивка по целям — для окна «за кого что».
  const rewards: PendingReward[] = [];
  const bySource = new Map<string, PendingSource>();
  for (const r of rows ?? []) {
    const meta =
      r.reward_kind === "custom"
        ? customMeta.get(r.pack_id ?? "")
        : r.reward_kind === "item"
          ? itemMeta.get(r.pack_id ?? "")
          : r.reward_kind === "boss"
            ? bossMeta.get(r.pack_id ?? "")
            : r.reward_kind === "treasure"
              ? prizeMeta.get(r.pack_id ?? "")
              : undefined;
    // Доля казино (§8.124) — золото: строка «Золото N» из источника «Казино».
    const prize =
      r.reward_kind === "treasure"
        ? prizeMeta.get(r.pack_id ?? "")
        : r.reward_kind === "casino_share"
          ? { resource: "gold", token: null }
          : undefined;
    const item: PendingReward = {
      kind: r.reward_kind,
      amount: Number(r.amount) || 0,
      packId: r.pack_id,
      count: Number(r.cnt) || 0,
      expiresAt: expiryMs(r.expires_at),
      ...(meta?.name ? { name: meta.name } : {}),
      ...(meta?.image ? { image: meta.image } : {}),
      ...(prize ? { prize: { resource: prize.resource, token: prize.token } } : {}),
    };
    const same = rewards.find((x) => x.kind === item.kind && x.packId === item.packId);
    if (same) {
      same.amount += item.amount;
      same.count += item.count;
      same.expiresAt = soonestExpiry(same.expiresAt, item.expiresAt);
    } else {
      rewards.push({ ...item });
    }
    const group = bySource.get(r.source);
    if (group) group.rewards.push(item);
    else
      bySource.set(r.source, {
        source: r.source,
        place: r.place == null ? null : Number(r.place),
        rewards: [item],
      });
  }

  return {
    rewards,
    sources: [...bySource.values()],
    total: rewards.reduce((sum, r) => sum + r.count, 0),
  };
}

export const getMyPendingRaidRewards = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  const { raidOwner } = await import("./beta-raid/owner");
  return pendingRaidRewardsFor(await raidOwner(wallet));
});
