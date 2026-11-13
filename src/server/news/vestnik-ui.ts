// Кирпичики вёрстки «Вестника героев» для satori: страница 1080×1350 (4:5 —
// так Telegram показывает картинку крупно), бумага, шапка, рубрики, таблица
// цифр, строки лидеров, подвал и промокод мелко у правого края.
// У satori каждый блок с несколькими детьми обязан быть flex — h() ставит сам.
import { FONT } from "./vestnik-fonts";
import type { Pic } from "./vestnik-images";

export type El = { type: string; props: Record<string, unknown> };
type Child = El | string | null | false | undefined;
type Style = Record<string, string | number>;

export const W = 1080;
export const H = 1350;
export const PAD = 56;
export const INNER = W - PAD * 2;

export const C = {
  ink: "#1c1b19",
  paper: "#f1ece1",
  teal: "#2c5e62",
  muted: "#3a3833",
  faint: "#9a9385",
};

export function h(type: string, style: Style, ...children: Child[]): El {
  const kids = children.filter(
    (c): c is El | string => c !== null && c !== false && c !== undefined,
  );
  return { type, props: { style: { display: "flex", ...style }, children: kids } };
}

export const img = (p: Pic, style: Style = {}): El => ({
  type: "img",
  props: { src: p.src, width: p.width, height: p.height, style },
});

export function page(...children: Child[]): El {
  return h(
    "div",
    {
      // Ширина без полей: у satori поля прибавляются к ширине, а холст — ровно W×H.
      width: INNER,
      height: H - 84,
      flexDirection: "column",
      padding: `44px ${PAD}px 40px`,
      backgroundColor: C.paper,
      backgroundImage: "linear-gradient(160deg, #f7f3ea 0%, #f1ece1 55%, #e8dfcc 100%)",
      color: C.ink,
      fontFamily: FONT.body,
      position: "relative",
    },
    ...children,
  );
}

/** Шапка: большая — первая страница, малая — вторая. */
export function masthead(big: boolean, left: string, right: string): El {
  return h(
    "div",
    { flexDirection: "column", flexShrink: 0 },
    h(
      "div",
      {
        flexDirection: "column",
        alignItems: "center",
        borderBottom: `4px double ${C.ink}`,
        paddingBottom: 8,
      },
      h(
        "div",
        { fontFamily: FONT.head, fontSize: big ? 100 : 64, lineHeight: 1 },
        "ВЕСТНИК ГЕРОЕВ",
      ),
      big &&
        h(
          "div",
          { fontFamily: FONT.label, fontSize: 22, letterSpacing: 6, color: C.teal, marginTop: 6 },
          "YUPLAND HEROES",
        ),
    ),
    h(
      "div",
      {
        justifyContent: "space-between",
        fontSize: 20,
        padding: "8px 2px",
        borderBottom: `1px solid ${C.ink}`,
      },
      // Каждая строка — своим блоком: соседние строки satori склеил бы в одну.
      h("div", {}, left),
      h("div", {}, right),
    ),
  );
}

export const label = (text: string, top = 22): El =>
  h(
    "div",
    { marginTop: top, marginBottom: 10, flexShrink: 0 },
    h(
      "div",
      {
        backgroundColor: C.teal,
        color: "#fff",
        fontFamily: FONT.label,
        fontSize: 21,
        letterSpacing: 2.5,
        padding: "4px 14px",
      },
      text.toUpperCase(),
    ),
  );

/** Заголовок: длинный — мельче, чтобы влезал в одну-две строки. */
export function headline(text: string): El {
  const size = text.length <= 20 ? 74 : text.length <= 26 ? 60 : 50;
  return h("div", { fontFamily: FONT.head, fontSize: size, lineHeight: 1.04, flexShrink: 0 }, text);
}

export const lead = (text: string): El =>
  h("div", { fontSize: 28, lineHeight: 1.3, marginTop: 8, flexShrink: 0 }, text);

/** Ширина ячейки цифр: у satori поля и рамка прибавляются к ширине. */
const CELL = Math.floor((INNER - 1) / 3) - 33;

/** Таблица цифр: по три в ряд, число крупно, подпись мелко. */
export function numbers(cells: Array<{ value: string; caption: string }>): El {
  return h(
    "div",
    {
      flexWrap: "wrap",
      flexShrink: 0,
      borderTop: `1px solid ${C.ink}`,
      borderLeft: `1px solid ${C.ink}`,
    },
    ...cells.map((c) =>
      h(
        "div",
        {
          width: CELL,
          flexDirection: "column",
          padding: "8px 16px",
          borderRight: `1px solid ${C.ink}`,
          borderBottom: `1px solid ${C.ink}`,
        },
        h("div", { fontSize: 46, fontWeight: 700, lineHeight: 1.05 }, c.value),
        h(
          "div",
          { fontFamily: FONT.label, fontSize: 20, letterSpacing: 1, color: C.muted },
          c.caption.toUpperCase(),
        ),
      ),
    ),
  );
}

/** Строка лидера: что — кто — сколько. */
export const leaderRow = (what: string, who: string, value: string, size = 26): El =>
  h(
    "div",
    {
      alignItems: "baseline",
      padding: "8px 0",
      borderBottom: `1px dotted ${C.faint}`,
      fontSize: size,
    },
    h("div", { marginRight: 12 }, what),
    h("div", { fontWeight: 700 }, who),
    h("div", { marginLeft: "auto", fontWeight: 700, fontSize: size + 3 }, value),
  );

export const bullets = (items: string[], size = 24): El =>
  h(
    "div",
    { flexDirection: "column" },
    ...items.map((t) =>
      h(
        "div",
        { fontSize: size, lineHeight: 1.3, padding: "5px 0" },
        // Квадратик — блоком, не знаком: «■» в подмножествах шрифтов нет.
        h("div", {
          width: 10,
          height: 10,
          backgroundColor: C.teal,
          marginRight: 14,
          marginTop: size * 0.45,
        }),
        h("div", { flex: 1 }, t),
      ),
    ),
  );

/**
 * Подвал: откуда цифры и номер страницы. Промокод выпуска — тут же, мелко и
 * бледно у номера: награда внимательным.
 */
export const footer = (left: string, right: string, code: string | null = null): El =>
  h(
    "div",
    {
      marginTop: "auto",
      flexShrink: 0,
      justifyContent: "space-between",
      alignItems: "baseline",
      borderTop: `1px solid ${C.ink}`,
      paddingTop: 8,
      fontSize: 18,
      color: C.muted,
    },
    h("div", {}, left),
    h(
      "div",
      { alignItems: "baseline" },
      code &&
        h(
          "div",
          {
            fontFamily: FONT.label,
            fontSize: 14,
            letterSpacing: 2,
            color: C.faint,
            marginRight: 14,
          },
          code,
        ),
      h("div", {}, right),
    ),
  );
