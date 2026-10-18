// Блок обмена на плитке витрины: одна подпись направления и под ней строки
// «картинка · ×N · имя».
//
// ПОЧЕМУ строками, а не одной фразой. Плитка в гриде 3-в-ряд шириной около 85
// px: фраза «2 слитка железа и золотой слиток» в неё не влезает никогда и
// раньше обрывалась многоточием — игрок не видел, на что меняет товар. Строка
// переносится (до трёх), число стоит впереди и не уезжает, а картинка
// опознаётся быстрее любого текста.
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { numText } from "./num";
import type { ExchangeEntry } from "./exchange";

export function ExchangeList({
  title,
  entries,
  tone,
}: {
  /** «Отдаёшь» / «Получишь» — направление сделки словом, а не только цветом. */
  title: string;
  entries: ExchangeEntry[];
  /** pay — жёлтым (уходит от игрока), get — зелёным (приходит игроку). */
  tone: "pay" | "get";
}) {
  // Язык нужен САМОЙ строке: перенос по слогам браузер делает по словарю, а
  // словарь он выбирает по lang. Корневой html прибит к "ru", и без этой
  // пометки английские имена ломались бы по русским правилам.
  const lang = useLang();
  if (entries.length === 0) return null;
  const color = tone === "pay" ? "text-gold" : "text-emerald-400";
  return (
    <div className="border-t border-border/50 pt-1">
      <div className={`text-[9px] font-bold uppercase tracking-wider opacity-80 ${color}`}>
        {title}
      </div>
      <div className="mt-0.5 space-y-0.5">
        {entries.map((e, i) => (
          <div
            // Ключ по индексу: строк максимум две (цена и «алхимия»), и они
            // не переставляются — переиспользовать нечего.
            key={i}
            className="flex items-start gap-1"
            title={`${numText(e.amount)} × ${e.label}`}
          >
            {e.image ? (
              <img
                // Через прокси: шаблоны лежат полноразмерными, а строка 14 px.
                src={e.pixel ? e.image : thumb(e.image, 64)}
                alt=""
                loading="lazy"
                decoding="async"
                className={`mt-px h-3.5 w-3.5 shrink-0 object-contain ${
                  e.pixel ? "[image-rendering:pixelated]" : ""
                }`}
              />
            ) : (
              // Пустое место РОВНО той же ширины: у билетов и токенов картинки
              // нет, и без распорки их строка съезжала влево от соседних —
              // столбик текста в блоке из двух строк переставал быть столбиком.
              <span aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
            )}
            <span
              lang={lang}
              // Перенос СНАЧАЛА по словам, затем по слогам (hyphens-auto), и
              // только в самом безвыходном случае — посреди слова. Раньше
              // «легендарный» в 85-пиксельной плитке рвался как придётся.
              className={`line-clamp-3 min-w-0 hyphens-auto break-words text-[10px] font-medium leading-tight ${color}`}
            >
              <b className="tabular-nums">×{numText(e.amount)}</b> {e.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
