import { useEffect, useState } from "react";
import { useSpellbook } from "@/components/beta-raid/spellbook/useSpellbook";
import {
  cooldownClock,
  spellBlock,
  spellGiftLines,
} from "@/components/beta-raid/spellbook/spellText";
import { useLang, useT } from "@/lib/i18n";
import { useOblivion } from "@/lib/hooks/useOblivion";
import type { SpellBookEntry } from "@/server/api/beta-raid/spell-book";
import { SpellForgetConfirm } from "@/components/beta-raid/spellbook/SpellForgetConfirm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./tavern-spellbook.css";

export function TavernSpellbook({
  heroId,
  readOnly = false,
}: {
  heroId?: string;
  readOnly?: boolean;
  hideOwner?: boolean;
}) {
  const { book, spells, energy, energyQuery, cast, forget } = useSpellbook({ heroId, readOnly });
  // «Забыть» — как в прежней книге (SpellbookGrid, §8.17): только своя книга и
  // только пока висит «Забвение». В этой книге кнопки не было вовсе, и зелье
  // забвения тратилось впустую (жалоба игроков 09.10.2026).
  const oblivion = useOblivion();
  const [ask, setAsk] = useState<SpellBookEntry | null>(null);
  useEffect(() => {
    if (!oblivion.active) setAsk(null);
  }, [oblivion.active]);
  const canForget = !readOnly && !heroId && oblivion.active;
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const ru = lang === "ru";
  const [selected, setSelected] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const data = book.data;
  const total = Math.max(0, data?.slots.total ?? 0);
  useEffect(() => {
    setSelected(0);
    setFailedImages([]);
  }, [heroId]);
  const current = Math.min(selected, Math.max(0, total - 1));
  const entry = spells[current];
  const block = entry ? spellBlock(entry, energy, t) : null;
  const energyUnavailable = energy === null || energyQuery.isError;
  const page = Math.floor(current / 4);
  const pages = Math.ceil(total / 4);
  const group = page * 4;
  const slots = Array.from(
    { length: Math.min(4, Math.max(0, total - group)) },
    (_, i) => group + i,
  );
  if (book.isError)
    return (
      <div role="alert">
        <p>{ru ? "Не удалось загрузить книгу заклинаний" : "Unable to load spellbook"}</p>
        <button data-game-button="secondary" onClick={() => void book.refetch()}>
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  if (!data || book.isFetching)
    return <p role="status">{ru ? "Проверяем книгу заклинаний…" : "Checking spellbook…"}</p>;
  if (!data?.hero)
    return <p>{ru ? "У этого героя пока нет книги" : "No spellbook for this hero"}</p>;
  const icon = (index: number) => {
    const s = spells[index];
    return s?.image && !failedImages.includes(s.id) ? (
      <img src={s.image} alt="" onError={() => setFailedImages((a) => [...a, s.id])} />
    ) : s ? (
      <svg className="wind" viewBox="0 0 100 100" aria-hidden="true">
        <path d="M12 32h60c18 0 18-20 4-20-8 0-11 5-12 9M8 50h83M18 68h51c17 0 17 20 3 20-8 0-11-5-12-9" />
        <path d="m28 25 9 7-9 7m25 22 9 7-9 7" />
      </svg>
    ) : (
      index + 1
    );
  };
  return (
    <div data-book-preview>
      <div className="stats">
        <span>
          {ru ? `Занято ${data.slots.used} из ${total}` : `${data.slots.used} of ${total} filled`}
        </span>
        <span>
          <img src="/design-assets/book-energy.png" alt="" />
          {ru ? "Энергия" : "Energy"}: {energyQuery.isError ? "—" : (energy ?? "…")}
        </span>
      </div>
      {energyQuery.isError && !readOnly && !heroId && (
        <p role="alert">
          {ru ? "Не удалось проверить энергию." : "Could not check energy."}{" "}
          <button
            data-game-button="secondary"
            type="button"
            onClick={() => void energyQuery.refetch()}
          >
            {ru ? "Повторить" : "Retry"}
          </button>
        </p>
      )}
      {total > 0 ? (
        <>
          <div className="book book-index">
            <div className="index-list" aria-label={ru ? "Записи книги" : "Book entries"}>
              {slots.map((index) => {
                const s = spells[index];
                const b = s ? spellBlock(s, energy, t) : null;
                return (
                  <button
                    data-game-button="surface"
                    key={index}
                    type="button"
                    aria-current={index === current ? "page" : undefined}
                    className={b ? "is-unavailable" : undefined}
                    aria-label={
                      s
                        ? `${s.name}${b ? `: ${b.text}` : ""}`
                        : ru
                          ? `Запись ${index + 1}: свободно`
                          : `Entry ${index + 1}: empty`
                    }
                    onClick={() => setSelected(index)}
                  >
                    {icon(index)}
                    {b && (
                      <span
                        className={`slot-badge ${b.waiting ? "timer" : "lock"}`}
                        aria-hidden="true"
                      >
                        {b.waiting ? cooldownClock(s.cooldownLeftSec) : ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="index-detail">
              <span className="smallcap">
                {ru ? `Запись ${current + 1} из ${total}` : `Entry ${current + 1} of ${total}`}
              </span>
              <div className="paper-rule" />
              {entry ? (
                <>
                  <div className="known">
                    <h3 className="spell-name">{entry.name}</h3>
                    <p className="effect">{spellGiftLines(entry, lang, t).join(" · ")}</p>
                    <p className={`availability ${block ? "blocked" : ""}`}>
                      {block?.text ?? (ru ? "Готово к использованию" : "Ready to use")}
                    </p>
                    <p className="spell-meta">
                      {ru ? "После применения: откат" : "After use: cooldown"}{" "}
                      {entry.cooldownMinutes} {ru ? "мин" : "min"}
                    </p>
                  </div>
                  {!readOnly && !heroId && (
                    <button
                      data-game-button="primary"
                      type="button"
                      className="book-action"
                      disabled={!!block || cast.isPending || energyUnavailable}
                      aria-label={
                        block
                          ? `${block.text}. ${entry.energyCost}`
                          : energyUnavailable
                            ? ru
                              ? "Проверяем энергию"
                              : "Checking energy"
                            : `${ru ? "Использовать за" : "Use for"} ${entry.energyCost} ${ru ? "энергии" : "energy"}`
                      }
                      onClick={() => cast.mutate({ spellId: entry.id, expect: entry.energyCost })}
                    >
                      <span>{ru ? "Использовать" : "Use"}</span>
                      <small>
                        <img src="/design-assets/book-energy.png" alt="" />
                        <span>{entry.energyCost}</span>
                      </small>
                    </button>
                  )}
                  {canForget && (
                    <button
                      data-game-button="secondary"
                      type="button"
                      className="book-action book-forget"
                      disabled={forget.isPending}
                      onClick={() => setAsk(entry)}
                    >
                      <span>{ru ? "Забыть" : "Forget"}</span>
                    </button>
                  )}
                </>
              ) : (
                <div className="free">
                  <b>{ru ? "Свободная запись" : "Empty entry"}</b>
                  <p>{ru ? "Заклинание ещё не изучено" : "Spell not learned yet"}</p>
                </div>
              )}
            </div>
            {pages > 1 && (
              <nav className="book-nav" aria-label={ru ? "Страницы книги" : "Book pages"}>
                <button
                  data-game-button="icon"
                  type="button"
                  disabled={page === 0}
                  aria-label={ru ? "Предыдущая страница" : "Previous entry"}
                  onClick={() => setSelected(group - 4)}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  data-game-button="icon"
                  type="button"
                  disabled={page === pages - 1}
                  aria-label={ru ? "Следующая страница" : "Next entry"}
                  onClick={() => setSelected(group + 4)}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
        </>
      ) : (
        <p>{ru ? "В книге пока нет ячеек" : "No spellbook slots yet"}</p>
      )}
      {ask && canForget && (
        <SpellForgetConfirm
          name={ask.name}
          image={ask.image}
          busy={forget.isPending}
          onCancel={() => setAsk(null)}
          onConfirm={() =>
            forget.mutate({ spellId: ask.id, name: ask.name }, { onSettled: () => setAsk(null) })
          }
        />
      )}
    </div>
  );
}
