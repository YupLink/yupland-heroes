// Кто видит ремонт артефактов (ПРАВИЛА §8.72). Пока владелец не сказал
// «запускаем» — только админы; игрокам окна нет и ручки отказывают. Открыть всем —
// одна строка в базе, без выката: settings.art_repair_open = true (как
// townhall_prices_open). Нет строки — закрыто.
//
// Флаг читают окно постройки (вкладка «Ремонт» у кузницы), каждая ручка ремонта и
// механика поломки (artBrokenOn: снятие при поломке, запрет надеть, накладка) —
// кэш процесса на 2 с: открыли — у всех и сразу.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { isAdminWallet } from "@/server/auth";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { ART_REPAIR_OPEN_KEY, FORGE_TEMPLATE_ID } from "@/lib/hero/artRepair";

const TTL_MS = 2_000;
let openCache: { at: number; open: boolean } | null = null;

/** Ремонт открыт всем игрокам (слово владельца). */
export async function artRepairOpen(): Promise<boolean> {
  if (openCache && Date.now() - openCache.at < TTL_MS) return openCache.open;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(ART_REPAIR_OPEN_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const v = rows?.[0]?.value;
  const open = v === true || v === "true";
  openCache = { at: Date.now(), open };
  return open;
}

/** Может ли этот кошелёк видеть и делать ремонт: админ — всегда, игрок — с флагом. */
export async function artRepairAllowed(wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  if (isAdminWallet(wallet)) return true;
  return artRepairOpen();
}

/**
 * Механика поломки запущена для этого кошелька (§8.63 п.3): сломанный слетает с
 * героя, надеть его нельзя, поверх картинки накладка, над героем плашка. Тот же
 * флаг, что у ремонта — запускаются вместе, по слову владельца; админам видно
 * сразу. Сбой чтения флага — «не запущено»: для игроков всё как было.
 */
export async function artBrokenOn(wallet: string | null): Promise<boolean> {
  return artRepairAllowed(wallet).catch(() => false);
}

/**
 * Вкладка «Ремонт» в окне постройки: только у кузницы (и лавки, и декоративной —
 * по шаблону клетки) и только тем, кому ремонт открыт. Сбой чтения флага — не
 * показываем: окно постройки из-за него падать не должно.
 */
export async function forgeRepairShown(
  wallet: string,
  buildingId: string | null | undefined,
): Promise<boolean> {
  if (buildingId !== FORGE_TEMPLATE_ID) return false;
  return artRepairAllowed(wallet).catch(() => false);
}

/** Вход в любую ручку ремонта: кошелёк, аккаунт; закрыто — отказ ключом. */
export async function requireArtRepair(): Promise<{ wallet: string; account: string }> {
  const wallet = await requireBetaRaid();
  if (!(await artRepairAllowed(wallet))) throw new Error("artfix.closed");
  return { wallet, account: await raidOwner(wallet) };
}

/** Только для тестов: забыть кэш флага. */
export function dropArtRepairOpenCache(): void {
  openCache = null;
}
