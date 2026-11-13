// Пароль кошелька перед созданием, импортом и подписью (11.11.2026): им
// шифруются ключи (walletVault). Нет пароля — поставить, закрыт — ввести.
// Блоб пароля, потерянный в localStorage, сначала возвращается из записей
// кошельков (restoreAppPassword) — иначе завёлся бы новый пароль поверх старых.
import { useEffect, useState } from "react";
import { hasAppPassword, isAppUnlocked, restoreAppPassword } from "@/lib/appLock";
import { SetPasswordGate } from "@/components/wallet/SetPasswordGate";
import { UnlockGate } from "@/routes/admin.wallet/UnlockGate";

export function VaultGate({ onReady }: { onReady: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    void restoreAppPassword().then((restored) => restored && setTick((n) => n + 1));
  }, []);
  if (!hasAppPassword()) {
    return <SetPasswordGate onDone={() => (isAppUnlocked() ? onReady() : setTick((n) => n + 1))} />;
  }
  return <UnlockGate onUnlocked={onReady} />;
}
