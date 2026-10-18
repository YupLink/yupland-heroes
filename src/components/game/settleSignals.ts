// Сигналы «экран дорисован» — их ставят карта и замок, читает useScreenSettled.
//
// Данные пришли — ещё не значит, что игрок видит игру: кадр карты печёт
// статику порциями, разведанное догоняет с сервера, картинки качаются по
// требованию кадра. Пока это не кончилось, на карте квадратики-заглушки, и
// заставка держится (владелец, 12.10.2026: «пускать в игру, когда всё
// прогрузилось»). Модуль, а не состояние React: пишут сюда из цикла кадров и
// из ответов сети, где перерисовка ни к чему.

const signals = {
  /** Сколько кадров нарисовала карта с последнего монтирования. */
  frames: 0,
  /** Последний кадр не допёк статику — следующий допечёт. */
  baking: true,
  /** Разведанное хоть раз пришло с сервера (или запрос упал — ждать нечего). */
  fogPulled: false,
  /** Картинки замка загружены (или не загрузились — замок покажет ошибку сам). */
  castleArt: false,
};

/** Карта смонтирована заново: прежние кадры и туман — не про неё. */
export function noteMapMount(): void {
  signals.frames = 0;
  signals.baking = true;
  signals.fogPulled = false;
}

/** Кадр карты нарисован; more — статика ещё печётся. */
export function noteMapFrame(more: boolean): void {
  signals.frames++;
  signals.baking = more;
}

export function noteFogPulled(): void {
  signals.fogPulled = true;
}

export function noteCastleArt(): void {
  signals.castleArt = true;
}

export function settleSignals(): Readonly<typeof signals> {
  return signals;
}
