// Личное право «строить в замке бесплатно» (владелец, 29.10.2026, запрос
// Ангелины): аккаунтам из settings.castle_free_build все покупные здания замка —
// нынешние и будущие — считаются построенными. Строк castle_building не
// создаём, ничего не списываем, у остальных игроков всё как было. Храм,
// Аукционный дом и Архитектор — мимо: там награды за молитвы и платные уровни.
// Значение настройки — {"accounts": ["acc_…"]}; меняется одной строкой в базе.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export const FREE_BUILD_KEY = "castle_free_build";
/** Здания, на которые право не распространяется. */
export const FREE_BUILD_EXCEPT: readonly string[] = [
  "temple",
  "auction",
  "architect",
  "buckwheat_game", // не покупается: стоит у тех, кому открыта игра (buckwheat/bwAccess)
];

const TTL_MS = 30_000;
let cache: { at: number; accounts: ReadonlySet<string> } | null = null;

/** Список аккаунтов из значения настройки; мусор — пустой список. */
export function parseFreeBuild(raw: unknown): ReadonlySet<string> {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return new Set();
    }
  }
  const list = (v as { accounts?: unknown } | null)?.accounts;
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((a): a is string => typeof a === "string" && a.startsWith("acc_")));
}

async function freeBuildAccounts(): Promise<ReadonlySet<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.accounts;
  // Сбой чтения — права нет: лишнего не даём.
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(FREE_BUILD_KEY)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: unknown }>;
  const accounts = parseFreeBuild(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), accounts };
  return accounts;
}

/** Есть ли у аккаунта право вообще. */
export async function hasFreeBuild(account: string): Promise<boolean> {
  return (await freeBuildAccounts()).has(account);
}

/** Право покрывает это здание: аккаунт в списке и здание не из исключений. */
export async function freeBuildCovers(account: string, kind: string): Promise<boolean> {
  return !FREE_BUILD_EXCEPT.includes(kind) && (await hasFreeBuild(account));
}

/** Есть ли у аккаунта здание вида kind: купленное (castle_building) или по праву. */
export async function hasCastleBuilding(account: string, kind: string): Promise<boolean> {
  if (await freeBuildCovers(account, kind)) return true;
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.castle_building
              WHERE account_id = ${sqlStr(account)} AND kind = ${sqlStr(kind)}) AS owned;`,
    { wrapJson: true },
  )) as Array<{ owned: boolean }>;
  return rows?.[0]?.owned === true;
}

/** Только для тестов: забыть кэш. */
export function dropFreeBuildCache(): void {
  cache = null;
}
