// Права админки по одному (владелец, 04.11.2026: «выдай тоже админку, но без прав
// распределения средств… будем давать права по очереди»). Полный админ — по-прежнему
// isAdminWallet; здесь — отдельные права аккаунтам, без остального.
// settings.admin_rights = {"acc_…": ["god_map", …]}; меняется одной строкой в базе.
//  · god_map — режим бога на любой карте, где стоит герой, с ограничениями
//    дизайнера (island-editor-auth: местность, дороги, декор, городские
//    постройки, блоки; объекты, награды и шахты игроков не трогает).
//  · island_god — режим бога целиком, как у админа, но только на своём острове
//    новичка и без денег (beta-raid/god-money.ts: токены вычищаются из
//    настроек, награды в токенах с острова не выдаются).
//  · catalogs — общие справочники (шаблоны объектов и боссов, свои товары,
//    категории, рыбалка, находки, метки, облики, чертежи) без денег
//    (api/catalog-auth.ts).
//  · promo_soft — промокоды только на энергию и лайки, видит и правит только
//    свои (promo/promo-actor.ts); created_by — у каждого кода.
//  · demo_island — свой демо-остров: вход и выход из профиля, ни к чему не
//    прикреплён, режим бога там — как на своём острове (island/demo-island.ts).
//  · creator — креатор (07.11.2026): шаблоны поселений на своих голых картах,
//    режим бога там целиком и без денег; старые карты закрыты, открыты только
//    свои работы и те, которыми поделился другой креатор (server/api/creator).
//  · buckwheat — мини-игра «Корона гречневого королевства» на золото, пока не всем
//    (07.11.2026: «пока только админам и Кайлани»; server/api/buckwheat).
//  · island_tester — тест острова новичка (кнопка-пальма: свой остров, новый остров,
//    обучение с нуля) для аккаунта без Telegram дизайнера (12.11.2026; islandTester.ts).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export const ADMIN_RIGHTS_KEY = "admin_rights";
export const ADMIN_RIGHTS = [
  "god_map",
  "promo_soft",
  "island_god",
  "catalogs",
  "demo_island",
  "creator",
  "buckwheat",
  "island_tester",
] as const;
export type AdminRight = (typeof ADMIN_RIGHTS)[number];

const KNOWN: ReadonlySet<string> = new Set(ADMIN_RIGHTS);
type Registry = ReadonlyMap<string, ReadonlySet<AdminRight>>;

/** Значение настройки → аккаунт → права; мусор и незнакомые права — мимо. */
export function parseAdminRights(raw: unknown): Registry {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return new Map();
    }
  }
  const out = new Map<string, ReadonlySet<AdminRight>>();
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [account, list] of Object.entries(v as Record<string, unknown>)) {
    if (!account.startsWith("acc_") || !Array.isArray(list)) continue;
    const rights = list.filter((r): r is AdminRight => typeof r === "string" && KNOWN.has(r));
    if (rights.length > 0) out.set(account, new Set(rights));
  }
  return out;
}

const TTL_MS = 30_000;
let cache: { at: number; registry: Registry } | null = null;

async function registry(): Promise<Registry> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.registry;
  // Сбой чтения — прав нет: лишнего не даём.
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(ADMIN_RIGHTS_KEY)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: unknown }>;
  cache = { at: Date.now(), registry: parseAdminRights(rows?.[0]?.value ?? null) };
  return cache.registry;
}

export function dropAdminRightsCache(): void {
  cache = null;
}

/** Есть ли у аккаунта это право. */
export async function accountHasRight(account: string | null, right: AdminRight): Promise<boolean> {
  if (!account) return false;
  return (await registry()).get(account)?.has(right) ?? false;
}

/** Все аккаунты с этим правом (креатор делится работой — из списка других креаторов). */
export async function accountsWithRight(right: AdminRight): Promise<string[]> {
  return [...(await registry())].filter(([, set]) => set.has(right)).map(([acc]) => acc);
}

/** Флаги прав для сессии клиента (user-auth.getSession). */
export async function sessionRights(account: string | null) {
  const has = (r: AdminRight) => accountHasRight(account, r);
  return {
    /** god_map: режим бога на любой карте, без наград и денег. */
    canGodMap: await has("god_map"),
    /** promo_soft: промокоды на энергию и лайки, только свои. */
    canPromoSoft: await has("promo_soft"),
    /** island_god: режим бога целиком на своём острове, без денег. */
    islandGod: await has("island_god"),
    /** creator: шаблоны поселений — режим бога целиком в своих работах (isle_cw_…). */
    creator: await has("creator"),
    /** catalogs: общие справочники без денег. */
    canCatalogs: await has("catalogs"),
    /** buckwheat: мини-игра «Корона гречневого королевства» (постройка в замке и на карте). */
    canBuckwheat: await has("buckwheat"),
  };
}

/** Есть ли у кошелька (его аккаунта) это право. */
export async function walletHasRight(wallet: string | null, right: AdminRight): Promise<boolean> {
  if (!wallet) return false;
  const { accAccountId } = await import("@/server/api/currency/move");
  return accountHasRight(await accAccountId(wallet).catch(() => null), right);
}
