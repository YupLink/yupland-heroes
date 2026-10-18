// Подпись набора города — с табличек у его ратуш (владелец, 07.10.2026:
// «города названы не просто так — у входа табличка, где пишется "город
// такой-то"»). Из «Город Драконов - Куна» подпись — «Город Драконов»: часть
// со словом «город», в которой нет имени самого города («Город Сантария» —
// имя, а не вид). Подпись с именем расы набора важнее остальных: у драконов
// есть и «Военый городок», и «Город 7 вершин», но вид их городов — «Город
// Драконов».
import { racesFromName } from "@/lib/raid/assetTags";

const TOWN_WORD = /город/i;
/** Длиннее — уже фраза, а не вид города. */
const LABEL_MAX = 40;
/** Подпись с именем расы набора весит как столько табличек. */
const RACE_BONUS = 10;

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/ё/g, "е");

/** Табличка города: в тексте есть слово «город» (а не «Банановая Ферма»). */
export const isTownSign = (text: string | null | undefined): boolean =>
  typeof text === "string" && TOWN_WORD.test(text);

/** Части таблички со словом «город» (не одним им) без имён городов набора. */
export function labelParts(text: string, names: readonly string[]): string[] {
  const own = names.map(norm).filter((n) => n.length > 0);
  return text
    .split(/\s+[-—–]\s+|\s*[:/\n]\s*/)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter((p) => TOWN_WORD.test(p) && p.length <= LABEL_MAX && p.split(" ").length >= 2)
    .filter((p) => !own.some((n) => norm(p).includes(n)))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
}

/** Расы, названные на табличке («Город Пчел - Рой» → Пчела). */
export const signRaces = (text: string): string[] => [
  ...new Set(labelParts(text, []).flatMap((p) => racesFromName(p))),
];

/** Подпись: чаще всех, с бонусом за имя расы; ничья — короче, потом по алфавиту. */
export function bestLabel(parts: readonly string[], race: string | null): string | null {
  const count = new Map<string, number>();
  for (const p of parts) count.set(p, (count.get(p) ?? 0) + 1);
  const scored = [...count].map(([p, n]) => ({
    p,
    score: n + (race !== null && racesFromName(p).includes(race) ? RACE_BONUS : 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.p.length - b.p.length || (a.p < b.p ? -1 : 1));
  return scored[0]?.p ?? null;
}

/** Самый частый облик (шаблон и облик) среди построек. */
export function commonLook(
  rows: ReadonlyArray<{ tpl: string; skin: string | null }>,
): { t: string; s: string | null } | null {
  const count = new Map<string, { t: string; s: string | null; n: number }>();
  for (const r of rows) {
    const k = `${r.tpl}|${r.skin ?? ""}`;
    const c = count.get(k) ?? { t: r.tpl, s: r.skin, n: 0 };
    c.n += 1;
    count.set(k, c);
  }
  const best = [...count].sort(([ka, a], [kb, b]) => b.n - a.n || (ka < kb ? -1 : 1))[0];
  return best ? { t: best[1].t, s: best[1].s } : null;
}
