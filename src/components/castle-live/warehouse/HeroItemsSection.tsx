// «Вещи героев» в складе замка (владелец, 06.11.2026): у кого из героев что лежит
// в рюкзаке — карточками, как «Мои вещи в мире». Только просмотр: забрать вещь —
// сделать героя основным в таверне. Основного здесь нет: его рюкзак — вверху окна.
// Грузится, только когда блок раскрыт.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Castle, MapPin, Search, Sprout } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { heroRestView } from "@/components/heroes/heroRestView";
import { getMyHeroesItems, type HeroItemsCard } from "@/server/api/castle-hero-items";
import { ItemArt, WorldFrame, type StoredItem } from "./WarehouseScreen";
import { warehouseImage } from "./warehouseItems";
import "./hero-items.css";

export const HERO_ITEMS_KEY = ["castle-hero-items"] as const;
const PAGE = 8;

/** «Bo - Shield of Seven Storms» → «Bo»: полное имя — в подсказке. */
const shortName = (name: string) => name.split(/\s[-–—]\s/)[0] || name;

const itemsOf = (h: HeroItemsCard): StoredItem[] =>
  h.items.map((s) => ({
    id: s.stackKey,
    stackKey: s.stackKey,
    name: s.name,
    count: s.count,
    kind: s.kind ?? undefined,
    image: thumb(warehouseImage(s) ?? "", 128) || undefined,
  }));

function Status({ h, ru, rest }: { h: HeroItemsCard; ru: boolean; rest: string }) {
  if (h.field) {
    const where = h.field.here ? `${h.field.q}, ${h.field.r}` : (h.field.world ?? `${h.field.q}, ${h.field.r}`);
    return <span className="hi-status is-field" title={h.field.world ?? undefined}><Sprout aria-hidden="true" />{ru ? "На поле" : "In the field"} · {where}</span>;
  }
  if (rest) return <span className="hi-status"><BedDouble aria-hidden="true" />{ru ? "Отдыхает" : "Resting"} · {rest}</span>;
  return <span className="hi-status"><Castle aria-hidden="true" />{ru ? "В замке" : "In the castle"}</span>;
}

export function HeroItemsSection({ lang, disabled = false, onShow, initialOpen = false }: {
  lang: "ru" | "en";
  disabled?: boolean;
  onShow?: (q: number, r: number) => void;
  initialOpen?: boolean;
}) {
  const ru = lang === "ru", t = useT();
  const fmt = (n: number) => n.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 9 });
  const [open, setOpen] = useState(initialOpen), [query, setQuery] = useState(""), [page, setPage] = useState(0);
  const data = useQuery({ queryKey: HERO_ITEMS_KEY, queryFn: () => getMyHeroesItems(), enabled: open, staleTime: 0, refetchOnMount: "always" });
  const q = query.trim().toLocaleLowerCase();
  const heroes = data.data?.heroes ?? [];
  const shown = heroes.filter((h) => !q || h.items.some((i) => i.name.toLocaleLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), safe = Math.min(page, pages - 1);
  const now = Date.now();
  return (
    <section className="wh-world hi-heroes">
      <button className="wh-world-toggle" disabled={disabled} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {ru ? "Вещи героев" : "Heroes' items"} <span>{open ? "⌃" : "⌄"}</span>
      </button>
      {open && <div className="wh-world-content">
        {data.isPending ? <p role="status">{ru ? "Проверяем героев…" : "Checking heroes…"}</p>
          : data.isError ? <p role="alert">{ru ? "Не удалось загрузить героев." : "Could not load heroes."} <button onClick={() => void data.refetch()}>{ru ? "Повторить" : "Retry"}</button></p>
          : <>
            <label className="wh-search"><Search aria-hidden="true" /><input type="search" value={query} placeholder={ru ? "Найти предмет" : "Find item"} aria-label={ru ? "Найти предмет" : "Find item"} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></label>
            <p className="hi-count">{ru ? `Героев с вещами: ${shown.length} из ${data.data.total}` : `Heroes with items: ${shown.length} of ${data.data.total}`}</p>
            <div className="wh-world-grid">{shown.slice(safe * PAGE, safe * PAGE + PAGE).map((h) => {
              const rest = heroRestView(h.restUntil, now, t).left;
              const field = h.field;
              return <article className="wh-world-card hi-card" key={h.id} aria-label={h.name}>
                <WorldFrame />
                <div className="wh-world-card-head hi-head">
                  {h.image ? <img className="hi-face" src={thumb(h.image, 96)} alt="" /> : <span className="hi-face" />}
                  <div className="hi-who"><h3 title={h.name}>{shortName(h.name)}</h3><small>{ru ? "ур." : "lvl"} {h.level}</small></div>
                  {field?.here && onShow && <button type="button" className="wh-world-map hi-map" disabled={disabled} onClick={() => onShow(field.q, field.r)} aria-label={ru ? `Показать поле ${field.q}, ${field.r} на карте` : `Show field ${field.q}, ${field.r} on map`}><MapPin aria-hidden="true" /></button>}
                </div>
                <div className="hi-row"><Status h={h} ru={ru} rest={rest} /></div>
                <div className="wh-world-slots hi-slots">{itemsOf(h).map((i) => {
                  const hit = !!q && i.name.toLocaleLowerCase().includes(q);
                  return <div className={`wh-world-slot${hit ? " hi-hit" : ""}`} key={i.id} title={`${i.name}: ${fmt(i.count)}`}>
                    <WorldFrame cell /><ItemArt item={i} />{i.count !== 1 && <b className={fmt(i.count).length > 5 ? "is-fraction" : undefined}>{fmt(i.count)}</b>}
                  </div>;
                })}</div>
              </article>;
            })}</div>
            {!shown.length && <p>{q ? (ru ? "Ничего не найдено." : "Nothing found.") : (ru ? "У других героев рюкзаки пусты." : "Your other heroes carry nothing.")}</p>}
            {pages > 1 && <nav className="wh-pages" aria-label={ru ? "Страницы героев" : "Hero pages"}>
              <button aria-label={ru ? "Предыдущие герои" : "Previous heroes"} disabled={safe === 0 || disabled} onClick={() => setPage(safe - 1)}>‹</button>{safe + 1} / {pages}
              <button aria-label={ru ? "Следующие герои" : "Next heroes"} disabled={safe === pages - 1 || disabled} onClick={() => setPage(safe + 1)}>›</button>
            </nav>}
          </>}
      </div>}
    </section>
  );
}
