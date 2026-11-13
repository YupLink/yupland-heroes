// Шрифты «Вестника героев» (OFL, подмножества @fontsource — см. fonts/LICENSE-OFL.txt).
//
// Кириллица и латиница — отдельными файлами, а satori не подменяет глиф внутри
// одного имени: латиница идёт своим именем ПЕРВОЙ в цепочке («PlayL, Play»),
// буквы, которых в ней нет, добираются из кириллического файла.
// Цифры и ники — только PT Serif: в Playfair цифры «старого стиля», и 0 там
// читается как «o» (ник «…0» → «…o»).
// Файлы вшиты в серверную сборку (?inline): ни диска, ни сети при рисовании.
import playCyr from "./fonts/playfair-display-cyrillic-900-normal.woff?inline";
import playLat from "./fonts/playfair-display-latin-900-normal.woff?inline";
import serifCyr from "./fonts/pt-serif-cyrillic-400-normal.woff?inline";
import serifLat from "./fonts/pt-serif-latin-400-normal.woff?inline";
import serifBoldCyr from "./fonts/pt-serif-cyrillic-700-normal.woff?inline";
import serifBoldLat from "./fonts/pt-serif-latin-700-normal.woff?inline";
import oswCyr from "./fonts/oswald-cyrillic-600-normal.woff?inline";
import oswLat from "./fonts/oswald-latin-600-normal.woff?inline";

export type VestnikFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 900;
  style: "normal";
};

/** Цепочки для fontFamily: латиница первой, кириллица — запасом. */
export const FONT = {
  head: "PlayL, Play",
  body: "SerifL, Serif",
  label: "OswL, Osw",
} as const;

/** data:…;base64,XXXX → байты. */
export function fromDataUri(uri: string): Buffer {
  return Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
}

let cached: VestnikFont[] | null = null;

export function vestnikFonts(): VestnikFont[] {
  if (cached) return cached;
  const f = (name: string, uri: string, weight: VestnikFont["weight"]): VestnikFont => ({
    name,
    data: fromDataUri(uri),
    weight,
    style: "normal",
  });
  cached = [
    f("PlayL", playLat, 900),
    f("Play", playCyr, 900),
    f("SerifL", serifLat, 400),
    f("Serif", serifCyr, 400),
    f("SerifL", serifBoldLat, 700),
    f("Serif", serifBoldCyr, 700),
    f("OswL", oswLat, 600),
    f("Osw", oswCyr, 600),
  ];
  return cached;
}
