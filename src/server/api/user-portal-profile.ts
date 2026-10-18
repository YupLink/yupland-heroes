// Профиль игрока на портале Yupland (public.profiles) по его кошелькам.
//
// Связка — `profiles.near_account_id` ↔ кошелёк игры, а кошельков у одного
// Telegram-аккаунта несколько (сёстры). На портале игрок мог завести профиль
// под КАЖДЫЙ из них: у жалобщика 08.10.2026 пять кошельков и три профиля.
//
// Раньше обе ручки спрашивали портал через `.maybeSingle()`: на двух и более
// строках PostgREST отвечает ошибкой, `data` приходит null — и экран писал
// «Связь не найдена», хотя профиль есть, и не один. Теперь берём список и
// выбираем один:
//   1. профиль АКТИВНОГО кошелька — он и подключён в игре;
//   2. иначе самый «живой» — с наибольшей энергией: это основной профиль
//      игрока, остальные обычно пустые заготовки;
//   3. иначе первый по порядку сестёр.
import { sbPublic } from "../db/pg";
import { getSisterWallets } from "./user-shared";

/** Строка профиля портала: знаем только то, что просили в select. */
export type PortalProfile = Record<string, unknown> & {
  near_account_id?: string | null;
  energy_balance?: number | null;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Выбрать профиль игрока из найденных на портале. Пусто — null. */
export function pickPortalProfile<T extends PortalProfile>(
  rows: readonly T[],
  wallet: string,
  sisters: readonly string[],
): T | null {
  if (rows.length === 0) return null;
  const mine = rows.find((r) => r.near_account_id === wallet);
  if (mine) return mine;
  const byEnergy = [...rows].sort((a, b) => num(b.energy_balance) - num(a.energy_balance));
  if (num(byEnergy[0]?.energy_balance) > 0) return byEnergy[0];
  const order = new Map(sisters.map((w, i) => [w, i]));
  return [...rows].sort(
    (a, b) =>
      (order.get(String(a.near_account_id)) ?? 999) - (order.get(String(b.near_account_id)) ?? 999),
  )[0];
}

/**
 * Профиль портала для кошелька: один запрос по всем сёстрам и выбор.
 * `columns` — список полей select; `energy_balance` и `near_account_id`
 * добавляются сами, без них выбирать не из чего.
 */
export async function portalProfile<T extends PortalProfile>(
  wallet: string,
  columns: string,
): Promise<T | null> {
  const sisters = await getSisterWallets(wallet);
  const need = new Set(
    columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
  );
  need.add("near_account_id");
  need.add("energy_balance");
  const { data } = await sbPublic
    .from("profiles")
    .select([...need].join(","))
    .in("near_account_id", sisters)
    .limit(20);
  const rows = (Array.isArray(data) ? data : []) as unknown as T[];
  return pickPortalProfile(rows, wallet, sisters);
}
