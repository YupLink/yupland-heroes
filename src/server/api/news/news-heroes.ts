// Имена в газете и сводке (владелец 31.10.2026): ники не раскрываем — только
// герой, которым играет аккаунт: лицо и имя. Одно имя у разных игроков —
// «брат-близнец».
import type { NewsLang } from "@/lib/news/types";
import { localizeAssetName } from "@/lib/translations/assetNames";

export type NewsHero = { name: string; image: string | null };

/** «Fedr - Stubborn Mage» → «Fedr»: в газете коротко. */
export function heroShortName(name: string): string {
  const short = name.split(/\s+[-—–]\s+/)[0]?.trim();
  return short || name.trim();
}

/** Первый — как есть, остальные с тем же героем — «брат-близнец» (без номеров: шумно). */
export function twinLabel(name: string, k: number, lang: NewsLang): string {
  if (k <= 0) return name;
  return `${name}, ${lang === "en" ? "twin" : "брат-близнец"}`;
}

// Сначала то, что печатает газета (богачи, рекорды): чистое имя достаётся
// видимым; среди мест — сначала первые места всех досок.
const PRIORITY = [
  "gold",
  "steps",
  "fights",
  "gathered",
  "mines",
  "energy",
  "diamonds",
  "darai",
  "wood",
  "stone",
];

/** Аккаунт → подпись в сводке; один аккаунт на всех досках подписан одинаково. */
export function heroLabels(
  rows: ReadonlyArray<{ board: string; account_id: string }>,
  heroes: Map<string, NewsHero>,
  lang: NewsLang,
): Map<string, string> {
  const rank = new Map<string, number>();
  const order: Array<{ id: string; key: number }> = [];
  for (const r of rows) {
    const p = PRIORITY.indexOf(r.board);
    if (p < 0) continue;
    const i = rank.get(r.board) ?? 0;
    rank.set(r.board, i + 1);
    order.push({ id: r.account_id, key: i * PRIORITY.length + p });
  }
  order.sort((a, b) => a.key - b.key);
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const { id } of order) {
    if (out.has(id)) continue;
    const hero = heroes.get(id);
    const base = hero
      ? heroShortName(localizeAssetName(hero.name, lang))
      : lang === "en"
        ? "Nameless"
        : "Безымянный";
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    out.set(id, twinLabel(base, k, lang));
  }
  return out;
}
