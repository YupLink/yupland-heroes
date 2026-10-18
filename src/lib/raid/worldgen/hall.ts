// Ратуша нового города — сразу автономная (владелец, 06.10.2026: «появившись,
// ратуша может быть автономной, её не нужно настраивать»).
//
// Настройку не выдумываем: берём одну из НАСТРОЕННЫХ ратуш образца (жители,
// правила, товары — числа админа) и даём городу своё имя. Дальше город живёт
// суточным тиком, как любой (town-cron): ест, производит, торгует через свои
// лавки. Имя — из слогов, в духе имён образца («Дур-Бан», «Зу-Гра», «Ирий»).
import { hashCell } from "@/lib/raid/zonegen/town/hex";
import type { TownTemplate } from "@/lib/raid/worldgen/spec";

const HEADS = [
  "Ал",
  "Бар",
  "Вел",
  "Гор",
  "Дур",
  "Зу",
  "Ир",
  "Кар",
  "Ла",
  "Мор",
  "Нор",
  "Ол",
  "Рад",
  "Сол",
  "Тар",
  "Ур",
  "Хал",
  "Эр",
  "Яр",
  "Ве",
];
const TAILS = [
  "бан",
  "гра",
  "дар",
  "рий",
  "на",
  "мир",
  "град",
  "вель",
  "дон",
  "тар",
  "ск",
  "ор",
  "лин",
  "рас",
  "гос",
  "мар",
  "дан",
  "вин",
  "ис",
  "ал",
];

/** Имя города от его сида: «Дур-Бан» или слитно «Ирий». */
export function townName(seed: number): string {
  const h = hashCell(seed, 17, 29);
  const head = HEADS[h % HEADS.length];
  const tail = TAILS[(h >>> 8) % TAILS.length];
  if (((h >>> 16) & 3) === 0) return `${head}-${tail.charAt(0).toUpperCase()}${tail.slice(1)}`;
  return `${head}${tail}`;
}

/** Настройка ратуши: шаблон образца по сиду города + имя; шаблонов нет — пустая. */
export function hallConfig(
  templates: readonly TownTemplate[],
  seed: number,
  name: string,
): Record<string, unknown> {
  if (templates.length === 0) return { name, residents: 0, goods: [] };
  const t = templates[hashCell(seed, 41, 7) % templates.length];
  return { name, residents: t.residents, rules: t.rules, goods: t.goods };
}
