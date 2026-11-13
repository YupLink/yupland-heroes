// Ломбард: несколько артефактов одной сделкой (владелец, 25.10.2026: «сделать
// как с героями, чтобы можно разом много выделять»). Игрок отмечает в пикере
// группы (шаблон + износ) и сколько штук из каждой — сервер проверяет КАЖДУЮ
// группу так же, как одиночный выбор (своя, свободная, та редкость, хватает
// штук этого износа), и снимает всё ОДНИМ запросом (art-stock.takeArtifactGroups):
// не набралась одна группа — не снимается ничего.
//
// Выплата, лимит скупки и перепродажа — прежние (market-sell): число артефактов
// в сделке обязано совпасть с giveAmount × qty, как число копий у героев.
import type { SpendReceipt } from "./market-money";
import type { ArtGroup } from "./market-inv-pay";

/**
 * Выбор с клиента в группы без повторов: одинаковые шаблон и износ — одна
 * группа со сложенным числом (иначе [a×1, a×1] проверялись бы каждая против
 * одного свободного и прошли бы за двоих). Порядок — первого появления.
 */
export function mergeArtGroups(list: ArtGroup[]): ArtGroup[] {
  const out: ArtGroup[] = [];
  for (const g of list) {
    const templateId = g.templateId.trim();
    const count = Math.max(0, Math.floor(Number(g.count) || 0));
    const wear = Number(g.wear) || 0;
    if (!templateId || count <= 0) continue;
    const same = out.find((o) => o.templateId === templateId && o.wear === wear);
    if (same) same.count += count;
    else out.push({ templateId, wear, count });
  }
  return out;
}

/**
 * Оплата «Любым артефактом редкости X» несколькими группами. amount — сколько
 * штук просит сделка; rarity — редкость позиции (проверяется у каждой группы).
 */
export async function spendArtGroups(
  wallet: string,
  account: string,
  rarity: string,
  list: ArtGroup[],
  amount: number,
  ref: string,
): Promise<SpendReceipt> {
  const groups = mergeArtGroups(list);
  // Сколько артефактов в сделке — столько и выбрано: число с клиента без
  // своего перечня групп не пройдёт.
  if (groups.reduce((s, g) => s + g.count, 0) !== amount) throw new Error("market.bad_qty");
  const { takeArtifactGroups, freeArtifactStat } = await import("./art-stock");
  // Проверка до снятия — с отказом по существу, как у одиночного выбора;
  // группы проверяются разом, а не по очереди.
  const stats = await Promise.all(
    groups.map((g) => freeArtifactStat(account, g.templateId, g.wear)),
  );
  groups.forEach((g, i) => {
    const stat = stats[i];
    if (!stat || stat.count < g.count) throw new Error("market.art_rarity_none");
    if (stat.rarity !== rarity) throw new Error("market.art_rarity_wrong");
  });
  const arts = await takeArtifactGroups({
    account,
    wallet,
    groups: groups.map((g) => ({
      pick: { templateId: g.templateId, rarity, wear: g.wear },
      qty: g.count,
    })),
    op: ref,
  });
  if (!arts) throw new Error("market.art_rarity_none");
  return { paidArts: arts };
}
