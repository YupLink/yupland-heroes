// Режим сервисных работ (maintenance). Флаг в yuplink.settings key='maintenance_mode'
// (value: '1' / '1|текст сообщения' → вкл; иначе выкл). Во время окна ВСЕ мутации
// пользователей отклоняются, чтобы при миграции не было расхождений; чтения и
// админ-кошелёк (владелец) НЕ блокируются, чтобы приложение показало экран работ
// и я мог проверять миграцию. Скрипты миграции пишут в БД напрямую, мимо гейта.
import { pg } from "./db/pg";
import { getCurrentWallet, isAdminWallet } from "./auth";

const KEY = "maintenance_mode";
const DEFAULT_MSG = "Идут технические работы. Скоро вернёмся.";
const TTL_MS = 4000;

let cacheOn = false;
let cacheMsg = DEFAULT_MSG;
let lastCheck = 0;
let refreshing = false;

async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const row = await pg.settings.findOne({ key: KEY });
    const v = (row?.value ?? "").trim();
    cacheOn = v === "1" || v.startsWith("1|") || v.toLowerCase() === "on";
    cacheMsg = v.includes("|") ? v.slice(v.indexOf("|") + 1).trim() || DEFAULT_MSG : DEFAULT_MSG;
  } catch {
    // fail-open: если settings недоступна — НЕ блокируем всех.
    cacheOn = false;
  } finally {
    refreshing = false;
  }
}

// Синхронный гейт по кэшу + фоновое обновление (не блокирует запрос).
function maybeRefresh() {
  const now = Date.now();
  if (now - lastCheck > TTL_MS) {
    lastCheck = now;
    void refresh();
  }
}

/** Бросает ошибку, если идут работы и вызывающий — не админ. Звать в начале
 *  каждой пользовательской МУТАЦИИ (через requireWallet и ключевые хендлеры). */
export function assertNotMaintenance(wallet?: string | null): void {
  maybeRefresh();
  if (!cacheOn) return;
  const w = wallet ?? getCurrentWallet();
  if (isAdminWallet(w)) return; // владелец работает во время окна
  throw new Error(`🛠 ${cacheMsg}`);
}

/** Актуальное состояние для фронта (свежее чтение). */
export async function getMaintenanceState(): Promise<{ on: boolean; message: string }> {
  // Каждый клиент спрашивает это раз в 15 с: при тысяче игроков — 67 чтений
  // базы в секунду ради одного флага. Свежее не старше 5 с — из памяти,
  // обновление — фоном (как в assertNotMaintenance); первый раз — честно ждём.
  const now = Date.now();
  if (now - lastCheck > FRONT_TTL_MS) {
    if (lastCheck === 0) await refresh();
    else void refresh();
    lastCheck = now;
  }
  return { on: cacheOn, message: cacheMsg };
}

/** Сколько фронт может видеть флаг из памяти, прежде чем перечитаем базу. */
const FRONT_TTL_MS = 5_000;
