// Замок ещё не готов: грузится, не загрузился или его карта не сохранена.
// Админа не запираем: «Повторить», «В мир», «Прежний экран».
type State = "loading" | "error" | "empty";

export function CastleLoadState({
  ru,
  state,
  onRetry,
  onClassic,
  onWorld,
}: {
  ru: boolean;
  state: State;
  onRetry?: () => void;
  onClassic?: () => void;
  onWorld?: () => void;
}) {
  const text = {
    loading: ru ? "Открываем замок…" : "Opening the castle…",
    error: ru ? "Не удалось загрузить замок." : "Unable to load the castle.",
    empty: ru ? "Карта замка пока не сохранена." : "The castle map has not been saved yet.",
  }[state];
  const button = "min-h-11 rounded-xl border border-border px-4";
  return (
    <main className="fixed inset-0 grid place-items-center bg-background p-6 text-foreground">
      <section className="max-w-sm space-y-4 text-center">
        <p role={state === "error" ? "alert" : "status"}>{text}</p>
        {state !== "loading" && (
          <div className="flex flex-col gap-2">
            {onRetry && (
              <button className={button} onClick={onRetry}>
                {ru ? "Повторить" : "Retry"}
              </button>
            )}
            {onWorld && (
              <button className={button} onClick={onWorld}>
                {ru ? "В мир" : "To the world"}
              </button>
            )}
            {onClassic && (
              <button className={button} onClick={onClassic}>
                {ru ? "Прежний экран" : "Classic screen"}
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
