// Что игроку положено за пришедшую на склад NFT: бокс или фишка.
//
// Правила собраны из двух прежних догонов (пак и фишка), которые решали одно и
// то же по-разному и потому расходились в углах:
//   1. Явная связка админа под это название — сознательный обмен NFT на пак,
//      даже если по имени это «выведенная фишка» (1★ Retro figurine).
//   2. Перевод пришёл в круге, открытом выводом фишки (привязка круга) — это
//      НАША фишка, вернувшаяся домой. По имени её в пак уводить нельзя: «#5
//      Football pack (5 Stars)» содержит слово pack и так терялись пять фишек
//      26.08.
//   3. Имя вида «… (N Stars)» — фишка, а не пак.
//   4. Иначе — связка «имя → пак» из карты админа (ключ включает контракт:
//      подобрать пак по имени с ЧУЖОГО контракта нельзя, иначе достаточно было
//      бы отчеканить у себя токен «Dragon pack»).
//   5. Не пак — пробуем как фишку по названию (карта чеканки).
import { pg } from "../db/pg";
import {
  getPackInputReverseMap,
  packInputKey,
  isChipNftTitle,
  stripLeadCount,
  fetchOnchainNftTitle,
} from "./chips-mint-deposit-helpers";
import { cycleAt, latestCycle, type CycleBinding } from "@/lib/nftCycle";
import { loadCycles } from "./nft-cycle";
import { chipIdentityByTitle } from "./nft-chip-identity";
import type { ChipIdentity } from "./nft-cycle-credit";
import type { InputCandidate } from "./nft-input-scan";

/**
 * Раньше этой даты у выданных за NFT фишек не проставлялся `nftdep:{tokenId}`
 * (23 записи июнь–20.07.2026) — по ним идемпотентность не проверить, поэтому
 * старые переводы не трогаем вообще: лучше не догнать, чем выдать дубль.
 */
export const CHIP_INPUT_EPOCH_MS = Date.parse("2026-07-21T00:00:00Z");

export type Classification =
  | {
      kind: "pack";
      packId: string;
      packName: string;
      /** У мистик-бокса количество зашито в название («3 Mystical Pack»). */
      grantCount: number;
      /** Обмен выведенной фишки на пак: запись чеканки надо закрыть. */
      chipSwap: boolean;
    }
  /**
   * Фишка. Номер и окончательный вид решает выдача по кругу (привязка круга
   * сильнее названия); здесь — только что показать в плане догона. Разбор
   * побочных эффектов не делает: сухой прогон ничего в базе не трогает.
   */
  | { kind: "chip"; identity: ChipIdentity; bound: boolean }
  | { kind: "none"; reason: string };

export type ClassifyContext = { packMap: Map<string, string> };

/** Карта связок читается раз на прогон, а не на каждый из сотен кандидатов. */
export async function createClassifyContext(): Promise<ClassifyContext> {
  return { packMap: await getPackInputReverseMap() };
}

async function packClassification(
  packId: string,
  leadCount: number,
  chipSwap: boolean,
): Promise<Classification> {
  const pack = await pg.chipPacks.findOne({ id: packId });
  if (!pack) return { kind: "none", reason: `связка ведёт на удалённый пак ${packId}` };
  const isMystic = (pack as { kind?: string }).kind === "mystic";
  return {
    kind: "pack",
    packId,
    packName: pack.name,
    grantCount: isMystic ? Math.max(1, leadCount) : 1,
    chipSwap,
  };
}

export async function classifyCandidate(
  c: InputCandidate,
  ctx: ClassifyContext,
): Promise<Classification> {
  let title = c.title;
  if (!title) {
    try {
      title = (await fetchOnchainNftTitle(c.contract, c.tokenId)) ?? "";
    } catch {
      /* контракт не ответил — ниже решим по индексу чеканок */
    }
  }

  const { count: leadCount, base } = stripLeadCount(title);
  const adminPackId = title ? (ctx.packMap.get(packInputKey(c.contract, title)) ?? null) : null;
  if (adminPackId) return packClassification(adminPackId, leadCount, true);

  const bound = await boundAt(c);
  if (bound) return chipClassification(c, title, bound);

  if (!title) return { kind: "none", reason: "не удалось определить название NFT" };
  if (isChipNftTitle(title)) return chipClassification(c, title, null);

  const packId = ctx.packMap.get(packInputKey(c.contract, base));
  if (packId) return packClassification(packId, leadCount, false);

  // Ни явной связки, ни звёзд в имени — последняя попытка: вдруг это фишка,
  // которой нет в индексе чеканок (минт до появления индекса).
  return chipClassification(c, title, null);
}

/** Привязка круга, в котором пришёл перевод: вывод фишки, ждущий возврата. */
async function boundAt(c: InputCandidate): Promise<CycleBinding | null> {
  const list = (await loadCycles(c.contract, [c.tokenId])).get(c.tokenId) ?? [];
  const cur = c.atMs == null ? latestCycle(list) : cycleAt(list, c.atMs);
  return cur && cur.closedAt == null ? cur.binding : null;
}

async function chipClassification(
  c: InputCandidate,
  title: string,
  bound: CycleBinding | null,
): Promise<Classification> {
  if (c.atMs != null && c.atMs < CHIP_INPUT_EPOCH_MS) {
    return { kind: "none", reason: "перевод старее эпохи учёта фишек — разбирать руками" };
  }
  if (bound) {
    return {
      kind: "chip",
      identity: { templateId: bound.templateId, level: bound.level, collectionId: bound.collectionId },
      bound: true,
    };
  }
  const identity = await chipIdentityByTitle(c.contract, c.tokenId, title || null);
  if (!identity) return { kind: "none", reason: "нет связки: ни пак, ни фишка" };
  return { kind: "chip", identity, bound: false };
}
