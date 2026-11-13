// Доступ к банку замка. С 21.10.2026 (владелец) банк у всех построен сразу: обмен,
// стейкинг, лицензии и список пулов — любому вошедшему игроку. Кто строил банк
// раньше, получает ресурсы обратно (castle-bank.ts). Инструменты пулов (завести,
// наполнить, удалить) — только админу (requireAdmin в своих файлах).
import { accAccountId } from "../currency/move";

/** Построен ли банк у аккаунта: с 21.10.2026 — у всех. */
export async function bankBuiltFor(_account: string): Promise<boolean> {
  return true;
}

/** Счёт аккаунта для действий в банке. */
export async function bankAccount(wallet: string): Promise<string> {
  const acc = await accAccountId(wallet);
  if (!acc) throw new Error("Не найден счёт аккаунта");
  return acc;
}
