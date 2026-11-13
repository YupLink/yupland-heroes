import type {ItemInfo} from '@/server/api/beta-raid/item-info';
import {artifactSummary} from '@/components/artifactSummary';
import {boostEffectText} from '@/lib/hero/boost';

/** Only fields returned by the existing item-info API; never infer gameplay stats. */
export function itemInfoContent(it: ItemInfo | null | undefined, lang: string) {
  if (!it) return {hasDetails: false, lines: [] as string[]};
  const stats = artifactSummary(it, lang).split('\n').filter(Boolean);
  const boosts = it.boost?.map(effect => boostEffectText(effect, lang === 'en' ? 'en' : 'ru')) ?? [];
  const combat = [
    it.hp != null ? `${lang === 'en' ? 'HP' : 'Здоровье'}: ${it.hp}` : '',
    it.damage?.trim() ? `${lang === 'en' ? 'Damage' : 'Урон'}: ${it.damage}` : '',
  ].filter(Boolean);
  const description = it.description?.trim() ?? '';
  const properties = [...boosts, ...stats, ...combat];
  const lines = properties.length ? properties : description ? [description] : [];
  return {
    lines,
    hasDetails: !!(lines.length || it.abilities?.length || it.rarity || it.level != null || it.slot || it.kind === 'terrain'),
  };
}
