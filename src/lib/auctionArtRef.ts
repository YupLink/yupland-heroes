// Артефакт в лоте игрока — шаблон И износ (lib/hero/artWear, 22.10.2026).
//
// Пикер аукционного дома показывает свободные артефакты группами «шаблон +
// прочность»: у каждой группы своя полоса, и в залог уходят ровно такие, какие
// игрок выбрал. Ссылка группы — `шаблон~износ`; целые (износ 0) — голый
// шаблон, как до износа, так что старые вкладки шлют то же, что и раньше.
// Тильды в id шаблона не бывает (nanoid: A–Z a–z 0–9 _ -).
//
// Зачарованные (§8.87, 31.10.2026: «улучшенные артефакты помечать на аукционе») —
// своей группой с процентом: `шаблон~износ!e12`. Без «!e» — только незачарованные:
// зачарованный не уйдёт в залог «заодно» с обычными.

export const artLotRef = (
  templateId: string,
  wear: number,
  enchantPct: number | null = null,
): string =>
  `${wear > 0 ? `${templateId}~${wear}` : templateId}${enchantPct != null ? `!e${Math.round(enchantPct)}` : ""}`;

export function parseArtLotRef(ref: string): {
  templateId: string;
  wear: number;
  /** null — незачарованные. */
  enchantPct: number | null;
} {
  const e = ref.lastIndexOf("!e");
  const pct = e < 0 ? NaN : Number(ref.slice(e + 2));
  const enchantPct = Number.isFinite(pct) ? Math.round(pct) : null;
  const base = e < 0 ? ref : ref.slice(0, e);
  const i = base.lastIndexOf("~");
  if (i < 0) return { templateId: base, wear: 0, enchantPct };
  const wear = Number(base.slice(i + 1));
  return {
    templateId: base.slice(0, i),
    wear: Number.isFinite(wear) ? Math.max(0, Math.min(100, wear)) : 0,
    enchantPct,
  };
}
