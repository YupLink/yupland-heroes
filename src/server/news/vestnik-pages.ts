// Страницы «Вестника героев»: выпуск дня — одна страница, сводка недели — две.
// Всё из сводки (NewsDigest): цифры, лидеры, «Что нового». Промокод — мелко у
// правого края последней страницы.
import { fmtNum } from "@/lib/news/newsText";
import type { NewsDigest, NewsLang, NewsLeader } from "@/lib/news/types";
import type { IssueWindow } from "@/lib/news/vestnikWindow";
import { footerText, mainStory, metaLine, otherNews, tr } from "./vestnik-copy";
import { landscape } from "./vestnik-illus";
import { pic } from "./vestnik-images";
import * as ui from "./vestnik-ui";

const n = (v: number, lang: NewsLang) => fmtNum(v, lang);

function numberCells(d: NewsDigest, lang: NewsLang) {
  const t = d.totals;
  return [
    { value: n(t.active, lang), caption: tr("players", lang) },
    { value: n(t.steps, lang), caption: tr("steps", lang) },
    { value: n(t.energy, lang), caption: tr("energy", lang) },
    {
      value: n(t.fights, lang),
      caption: `${tr("fights", lang)}, ${tr("wins", lang)} ${n(t.wins, lang)}`,
    },
    { value: n(t.gathered, lang), caption: tr("gathered", lang) },
    { value: n(t.mines, lang), caption: tr("mines", lang) },
  ];
}

/** Первый на каждой доске активности; пустые доски не печатаем. */
function leaderRows(d: NewsDigest, lang: NewsLang, size: number): ui.El[] {
  const boards = [
    ["rowSteps", d.leaders.steps],
    ["rowFights", d.leaders.fights],
    ["rowGathered", d.leaders.gathered],
    ["rowMines", d.leaders.mines],
  ] as const;
  return boards
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ui.leaderRow(tr(key, lang), list[0].name, n(list[0].value, lang), size));
}

async function front(
  w: IssueWindow,
  d: NewsDigest,
  lang: NewsLang,
  height: number,
  variant: number,
) {
  const story = mainStory(d, lang, variant);
  const [left, right] = metaLine(w, d, lang);
  // Главная картинка — пейзаж из сцен игры (владелец 29.10: ИИ-картинки «тупые», только природа).
  const picture = await landscape(w.date, height, variant);
  return {
    story,
    blocks: [
      ui.masthead(true, left, right),
      ui.label(tr(w.kind === "day" ? "mainDay" : "mainWeek", lang)),
      ui.headline(story.title),
      story.lead ? ui.lead(story.lead) : null,
      picture,
      ui.label(tr(w.kind === "day" ? "numDay" : "numWeek", lang)),
      ui.numbers(numberCells(d, lang)),
    ],
  };
}

/** Выпуск дня: главное, цифры, герои дня и ещё новости дня. */
export async function dayPages(
  w: IssueWindow,
  d: NewsDigest,
  lang: NewsLang,
  promo: string | null,
  variant = 0,
): Promise<ui.El[]> {
  const { story, blocks } = await front(w, d, lang, 240, variant);
  // Правая колонка: о чём говорят в чате сообщества, а нет пересказа — ещё новости дня.
  const talk = (d.discussions ?? []).slice(0, 3);
  const more = talk.length ? talk : otherNews(d, story, 2);
  const columns = ui.h(
    "div",
    { gap: 28 },
    ui.h(
      "div",
      { flexDirection: "column", width: more.length ? 520 : ui.INNER },
      ui.label(tr("heroes", lang)),
      ...leaderRows(d, lang, 24),
    ),
    more.length > 0 &&
      ui.h(
        "div",
        { flexDirection: "column", flex: 1 },
        ui.label(tr(talk.length ? "talk" : "more", lang)),
        ui.bullets(more, 21),
      ),
  );
  return [ui.page(...blocks, columns, ui.footer(footerText(d, lang), "1", promo))];
}

async function richCard(l: NewsLeader, place: number, lang: NewsLang): Promise<ui.El> {
  const face = l.portrait ? await pic(l.portrait, 288, 220, "cover") : null;
  return ui.h(
    "div",
    {
      width: 310,
      flexDirection: "column",
      alignItems: "center",
      border: `1px solid ${ui.C.ink}`,
      padding: 10,
    },
    face ? ui.img(face, { border: `1px solid ${ui.C.ink}` }) : ui.h("div", { height: 220 }),
    ui.h(
      "div",
      { fontFamily: "OswL, Osw", color: ui.C.teal, fontSize: 21, letterSpacing: 2, marginTop: 8 },
      `${place} ${tr("place", lang).toUpperCase()}`,
    ),
    ui.h("div", { fontWeight: 700, fontSize: 27, marginTop: 2 }, l.name),
    ui.h("div", { fontSize: 23, marginTop: 2 }, `${n(l.value, lang)} ${tr("gold", lang)}`),
  );
}

/** Сводка недели: страница 1 — главное и цифры, 2 — богачи, рекорды, новости. */
export async function weekPages(
  w: IssueWindow,
  d: NewsDigest,
  lang: NewsLang,
  promo: string | null,
  variant = 0,
): Promise<ui.El[]> {
  const { story, blocks } = await front(w, d, lang, 440, variant);
  const [left, right] = metaLine(w, d, lang);
  const cards = await Promise.all(
    d.leaders.gold.slice(0, 3).map((l, i) => richCard(l, i + 1, lang)),
  );
  // Есть пересказ чата — по три пункта «что обсуждали» и «что нового», чтобы влезло.
  const talk = (d.discussions ?? []).slice(0, 3);
  const news = otherNews(d, story, talk.length ? 3 : 6);
  const second = ui.page(
    ui.masthead(false, left, right),
    cards.length > 0 && ui.label(tr("rich", lang)),
    cards.length > 0 && ui.h("div", { justifyContent: "space-between" }, ...cards),
    ui.label(tr("records", lang)),
    ...leaderRows(d, lang, 26),
    talk.length > 0 && ui.label(tr("talk", lang)),
    talk.length > 0 && ui.bullets(talk, 21),
    news.length > 0 && ui.label(tr("news", lang)),
    news.length > 0 && ui.bullets(news, talk.length ? 21 : 23),
    ui.footer(footerText(d, lang), "2", promo),
  );
  return [ui.page(...blocks, ui.footer(footerText(d, lang), "1")), second];
}
