// Храм замка (владелец, 07.10.2026): чтение, улучшение (до 100), молитва.
// Правила — lib/castleTemple.ts; деньги и баффы двигают SQL-функции под замком
// аккаунта (migrations/temple-01). Игровые действия доступны вошедшим игрокам.
// С 22.10.2026 Храм покупается в Ратуше (§8.64, castle_building kind 'temple');
// улучшать и молиться — только владельцу. Альфа-тестерам, улучшавшим храм,
// он выдан миграцией townhall-01. Владение не отнимается — проверка до вызова
// функции базы гонок не даёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { raidOwner } from "./beta-raid/owner";
import { TEMPLE_KIND } from "@/lib/townHallCatalog";
import {
  COOLDOWN_HOURS,
  EXTEND_STARS,
  MAX_LEVEL,
  TEMPLE_STATS,
  levelPoints,
  prayerPlan,
  slotsAt,
  upgradeCost,
} from "@/lib/castleTemple";

type Row = { level: number | null; last_prayer_at: string | null; owned: boolean };
type TempleRow = { level: number; lastPrayer: number | null; owned: boolean };

async function loadRow(account: string): Promise<TempleRow> {
  const a = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT t.level, t.last_prayer_at,
            EXISTS (SELECT 1 FROM yuplink.castle_building b
                     WHERE b.account_id = ${a} AND b.kind = ${sqlStr(TEMPLE_KIND)}) AS owned
       FROM (SELECT 1) one
       LEFT JOIN yuplink.castle_temple t ON t.account_id = ${a};`,
    { wrapJson: true },
  )) as Row[];
  const r = rows?.[0];
  return {
    level: Math.min(MAX_LEVEL, Math.max(1, Number(r?.level ?? 1))),
    lastPrayer: r?.last_prayer_at ? Date.parse(r.last_prayer_at) : null,
    owned: r?.owned === true,
  };
}

/** Храм не куплен — ни улучшить, ни помолиться. */
const NOT_OWNED = "Храма нет — купи его в Ратуше замка";

async function loadResources(account: string): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT resource, amount FROM yuplink.account_resources WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ resource: string; amount: number }>;
  return Object.fromEntries((rows ?? []).map((r) => [r.resource, Number(r.amount) || 0]));
}

async function who() {
  const wallet = await requireWallet();
  return { wallet, account: await raidOwner(wallet) };
}

/** «Подожди N» из ошибки SQL (секунды) — человеческим текстом. */
function waitText(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

function humanTempleError(msg: string): string {
  const cd = msg.match(/temple_cooldown:(\d+)/);
  if (cd) return `Следующая молитва через ${waitText(Number(cd[1]))}`;
  if (/temple_level_moved/.test(msg)) return "Уровень храма уже изменился — обнови окно";
  if (/temple_max_level/.test(msg)) return `Храм уже ${MAX_LEVEL}-го уровня — это потолок`;
  if (/res_move: в минус/.test(msg)) return "Не хватает ресурсов на улучшение";
  const ne = msg.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
  if (ne) return `Не хватает ${ne[1] === "STARS" ? "звёзд" : ne[1]}: нужно ${Number(ne[3])}, есть ${Number(ne[2])}`;
  return msg || "Не удалось";
}

export const getCastleTemple = createServerFn({ method: "GET" }).handler(async () => {
  const { wallet, account } = await who();
  const [row, resources, home] = await Promise.all([
    loadRow(account),
    loadResources(account),
    import("./beta-raid/home-castle").then((m) => m.homeCastleStatus(wallet)).catch(() => null),
  ]);
  return {
    /** Храм куплен (или выдан альфа-тестеру); нет — окно предлагает купить. */
    owned: row.owned,
    level: row.level,
    maxLevel: MAX_LEVEL,
    /** Сила каждого бонуса при выборе: уровень × базовое значение за очко. */
    points: levelPoints(row.level),
    slots: slotsAt(row.level),
    cost: upgradeCost(row.level),
    resources,
    /** Когда снова можно молиться (мс), null — уже можно. */
    prayAt: row.lastPrayer && row.lastPrayer + COOLDOWN_HOURS * 3600_000 > Date.now()
      ? row.lastPrayer + COOLDOWN_HOURS * 3600_000
      : null,
    atCastle: !!home?.here,
    extendStars: EXTEND_STARS,
  };
});

export const upgradeCastleTemple = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ fromLevel: z.number().int().min(1), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { account } = await who();
    if (!(await loadRow(account)).owned) throw new Error(NOT_OWNED);
    const cost = upgradeCost(data.fromLevel);
    if (!cost) throw new Error(`Храм уже ${MAX_LEVEL}-го уровня — это потолок`);
    const { error, data: rows } = await sb.rpc("castle_temple_upgrade", {
      p_account: account,
      p_from: data.fromLevel,
      p_cost: cost,
      p_op: `up:${account}:${data.opId}`,
    });
    if (error) throw new Error(humanTempleError(String(error.message ?? "")));
    return { level: Number((rows as Array<{ level: number }> | null)?.[0]?.level ?? data.fromLevel + 1) };
  });

export const prayCastleTemple = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        stats: z.array(z.enum(TEMPLE_STATS)).min(1).max(TEMPLE_STATS.length),
        extend: z.boolean().default(false),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account } = await who();
    const home = await import("./beta-raid/home-castle").then((m) => m.homeCastleStatus(wallet));
    if (!home.here) throw new Error("Молиться можно, когда герой в замке");
    const row = await loadRow(account);
    if (!row.owned) throw new Error(NOT_OWNED);
    const plan = prayerPlan(data.stats, levelPoints(row.level), data.extend);
    if (plan.bonuses.length === 0) throw new Error("Выбери бонус");
    if (plan.bonuses.length > slotsAt(row.level)) {
      throw new Error(`Храм этого уровня даёт до ${slotsAt(row.level)} бонусов за молитву`);
    }
    const { error } = await sb.rpc("castle_temple_pray", {
      p_account: account,
      p_wallet: wallet,
      p_effects: plan.bonuses.map((b) => ({ kind: `buff_${b.stat}`, value: b.value, seconds: b.seconds })),
      p_stars: plan.extended ? EXTEND_STARS : 0,
      p_op: `pray:${account}:${data.opId}`,
    });
    if (error) throw new Error(humanTempleError(String(error.message ?? "")));
    return { ok: true as const, plan };
  });
