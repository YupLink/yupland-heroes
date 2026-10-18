// Новые виды награды: РЕСУРС счёта (золото/камень/дерево/алмазы) и СВОЙ ТОВАР
// маркета (шаблон cst_…). Один справочник на админку и на показ игроку, чтобы
// «gold» нигде не вылезал сырой строкой.
//
// ⚠️ Токен (DARAI, USDT…) остаётся ОТДЕЛЬНЫМ видом и ресурсом не подменяется:
// токен обеспечен залогом пула карты, а ресурс живёт на счёте аккаунта. Дай
// Darai видом «ресурс» — и он обойдёт пул.
//
// Клиентский модуль: серверных импортов здесь быть не должно (см. правило про
// утечку server-модулей в бандл).
import { RESOURCE_ICONS, type ResourceCode } from "./resourceIcons";

/** Ресурсы, которые можно положить в фонд награды. */
export const REWARD_RESOURCES = ["gold", "stone", "wood", "diamonds"] as const;
export type RewardResource = (typeof REWARD_RESOURCES)[number];

export function isRewardResource(code: unknown): code is RewardResource {
  return typeof code === "string" && (REWARD_RESOURCES as readonly string[]).includes(code);
}

// В награде и на счёте ресурс зовётся «алмазы», а спрайт лежит под именем
// crystal — переводим тут, а не в каждом месте показа.
const ICON_CODE: Record<RewardResource, ResourceCode> = {
  gold: "gold",
  stone: "stone",
  wood: "wood",
  diamonds: "crystal",
};

/** Ключи переводов подписи для ИГРОКА (ru+en живут в translations/braid.ts). */
const LABEL_KEY: Record<string, string> = {
  gold: "braid.rw_gold",
  stone: "braid.rw_stone",
  wood: "braid.rw_wood",
  diamonds: "braid.rw_diamonds",
  custom: "braid.rw_custom",
};

/**
 * Код ресурса по виду награды.
 *
 * Сервер отдаёт вид либо кодом ресурса («gold» — как символ токена вместо
 * «token»), либо общим «resource» с кодом отдельным полем. Понимаем оба, чтобы
 * подпись не зависела от того, каким боком ляжет раздача.
 */
export function resourceOfKind(
  kind: string | null | undefined,
  ref?: string | null,
): RewardResource | null {
  if (isRewardResource(kind)) return kind;
  if (kind === "resource" && isRewardResource(ref)) return ref;
  return null;
}

/** Спрайт ресурса для вида награды; не ресурс — null (рисуем lucide-иконку). */
export function rewardKindImage(
  kind: string | null | undefined,
  ref?: string | null,
): string | null {
  const res = resourceOfKind(kind, ref);
  if (!res) return null;
  // WebP — новая версия файлов, старый кэш (PNG) не совпадёт по URL.
  return RESOURCE_ICONS[ICON_CODE[res]].src;
}

/**
 * Ключ перевода подписи вида награды. null — вид не наш (лайки/пак/токен),
 * подпись берёт вызывающий по своим правилам.
 */
export function rewardKindLabelKey(
  kind: string | null | undefined,
  ref?: string | null,
): string | null {
  const res = resourceOfKind(kind, ref);
  if (res) return LABEL_KEY[res];
  return kind === "custom" ? LABEL_KEY.custom : null;
}

/** Штучные виды: у них подпись — ИМЯ из справочника, а не сумма. */
const PIECE_KEY: Record<string, string> = {
  pack: "braid.rw_pack",
  item: "braid.rw_item",
  custom: "braid.rw_custom",
};

/**
 * Запасная подпись штучного приза, которому справочник не дал имени (пак снят,
 * товар удалён). Ключ, а не готовая фраза: раньше запас собирал СЕРВЕР и слал
 * всем русское «Пак / Предмет / Товар» — английский игрок читал русское слово.
 * null — вид не штучный, показываем сумму.
 */
export function prizeFallbackKey(kind: string | null | undefined): string | null {
  return (kind && PIECE_KEY[kind]) || null;
}
