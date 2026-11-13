// Сломанный артефакт слетает с героя (владелец, 23.10.2026; ПРАВИЛА §8.63 п.3):
// «Нужно, чтобы арт слетал с героя в арты — на нём сверху изображение, будто он
// сломан, поверх накладка, и надеть не давало бы возможности. При этом там, где
// дебафы, выскакивало бы уведомление на время — условно 5 секунд — с иконкой
// арта и значком поломки».
//
// Механика включается тем же флагом, что и ремонт (settings.art_repair_open,
// art-repair-gate): флага нет — для игроков всё как было (сломанный надет и
// работает как целый, без накладки); админам новое поведение видно сразу.
//
// Здесь — общее для сервера и клиента: правило «надеть нельзя» и форма
// события поломки (таблица art_break_notice, migrations/art-broken-01.sql).
import { artBroken, shownArtPct } from "./artWear";

/** Сколько висит плашка «Сломан: …» над героем. */
export const ART_BREAK_TOAST_MS = 5_000;

/** Событие поломки для плашки: какой артефакт и как он выглядит. */
export type ArtBreakNote = {
  /** id события — по нему плашку помечают показанной. */
  id: string;
  itemId: string;
  name: string;
  imageUrl: string | null;
};

/** Надеть нельзя: механика запущена (флаг или админ) и износ дошёл до 100. */
export const artLocked = (wear: unknown, on: boolean): boolean => on && artBroken(wear);

/** То же по прочности из ответа (0 — сломан; пусто — новый, 100 %). */
export const artLockedPct = (durability: number | null | undefined, on: boolean): boolean =>
  on && shownArtPct(durability) <= 0;

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * События из ответа базы или сервера: массив, JSON-строка или мусор. Мусор и
 * строки без id отбрасываем — плашка без id не пометится показанной и
 * всплывала бы после каждой перезагрузки.
 */
export function parseArtBreakNotes(raw: unknown): ArtBreakNote[] {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: ArtBreakNote[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = str(o.id);
    if (!id) continue;
    out.push({
      id,
      itemId: str(o.itemId ?? o.item_id),
      name: str(o.name),
      imageUrl: str(o.imageUrl ?? o.image_url) || null,
    });
  }
  return out;
}

/** Очередь плашек: новые — в конец, без повторов по id. */
export function mergeArtBreakNotes(
  queue: readonly ArtBreakNote[] | undefined,
  add: readonly ArtBreakNote[] | undefined,
): ArtBreakNote[] {
  const out = [...(queue ?? [])];
  const seen = new Set(out.map((n) => n.id));
  for (const n of add ?? []) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}
