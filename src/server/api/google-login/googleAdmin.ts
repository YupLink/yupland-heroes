// Админка входа через Google (/admin/google): Client ID, вход для всех, одно
// устройство — один аккаунт, список Google-аккаунтов и возможные мультиаккаунты.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../../auth";
import {
  listGoogleAccounts,
  readGoogleSettings,
  saveGoogleClientId,
  saveGoogleDeviceLimit,
  saveGoogleOpen,
} from "./googleStore";
import { multiGroups } from "./googleMulti";

export const adminGoogleOverview = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const [s, accounts, groups] = await Promise.all([
    readGoogleSettings(),
    listGoogleAccounts(),
    // Отчёт о совпадениях не должен ронять карточку вместе с выключателями.
    multiGroups().catch(() => []),
  ]);
  return { clientId: s.clientId, open: s.open, deviceLimit: s.deviceLimit, accounts, groups };
});

/** Client ID веб-клиента Google: «…apps.googleusercontent.com». Пусто — убрать. */
const CLIENT_ID_RE = /^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/;

export const adminSetGoogleClientId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ clientId: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const clientId = data.clientId.trim();
    if (clientId && !CLIENT_ID_RE.test(clientId)) throw new Error("google.badClientId");
    await saveGoogleClientId(clientId);
    return { ok: true as const, clientId: clientId || null };
  });

/** Выключатель «одно устройство — один аккаунт». */
export const adminSetGoogleDeviceLimit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await saveGoogleDeviceLimit(data.on);
    return { ok: true as const, deviceLimit: data.on };
  });

/** Вход через Google для всех (владелец, 06.11.2026: «откроем для новых игроков»). */
export const adminSetGoogleOpen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ on: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await saveGoogleOpen(data.on);
    return { ok: true as const, open: data.on };
  });
