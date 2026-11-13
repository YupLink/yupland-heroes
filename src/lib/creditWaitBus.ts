// Ожидание зачисления заведено (пополнение подписано, NFT отправлена) — глобальный
// сторож (CreditNoticesWatcher, корень приложения) сам сходит за зачислением после
// обещанной минуты, даже если окно пополнения уже закрыто: его таймеры гибли вместе
// с окном, и деньги доходили только при новом входе в Казну (владелец, 26.10.2026).
type Handler = () => void;

const handlers = new Set<Handler>();

/** Завели ожидание — сторож назначит заходы за зачислением. */
export function armCreditWatch(): void {
  for (const h of handlers) {
    try {
      h();
    } catch {
      /* сторож не должен ронять пополнение */
    }
  }
}

/** Подписка сторожа; возвращает отписку. */
export function onCreditWatch(h: Handler): () => void {
  handlers.add(h);
  return () => {
    handlers.delete(h);
  };
}
