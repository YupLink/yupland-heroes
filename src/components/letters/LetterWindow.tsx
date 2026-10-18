// Письмо на весь экран: картинка сверху (если есть), заголовок, текст
// абзацами и одна кнопка «Понятно».
//
// На телефоне — весь экран; на ПК — колонка по центру поверх затемнения.
// Без размытия и свечения (ПРАВИЛА: никаких засветов) — простое затемнение.
// Текст длинный — прокручивается своё тело, кнопка всегда на виду.
// Тот же вид — в админке «Предпросмотр»: владелец видит ровно то, что игрок.
// Английский интерфейс — английская версия, если она есть целиком, иначе русская.
import { useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { resolveImage, thumb } from "@/lib/image";
import { letterInLang, letterParagraphs, type PlayerLetter } from "@/lib/letters";

export function LetterWindow({
  letter,
  position = 1,
  total = 1,
  onOk,
}: {
  letter: PlayerLetter;
  /** Номер письма среди пришедших — «2 из 3», когда их несколько. */
  position?: number;
  total?: number;
  onOk: () => void;
}) {
  const t = useT();
  const { title, body } = letterInLang(letter, useLang());
  // Картинка не загрузилась — письмо без неё, а не пустая рамка.
  const [broken, setBroken] = useState(false);
  const src = letter.image && !broken ? thumb(resolveImage(letter.image), 640) : "";
  const paragraphs = letterParagraphs(body);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`letter-${letter.id}`}
      className="fixed inset-0 z-[250] flex items-stretch justify-center bg-black/85 sm:items-center sm:p-6"
    >
      <div className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl sm:border sm:border-border">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-[env(safe-area-inset-top)] sm:pt-0">
          {src && (
            <img
              src={src}
              alt=""
              onError={() => setBroken(true)}
              className="block max-h-[40dvh] w-full bg-background object-cover"
            />
          )}
          <div className="space-y-3 px-5 pb-4 pt-5">
            {total > 1 && (
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("letter.count", { n: position, total })}
              </p>
            )}
            <h2
              id={`letter-${letter.id}`}
              className="break-words font-display text-2xl font-bold leading-tight text-gold"
            >
              {title}
            </h2>
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="whitespace-pre-line break-words text-[15px] leading-relaxed text-foreground/90"
              >
                {p}
              </p>
            ))}
          </div>
        </div>
        <div className="border-t border-border px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
          <button
            type="button"
            onClick={onOk}
            className="flex h-12 w-full items-center justify-center rounded-xl gradient-gold text-base font-semibold text-gold-foreground active:opacity-90"
          >
            {t("letter.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
