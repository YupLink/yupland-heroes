// Камера замка в движении (палец, колесо, щипок). Юпики на это время замирают: их шаги
// перерисовывают сцену, а прокрутке нужна вся видеокарта (16.10.2026).
let until = 0;

export const castleMotion = {
  /** Камеру сдвинули: движение «идёт» ещё ms после последнего сдвига. */
  mark(ms = 200): void {
    until = performance.now() + ms;
  },
  active(now: number = performance.now()): boolean {
    return now < until;
  },
};
