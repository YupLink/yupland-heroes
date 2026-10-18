// Как подписать клетку с обликом.
//
// Облик — это раса поверх постройки: «Ратуша» + единорог = «Ратуша единорогов».
// Владелец: подпись = ТИП постройки + раса в родительном падеже. Расу узнаём по
// имени облика (Единорог/Дракон/…), тип — по первому слову базовой постройки
// («Магазин на болотах» → «Магазин»). Раса не распознана — показываем осмысленное
// имя облика как есть, а мусорное имя файла («1000031099») откатываем на базу.

/** Раса в имени облика → её форма в родительном падеже (список владельца). */
const RACE_GENITIVE: Array<{ re: RegExp; gen: string }> = [
  { re: /виходк|выходк/i, gen: "вихоток" },
  { re: /дракош|дракон|драк/i, gen: "дракошек" },
  { re: /единорог/i, gen: "единорогов" },
  { re: /кабан/i, gen: "кабанов" },
  { re: /пчел|пчёл/i, gen: "пчёл" },
  { re: /юпик/i, gen: "юпиков" },
];

const hasLetter = (s: string): boolean => /\p{L}/u.test(s);

/** Раса из имени облика (родительный падеж) или null. */
function raceGenitive(name: string): string | null {
  for (const { re, gen } of RACE_GENITIVE) if (re.test(name)) return gen;
  return null;
}

/** Тип постройки — первое значимое слово базы: «Магазин на болотах» → «Магазин». */
function baseNoun(baseName: string): string {
  const w = baseName
    .trim()
    .split(/[\s—–-]+/u)
    .filter(Boolean)[0];
  return w || baseName.trim();
}

/**
 * Имя клетки с обликом. Раса распознана — «<Тип> <раса в родительном>» («Ратуша
 * единорогов», «Магазин вихоток»). Нет — осмысленное имя облика как есть, иначе
 * имя базовой постройки. Картинку всегда даёт облик, имя — по этому правилу; одно
 * на карту, карточку игрока и черновик пикера.
 */
export function skinDisplayName(
  skinName: string | null | undefined,
  baseName: string | null | undefined,
): string {
  const skin = (skinName ?? "").trim();
  const base = (baseName ?? "").trim();
  const gen = skin ? raceGenitive(skin) : null;
  if (gen && base) return `${baseNoun(base)} ${gen}`;
  if (skin && hasLetter(skin)) return skin;
  return base || skin || "Постройка";
}
