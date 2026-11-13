// Какой вход у адреса запроса (§8.127): Caddy передаёт исходный домен в Host.
// Вне запроса (тесты, кроны) — Google, как у service.yupland.io. Только сервер.
import { getRequestHeader } from "@tanstack/react-start/server";
import { entryForHost, type EntryKind } from "@/lib/auth/entryHost";

export function requestEntry(): EntryKind {
  try {
    return entryForHost(getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? null);
  } catch {
    return "google";
  }
}
