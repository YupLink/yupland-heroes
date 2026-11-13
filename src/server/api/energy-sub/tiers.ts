// Тарифы подписки на энергию: чтение для витрины и админки, выключатель.
//
// Выключатель `energy_sub:enabled`: пока он не 'true', подписку видят и
// покупают только админы — как энергопаки до запуска (energyShop:enabled).
import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { priceIn, SUB_TOKENS, type SubToken } from "@/lib/energySub";
import { licenseTier, type LicenseTierId } from "@/lib/bankLicense";
import { daraiPerUsd } from "./rate";

export type SubTier = {
  id: string;
  name: string;
  nameEn: string;
  priceUsd: number;
  energyPerDay: number;
  boxPackId: string | null;
  boxesPerDay: number;
  days: number;
  active: boolean;
  sort: number;
  /** Пока подписка действует, энергия не тает (у «Эксперта», esub-05). */
  noDecay: boolean;
  /** Лицензия банка на время подписки (esub-06; ступени с 25.10 — esub-07). */
  licenseTier: LicenseTierId | null;
  /** Доп. вывод DARAI в месяц, пока подписка действует (wd-08; у аккаунта — самый большой). */
  withdrawBonus: number;
  boxName: string | null;
  boxImage: string | null;
};

type TierRow = {
  id: string;
  name: string;
  name_en: string | null;
  price_usd: number | string;
  energy_per_day: number | string;
  box_pack_id: string | null;
  boxes_per_day: number | string;
  no_decay: boolean | null;
  license_tier: string | null;
  withdraw_bonus: number | string | null;
  days: number | string;
  active: boolean;
  sort: number | string;
  box_name: string | null;
  box_image: string | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const tierSql = (where = "") => `
  SELECT t.id, t.name, t.name_en, t.price_usd, t.energy_per_day, t.box_pack_id,
         t.boxes_per_day, t.days, t.active, t.sort, t.no_decay, t.license_tier, t.withdraw_bonus,
         p.name AS box_name, p.cover_image_url AS box_image
    FROM yuplink.energy_sub_tier t
    LEFT JOIN yuplink.chip_packs p ON p.id = t.box_pack_id
   ${where}
   ORDER BY t.sort, t.id;`;

function toTier(r: TierRow): SubTier {
  return {
    id: String(r.id),
    name: String(r.name),
    nameEn: String(r.name_en ?? ""),
    priceUsd: num(r.price_usd),
    energyPerDay: num(r.energy_per_day),
    boxPackId: r.box_pack_id ?? null,
    boxesPerDay: num(r.boxes_per_day),
    noDecay: r.no_decay === true,
    licenseTier: licenseTier(r.license_tier)?.id ?? null,
    withdrawBonus: num(r.withdraw_bonus),
    days: num(r.days) || 30,
    active: r.active === true,
    sort: num(r.sort),
    boxName: r.box_name ?? null,
    boxImage: r.box_image ?? null,
  };
}

export async function loadTiers(): Promise<SubTier[]> {
  const rows = ((await mcpExec(tierSql(), { wrapJson: true })) ?? []) as TierRow[];
  return rows.map(toTier);
}

export async function loadTier(id: string): Promise<SubTier | null> {
  const rows = ((await mcpExec(tierSql(`WHERE t.id = ${sqlStr(id)}`), { wrapJson: true })) ??
    []) as TierRow[];
  return rows[0] ? toTier(rows[0]) : null;
}

export const ENABLED_KEY = "energy_sub:enabled";

export async function subsEnabled(): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(ENABLED_KEY)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: string | null }>;
  return String(rows?.[0]?.value ?? "") === "true";
}

/** Видит ли подписку этот кошелёк: админ — всегда, остальные — после запуска. */
export async function canUseSubs(wallet: string | null): Promise<boolean> {
  if (wallet && isAdminWallet(wallet)) return true;
  return subsEnabled();
}

export type SubOffer = SubTier & {
  prices: Record<SubToken, number | null>;
  /** По одной каждого вида (esub-10): своя такого вида действует — до какого момента эту не купить. */
  blockedUntil?: string | null;
};

/** Цены тарифа во всех валютах по текущему курсу. */
export function offerOf(t: SubTier, rate: number | null, blockedUntil: string | null = null): SubOffer {
  const prices = {} as Record<SubToken, number | null>;
  for (const tok of SUB_TOKENS) prices[tok] = priceIn(t.priceUsd, tok, rate);
  return { ...t, prices, blockedUntil };
}

export type MySub = {
  id: string;
  tierName: string;
  energyPerDay: number;
  boxesPerDay: number;
  boxName: string | null;
  endsAt: string;
  daysGiven: number;
  days: number;
};

export async function mySubs(account: string): Promise<MySub[]> {
  const rows = ((await mcpExec(
    `SELECT s.id, s.tier_name, s.energy_per_day, s.boxes_per_day, s.days, s.ends_at,
            p.name AS box_name,
            (SELECT count(*) FROM yuplink.energy_sub_day d WHERE d.sub_id = s.id) AS given
       FROM yuplink.energy_sub s
       LEFT JOIN yuplink.chip_packs p ON p.id = s.box_pack_id
      WHERE s.account_id = ${sqlStr(account)} AND s.ends_at > now()
      ORDER BY s.ends_at;`,
    { wrapJson: true },
  )) ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    tierName: String(r.tier_name),
    energyPerDay: num(r.energy_per_day),
    boxesPerDay: num(r.boxes_per_day),
    boxName: (r.box_name as string | null) ?? null,
    endsAt: String(r.ends_at),
    daysGiven: num(r.given),
    days: num(r.days),
  }));
}

/** Витрина: тарифы с ценами и мои активные подписки. */
export const getEnergySubOffers = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!(await canUseSubs(wallet))) {
    return { visible: false as const, tiers: [] as SubOffer[], mine: [] as MySub[], analyticsId: null as string | null };
  }
  const [rate, tiers] = await Promise.all([daraiPerUsd(), loadTiers()]);
  let mine: MySub[] = [];
  let locks: Record<string, string> = {};
  let analyticsId: string | null = null;
  if (wallet) {
    const { accAccountId } = await import("../currency/move");
    const account = await accAccountId(wallet).catch(() => null);
    if (account) {
      // Единый псевдоним аккаунта для A/B-теста: sister-кошельки дают один ID.
      // Ни адрес кошелька, ни Telegram ID в аналитику не отправляются.
      analyticsId = createHash("sha256").update(`yuplink-sub-v1:${account}`).digest("hex");
      // Наступившие дни выдаём прямо сейчас: игрок открыл витрину — подарок дня уже ждёт.
      const { grantDueForAccount } = await import("./grant");
      await grantDueForAccount(account).catch((e) => console.warn("[esub] выдача дней:", e));
      const { tierLocks } = await import("./buy-sql");
      [mine, locks] = await Promise.all([mySubs(account), tierLocks(account)]);
    }
  }
  // Лицензия в составе подписки — всем: банк открыт игрокам с 20.10 (§8.60).
  const offers = tiers.filter((t) => t.active).map((t) => offerOf(t, rate?.rate ?? null, locks[t.id] ?? null));
  return { visible: true as const, tiers: offers, mine, analyticsId };
});

