// Книга заклинаний ВЫБРАННОГО героя одним блоком.
//
// Как рюкзак (BackpackGrid): один презентационный компонент на все места, где
// книгу показывают — вкладка замка и окно героя с карты. Своей прокрутки нет
// намеренно: скроллит родительская модалка, а второй вложенный скролл на
// телефоне ловит палец.
//
// Книга принадлежит ГЕРОЮ, а не игроку, поэтому в шапке стоит его имя: сменил
// главного — открылась другая книга, со своими местами и своими откатами.
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Brain, Loader2, Zap } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { useOblivion } from "@/lib/hooks/useOblivion";
import type { SpellBookEntry } from "@/server/api/beta-raid/spell-book";
import { SpellForgetConfirm } from "./SpellForgetConfirm";
import { SpellTile } from "./SpellTile";
import { useSpellbook } from "./useSpellbook";

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-bold">
      {children}
    </span>
  );
}

export function SpellbookGrid({
  heroId,
  readOnly = false,
}: { heroId?: string; readOnly?: boolean } = {}) {
  const ru = useLang() === "ru";
  const t = useT();
  const { book, spells, energy, cast, forget } = useSpellbook({ heroId, readOnly });
  // «Забыть» — только пока висит эффект «Забвение» (уровень или время).
  const oblivion = useOblivion();
  /** Какое заклинание сейчас спрашиваем «забыть?» — окно подтверждения. */
  const [ask, setAsk] = useState<SpellBookEntry | null>(null);
  // Эффект кончился при открытом «Забыть?» — выбор сбрасываем: иначе окно
  // всплыло бы само со следующим эффектом, без нажатия.
  useEffect(() => {
    if (!oblivion.active) setAsk(null);
  }, [oblivion.active]);
  const data = book.data;
  // Крутилку показываем только на первой загрузке: при обновлении после каста
  // книга уже нарисована, и подмена её спиннером выглядела бы миганием.
  // Ошибка — только когда рисовать нечего: неудачный рефетч после каста не
  // должен стирать уже нарисованную книгу с тикающими откатами.
  if (book.isError && !data)
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p>{ru ? "Не удалось загрузить книгу заклинаний" : "Unable to load spellbook"}</p>
        <button className="rounded border p-2" onClick={() => void book.refetch()}>
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  // Просмотр по id — только успешный ответ (ключ «view» не персистится).
  if ((heroId && !book.isSuccess) || (book.isLoading && !data)) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      </div>
    );
  }

  // Героя нет — книги нет: у книги владелец герой, а не аккаунт.
  if (!data || !data.hero) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        {t("braid.spell_no_hero")}
      </p>
    );
  }

  const hero = data.hero;
  const casting = cast.isPending ? cast.variables.spellId : null;
  // Забыть можно только в своей книге (просмотр героя по id — без правок) и
  // только с эффектом «Забвение»: без него кнопки нет вовсе.
  const canForget = !readOnly && !heroId && oblivion.active;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-gold">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t("braid.spell_owner", { hero: hero.name })}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Вместимость книги: сколько мест занято из всех. */}
        <Chip>{t("braid.spell_slots", { used: data.slots.used, total: data.slots.total })}</Chip>
        {/* Энергию показываем, только когда баланс приехал: «Энергия: 0» на
            полсекунды пугает сильнее, чем её отсутствие. */}
        {energy !== null && (
          <Chip>
            <Zap className="h-3 w-3 text-gold" />
            {t("braid.spell_energy_have", { n: energy })}
          </Chip>
        )}
        {/* Скидка от интеллекта — только когда она есть: «−0%» ничего не
            объясняет и лишь занимает строку на телефоне. */}
        {data.discountPercent > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-bold text-gold">
            <Brain className="h-3 w-3" />
            {t("braid.spell_discount", {
              int: hero.intellect,
              percent: data.discountPercent,
            })}
          </span>
        )}
      </div>

      {/* Список строк-плиток: на телефоне 1 в ряд, на десктопе 2. Прошлая
          сетка 2/3 на телефоне ломала заголовки — «+…», «П…» — в узкую
          колонку. Пустые слоты тоже тонкие, чтобы «сколько ещё влезет»
          читалось с одного взгляда, но без стены пустых квадратов. */}
      <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {spells.map((s) => (
          <SpellTile
            key={s.id}
            entry={s}
            energy={energy}
            busy={casting === s.id}
            readOnly={readOnly || !!heroId}
            onCast={() => cast.mutate({ spellId: s.id, expect: s.energyCost })}
            onForget={canForget ? () => setAsk(s) : undefined}
          />
        ))}
        {Array.from({ length: Math.max(0, data.slots.total - spells.length) }, (_, i) => (
          <div
            key={`free-${i}`}
            aria-hidden
            className="flex h-12 items-center justify-center rounded-2xl border border-dashed border-border/40 bg-background/20"
          >
            <BookOpen className="h-4 w-4 text-muted-foreground/30" />
          </div>
        ))}
      </div>

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
