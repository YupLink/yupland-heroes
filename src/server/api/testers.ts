// Группа тестеров: игроки, которым владелец точечно открывает механики,
// пока закрытые для всех остальных (бета-рейд, герои и т.п.).
//
// Права ОБЩИЕ на всю группу — набор переключателей в настройке
// `tester_features`. Ресурсы и служебные вещи (выдача энергии, статистика,
// режим обслуживания) сюда не попадают никогда: см. TESTER_FEATURES.
import { swrCache } from "../cache/swr";
import { pg } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";

/** Что вообще можно открыть тестерам. Ключ → человеческая подпись. */
export const TESTER_FEATURES = {
  beta_raid: "Бета-рейд (гекс-карта)",
  heroes: "Герои: превращение фишки",
  hero_levels: "Герои: прокачка за лайки",
  hero_power: "Герои: статы, артефакты, отряд и замок",
  hero_power_bosses: "Герои: бонусы работают и по боссам",
  solana_connect: "Solana: привязка кошелька",
  auctions: "Аукционы: ставки за призы",
  builder_world: "Мир строителей: покупка и укладка земель",
} as const;

export type TesterFeature = keyof typeof TESTER_FEATURES;

const SETTINGS_KEY = "tester_features";
/** Список и флаги живут в БД, но читаются на каждый запрос — держим короткий кэш. */
const TTL_MS = 30_000;
type Testers = { wallets: Set<string>; features: Record<string, boolean | string> };

/**
 * Список тестеров и включённые механики. Спрашивается на каждый шаг, бой и
 * почти любой экран, а меняется руками владельца — поэтому обновляется ФОНОМ:
 * раньше раз в тридцать секунд чей-то запрос платил здесь два похода в базу
 * подряд.
 *
 * `maxStale` короткий нарочно: это права доступа. Если фоновое обновление
 * падает, через две минуты читатель начнёт ЖДАТЬ свежий ответ, а не жить
 * по старому списку сколь угодно долго.
 */
const cache = swrCache<Testers>({ ttl: TTL_MS, maxStale: 120_000, load: fetchTesters });
const KEY = "all";

async function load(): Promise<Testers> {
  return cache.get(KEY);
}

async function fetchTesters(): Promise<Testers> {
  const { data: rows } = await pg.testers.raw().select("wallet");
  const wallets = new Set(
    ((rows ?? []) as Array<{ wallet: string }>).map((r) => r.wallet.trim().toLowerCase()),
  );
  const row = await pg.settings.findOne({ key: SETTINGS_KEY });
  let features: Record<string, boolean | string> = {};
  try {
    features = row?.value ? (JSON.parse(row.value) as Record<string, boolean | string>) : {};
  } catch {
    features = {};
  }
  return { wallets, features };
}

/** Сбросить кэш — зовём после правок из админки, чтобы изменения были сразу. */
export function invalidateTesters(): void {
  // Права доступа — выбрасываем совсем, а не помечаем протухшими: выключенная
  // механика должна выключиться сразу. Прогрев следом снимает цену ожидания с
  // первого же игрока, который постучится после правки.
  cache.drop();
  cache.warm(KEY);
}

export async function isTesterWallet(wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  const { wallets } = await load();
  if (wallets.has(wallet.trim().toLowerCase())) return true;
  // Тестер мог зайти с сестринского кошелька того же аккаунта.
  const { getSisterWallets } = await import("./user");
  const sisters = await getSisterWallets(wallet).catch(() => [] as string[]);
  return sisters.some((s) => wallets.has(s.trim().toLowerCase()));
}

/** Флаги группы (для админки и для клиента). */
export async function testerFeatureFlags(): Promise<Record<string, boolean | string>> {
  const { features } = await load();
  return features;
}

/**
 * Доступна ли фича этому кошельку: админам — всегда, тестерам — если
 * переключатель включён, остальным — нет.
 */
export async function canUseFeature(
  wallet: string | null,
  feature: TesterFeature,
): Promise<boolean> {
  if (isAdminWallet(wallet)) return true;
  const { features } = await load();
  const value = features[feature];
  if (!value) return false;
  // "all" — механику открыли ВСЕМ, группа тестеров больше не при чём. Так
  // фича выходит из закрытого теста одной правкой настройки, без деплоя:
  // true — только группа, "all" — весь мир.
  if (value === "all") return true;
  return isTesterWallet(wallet);
}

/** Тот же вопрос про текущего игрока. */
export async function currentCanUse(feature: TesterFeature): Promise<boolean> {
  return canUseFeature(getCurrentWallet(), feature);
}

/** Гейт для серверных действий: кидает понятную ошибку. */
export async function requireFeature(feature: TesterFeature): Promise<string> {
  const wallet = getCurrentWallet();
  if (!(await canUseFeature(wallet, feature))) {
    throw new Error(`${TESTER_FEATURES[feature]} — пока в закрытом тесте`);
  }
  return wallet as string;
}
