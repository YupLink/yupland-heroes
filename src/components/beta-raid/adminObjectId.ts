// Как разобрать id объекта с клетки — включая старые записи без вида.
//
// Редакторский parseObjectId понимает только новый формат («boss:rbt_…») и на
// старом id без префикса возвращает null: кнопка «настроить» тогда молча
// ничего не делала. Разбираем тем же правилом, что и бой (encounterKindOf):
// сначала префикс, потом вид из словаря карты (kind шаблона или meta.type) и
// только потом — форма самого id. Не разобрали — так и говорим: кнопки не
// будет, вместо неё честное «не разобрать».
import type { ObjectSub } from "@/components/admin/hex-editor/hexShared";

/** Чем открывать полную форму объекта: вид и id шаблона. */
export type AdminObjectRef = { sub: ObjectSub; refId: string };

const SUBS: ObjectSub[] = ["boss", "artifact", "chest", "mine"];

const isSub = (v: unknown): v is ObjectSub =>
  typeof v === "string" && (SUBS as string[]).includes(v);

/** Боссы заводятся с этим префиксом (raid-admin: `rbt_${nanoid(8)}`). */
const BOSS_ID = /^rbt_/;

export function parseAdminObject(
  rawId: string,
  /** Шаблон объекта из словаря карты: он знает вид даже у id без префикса. */
  tpl?: { kind?: string | null; meta?: unknown } | null,
): AdminObjectRef | null {
  if (!rawId) return null;
  const at = rawId.indexOf(":");
  const prefix = at > 0 ? rawId.slice(0, at) : "";
  const refId = at > 0 ? rawId.slice(at + 1) : rawId;
  if (!refId) return null;
  if (isSub(prefix)) return { sub: prefix, refId };

  const kind = tpl?.kind ?? (tpl?.meta as { type?: unknown } | null)?.type;
  if (isSub(kind)) return { sub: kind, refId };

  // Боссов без префикса в словаре карты нет — она ищет их только по «boss:…».
  // Остаётся примета самого id, по ней их и узнаём.
  return BOSS_ID.test(refId) ? { sub: "boss", refId } : null;
}
