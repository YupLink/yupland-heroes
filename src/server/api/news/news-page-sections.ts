// Разделы страницы газеты (news-page.ts): итоги, турниры, лидеры, что нового,
// что обсуждают. Чистые функции «данные → HTML»; всё, что пришло из базы, —
// через esc().
import type { NewsBoard, NewsDigest, NewsLang, NewsTotals, NewsTour } from "@/lib/news/types";
import { ACTIVITY_BOARDS, WEALTH_BOARDS } from "@/lib/news/types";
import { fmtNum } from "@/lib/news/newsText";

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const tr = (lang: NewsLang, ru: string, en: string) => (lang === "en" ? en : ru);

const TOTALS: Array<[keyof NewsTotals, string, string]> = [
  ["active", "Играли", "Played"],
  ["newPlayers", "Новых", "New"],
  ["steps", "Шагов", "Steps"],
  ["energy", "Энергии", "Energy"],
  ["fights", "Боёв", "Fights"],
  ["wins", "Побед", "Wins"],
  ["gathered", "Рубки и добычи", "Chopping & mining"],
  ["mines", "Захватов шахт", "Mine captures"],
  ["planted", "Посажено деревьев", "Trees planted"],
  ["land", "Клеток земли", "Land cells"],
  ["dynamite", "Динамита", "Dynamite"],
  ["gold", "Золота на руках", "Gold held"],
  ["diamonds", "Алмазов на руках", "Diamonds held"],
  ["darai", "DARAI на руках", "DARAI held"],
];

const BOARDS: Record<NewsBoard, [string, string]> = {
  gold: ["Золото", "Gold"],
  diamonds: ["Алмазы", "Diamonds"],
  darai: ["DARAI", "DARAI"],
  wood: ["Дерево", "Wood"],
  stone: ["Камень", "Stone"],
  steps: ["Шаги", "Steps"],
  energy: ["Энергия", "Energy"],
  fights: ["Бои", "Fights"],
  gathered: ["Рубка и добыча", "Chopping & mining"],
  mines: ["Захваты шахт", "Mine captures"],
};

export function totalsHtml(d: NewsDigest, lang: NewsLang): string {
  const cells = TOTALS.map(([k, ru, en]) => {
    const v = Number(d.totals[k] ?? 0);
    return `<div class="tile"><b>${esc(fmtNum(v, lang))}</b><span>${esc(tr(lang, ru, en))}</span></div>`;
  }).join("");
  return `<section><h2>${tr(lang, "Итоги", "Totals")}</h2><div class="grid">${cells}</div></section>`;
}

function boardHtml(d: NewsDigest, b: NewsBoard, lang: NewsLang): string {
  const list = d.leaders[b] ?? [];
  if (!list.length) return "";
  const rows = list
    .map(
      (l, i) =>
        `<li><span class="n">${i + 1}</span><span class="who">${esc(l.name)}</span><span class="v">${esc(fmtNum(l.value, lang))}</span></li>`,
    )
    .join("");
  return `<div class="board"><h3>${esc(tr(lang, ...BOARDS[b]))}</h3><ol>${rows}</ol></div>`;
}

export function leadersHtml(d: NewsDigest, lang: NewsLang): string {
  const wealth = WEALTH_BOARDS.map((b) => boardHtml(d, b, lang)).join("");
  const act = ACTIVITY_BOARDS.map((b) => boardHtml(d, b, lang)).join("");
  return `<section><h2>${tr(lang, "Богачи", "Richest")}</h2><div class="boards">${wealth}</div></section>
    <section><h2>${tr(lang, "Самые активные", "Most active")}</h2><div class="boards">${act}</div></section>`;
}

function tourHtml(t: NewsTour, lang: NewsLang): string {
  const top = t.leaders
    .slice(0, 5)
    .map(
      (l) =>
        `<li><span class="n">${l.place}</span><span class="who">${esc(l.name)}</span><span class="v">${esc(fmtNum(l.score, lang))}</span></li>`,
    )
    .join("");
  return `<div class="card"><h3>${esc(t.name)} <small>${esc(t.category)}</small></h3>
    <p>${esc(t.goal)}</p><p class="mut">${esc(t.term)}</p><p>${esc(t.prizes)}</p>
    <p class="mut">${esc(t.entry)} · ${tr(lang, "записались", "joined")}: ${t.players}</p>
    ${top ? `<ol>${top}</ol>` : ""}</div>`;
}

export function toursHtml(d: NewsDigest, lang: NewsLang): string {
  const t = d.tournaments;
  if (!t || (!t.active.length && !t.soon.length)) return "";
  const act = t.active.map((x) => tourHtml(x, lang)).join("");
  const soon = t.soon.map((x) => tourHtml(x, lang)).join("");
  return `<section><h2>${tr(lang, "Турниры", "Tournaments")}</h2>${act}${
    soon ? `<h3 class="sub">${tr(lang, "Скоро", "Soon")}</h3>${soon}` : ""
  }</section>`;
}

export function updatesHtml(d: NewsDigest, lang: NewsLang): string {
  const days = d.updates
    .filter((u) => u.items.length)
    .map(
      (u) =>
        `<div class="card"><h3>${esc(u.date)}</h3><ul>${u.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`,
    )
    .join("");
  const talk = (d.discussions ?? []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `${days ? `<section><h2>${tr(lang, "Что нового", "What's new")}</h2>${days}</section>` : ""}${
    talk
      ? `<section><h2>${tr(lang, "Что обсуждают", "Talk of the town")}</h2><ul class="card">${talk}</ul></section>`
      : ""
  }`;
}
