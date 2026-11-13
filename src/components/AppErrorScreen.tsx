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
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";
import { copyText } from "@/lib/copyText";
import { BUILD_ID } from "@/lib/buildId";
import { forceReloadBustCache } from "@/lib/versionCheck";
import { isStaleChunkError, reloadForStaleChunk } from "@/lib/staleReload";

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

export function AppErrorScreen(props: ErrorComponentProps) {
  // С роутера 1.170 error в типах — unknown (раньше Error). Код ниже тот же:
  // приведение только для типов, поведение экрана не меняется.
  const error = props.error as Error;
  const { reset } = props;
  const router = useRouter();
  const t = useT();
  const [copied, setCopied] = useState(false);
  // Safari запоминает несостоявшийся импорт до перезагрузки страницы: reset()
  // повторил бы тот же сбой, поэтому «Попробовать снова» — полная перезагрузка.
  const stale = isStaleChunkError(error);
  // Не подгрузился кусок кода — тихая перезагрузка (раз в 30 с, lib/staleReload);
  // пока она идёт, экран ошибки не мелькает.
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    if (!stale || !reloadForStaleChunk()) setReloading(false);
  }, [error, stale]);

  const stack = shortStack(error);
  if (reloading) return <div className="min-h-screen bg-background" />;

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
              if (stale) {
                void forceReloadBustCache();
                return;
              }
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
