// Текст ошибки турниров — общий для админки и окна постройки «Турнир».
//
// Ключ вида tour.err.far humanError не узнаёт (в ключе две точки, его шаблон —
// одна), и игрок читал сырой ключ. Поэтому tour.* переводим сами, остальное —
// humanError (обновление сервера, известные фразы).
import { humanError } from "@/lib/humanError";

export function errText(e: unknown, t: (key: string) => string): string {
  const raw = (e instanceof Error ? e.message : String(e ?? "")).trim();
  if (/^tour\.[a-z0-9_.]+$/i.test(raw)) {
    const text = t(raw);
    if (text !== raw) return text;
  }
  return humanError(e);
}
