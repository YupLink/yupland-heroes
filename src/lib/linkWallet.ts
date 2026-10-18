// Подключить ВСТРОЕННЫЙ YupLink-кош как сессию сервиса.
// Сессия golden-drop = cookie gd_wallet; вход идёт С ПОДПИСЬЮ (NEP-413) через
// signedConnect — встроенный кош подписывает challenge неизвлекаемым ключом,
// доказывая владение. Если активен внешний коннектор (HOT), сперва отключаем его:
// иначе autoConnect при перезагрузке восстановит внешний кош и перетрёт cookie.
// Возвращает wallet из серверной сессии.
import { signedConnect } from "@/lib/signedConnect";
import { getConnector } from "@/lib/near-connector";

export async function linkYupLinkWallet(accountId: string, pin?: string): Promise<string> {
  try {
    const c = await getConnector();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c as any)?.signOut?.();
  } catch {
    /* нет активного коннектора — ок */
  }
  // Реф-ссылка (?ref=...) должна работать и для нашего коша, не только для
  // HOT-пути (NearConnectorBridge): '/' = кош, рефы приземляются сюда.
  let ref: string | null = null;
  try {
    if (typeof window !== "undefined") {
      ref = new URL(window.location.href).searchParams.get("ref");
    }
  } catch {
    /* ignore */
  }
  const res = await signedConnect({ accountId, kind: "embedded", ref, pin });
  return res.wallet;
}
