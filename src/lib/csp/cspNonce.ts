// Метка (nonce) этого ответа для встроенных скриптов страницы (cspPolicy.ts).
// Сервер берёт её из контекста запроса (её кладёт requestMiddleware в start.ts).
// На клиенте — пустая строка: значение атрибута браузер прячет после загрузки
// (в DOM оно ""), так разметка совпадает при гидрации. Скрипты, которые клиент
// вставляет сам, проходят по 'strict-dynamic' — их ставит уже доверенный код.
import { createIsomorphicFn, getGlobalStartContext } from "@tanstack/react-start";

export const getCspNonce = createIsomorphicFn()
  .server((): string | undefined => {
    const ctx = getGlobalStartContext() as { cspNonce?: unknown } | undefined;
    return typeof ctx?.cspNonce === "string" ? ctx.cspNonce : undefined;
  })
  .client((): string => "");
