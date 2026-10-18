// Сохранение meta шаблона со страниц админки (adminUpdateItem, items.ts).
//
// Страницы шлют meta целиком — снимком, загруженным вместе со списком. Всё,
// что в нём есть, и так правится на этой странице, кроме взаимодействия декора
// (meta.interact: награда, инструмент, респавн, надпись): у него своё окно и
// своя ручка (decor-interact-admin). Снимок страницы откатывал всё, что там
// поменяли после загрузки списка, поэтому interact берём из базы всегда.
import { pg } from "../db/pg";

/** Чистая часть: meta со страницы + interact из того, что сейчас в базе. */
export function mergeDecorInteract(
  was: unknown,
  meta: Record<string, unknown>,
): Record<string, unknown> {
  const cur = was && typeof was === "object" ? (was as Record<string, unknown>) : {};
  const next: Record<string, unknown> = { ...meta };
  delete next.interact;
  if (cur.interact !== undefined) next.interact = cur.interact;
  return next;
}

/** meta со страницы + взаимодействие декора из базы. */
export async function keepDecorInteract(
  id: string,
  meta: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const row = (await pg.mysticItemTemplates.findOne({ id })) as { meta?: unknown } | null;
  return mergeDecorInteract(row?.meta, meta);
}
