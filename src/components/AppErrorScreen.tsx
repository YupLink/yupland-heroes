// Экран ошибки маршрута (defaultErrorComponent роутера).
//
// Вынесен из src/router.tsx: router.tsx — про сборку роутера, а не про вёрстку.
//
// ЗАЧЕМ детали: раньше здесь печаталось только error.message, и после
// перезапуска приложения владелец видел ровно два слова — «Invariant failed»
// (текст библиотеки, вырезанный в прод-сборке). По такому скриншоту нельзя
// понять ничего. Теперь: строка ошибки на виду (её видно на скриншоте),
// начало стека — свёрнутым и мелким, чтобы не пугать игрока, и кнопка
// «скопировать детали» для отправки в чат.
//
// Что НЕ показываем: адрес страницы отдаём без query (в нём бывают коды входа
// и токены), кошельки и ключи сюда не попадают вовсе.
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { copyText } from "@/lib/copyText";
import { BUILD_ID } from "@/lib/buildId";

/**
 * Признак того, что упал не сценарий, а подгрузка чанка после нового выката:
 * старый файл больше не лежит на сервере (мы больше не держим прошлые сборки).
 * Такое лечится одной перезагрузкой — свежая страница возьмёт новые чанки.
 */
function isStaleChunkError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("failed to fetch") ||
    m.includes("is not a valid javascript mime type") ||
    m.includes("error loading") ||
    m.includes("chunkloaderror")
  );
}

/** Сколько строк стека показываем и копируем: дальше идёт шум рантайма. */
const STACK_LINES = 8;

function shortStack(error: Error): string {
  const raw = error.stack ?? "";
  const lines = raw.split("\n").filter((l) => l.trim().startsWith("at "));
  return lines.slice(0, STACK_LINES).join("\n");
}

function details(error: Error): string {
  const path = typeof window === "undefined" ? "" : window.location.pathname;
  return [
    error.message || String(error),
    shortStack(error),
    `path: ${path}`,
    `build: ${BUILD_ID}`,
    `time: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function AppErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const t = useT();
  const [copied, setCopied] = useState(false);

  // Ошибка загрузки чанка = вышла новая версия, старый файл удалён. Тихо
  // перезагружаемся один раз (флаг в sessionStorage не даёт зациклиться).
  useEffect(() => {
    if (typeof window === "undefined" || !isStaleChunkError(error?.message ?? "")) return;
    // Не чаще раза в 30с: одиночная перезагрузка помогает, петля — нет.
    const last = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem("chunk-reload-at", String(Date.now()));
    window.location.reload();
  }, [error]);

  const stack = shortStack(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("err.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("err.subtitle")}</p>

        {/* Строка ошибки на виду: по скриншоту от игрока должно быть понятно,
            что случилось, без разворачивания деталей. */}
        {error?.message && (
          <pre className="mt-4 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-left font-mono text-[11px] leading-snug text-destructive">
            {error.message}
          </pre>
        )}

        {stack && (
          <details className="mt-2 text-left">
            <summary className="cursor-pointer text-[11px] text-muted-foreground/70">
              {t("err.tech_details")}
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-[10px] leading-snug text-muted-foreground">
              {stack}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("err.retry")}
          </button>
          <a
            href="/home"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("err.go_home")}
          </a>
          <button
            onClick={() => {
              void copyText(details(error)).then((ok) => {
                setCopied(ok);
                if (ok) setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            {copied ? t("err.copied") : t("err.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
