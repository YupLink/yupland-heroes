// Рубильник раскатки ресурсного счёта.
//
// Одна строка настроек решает две вещи разом: кому открыт счёт и работает ли
// ещё оплата подписью кошелька. Настройкой, а не флагом сборки, — чтобы
// откатить можно было одной строкой SQL, без выкатки:
//
//   UPDATE yuplink.settings SET value='owner' WHERE key='account_rollout';
//
//   'owner' — как было: счёт только у владельца, оплата кошельком работает;
//   'all'   — счёт у всех, оплата подписью кошелька закрыта.
import { pg } from "../db/pg";

const KEY = "account_rollout";
const TTL_MS = 15_000;

let cache: { at: number; value: string } | null = null;

async function mode(): Promise<string> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  let v = "owner";
  try {
    const row = await pg.settings.findOne({ key: KEY });
    const raw = String(row?.value ?? "").trim().toLowerCase();
    if (raw === "all" || raw === "owner") v = raw;
  } catch {
    // Настройка недоступна — ведём себя как раньше, счёт остаётся у владельца.
  }
  cache = { at: now, value: v };
  return v;
}

/** Счёт открыт всем игрокам? */
export async function accountOpenToAll(): Promise<boolean> {
  return (await mode()) === "all";
}

/**
 * Гейт ручек счёта. Пока раскатка не включена — только владелец, как и было.
 */
export async function requireAccountUser(): Promise<string> {
  const { getCurrentWallet, requirePayoutsAdmin } = await import("../auth");
  if (!(await accountOpenToAll())) return requirePayoutsAdmin();
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  return wallet;
}

/**
 * Оплата подписью кошелька. После раскатки её больше нет: всё платится со
 * счёта. Догоны и реконсиляции НЕ трогаем — уже отправленные переводы обязаны
 * доехать, иначе деньги повиснут.
 */
export async function assertWalletPurchaseAllowed(): Promise<void> {
  if (await accountOpenToAll()) {
    throw new Error(
      "Оплата кошельком отключена — пополни счёт на экране «Кошелёк» и плати с него",
    );
  }
}
