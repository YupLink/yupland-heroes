// Охрана шахт по проводу — сжато и с версией (11.10.2026).
//
// Охранников ~200, а видов — около восьми: картинка и имя повторялись в
// каждой записи (37 КБ на ответ, 40 тыс. ответов в сутки). Теперь виды идут
// списком, клетки — номером вида. Версия `v` — отпечаток содержимого:
// клиент присылает свою, и если охрана не менялась, ответ — одна версия.
export type GuardView = { templateId: string; image: string | null; name: string };

export type GuardsWire =
  | { v: string; same: true }
  | { v: string; kinds: GuardView[]; cells: Record<string, number> };

/** Сжать «q,r» → охранник в виды + номера; порядок стабильный (по ключу). */
export function packGuards(guards: Record<string, GuardView>): {
  kinds: GuardView[];
  cells: Record<string, number>;
} {
  const kinds: GuardView[] = [];
  const at = new Map<string, number>();
  const cells: Record<string, number> = {};
  for (const key of Object.keys(guards).sort()) {
    const g = guards[key];
    const id = `${g.templateId}\u0000${g.image ?? ""}\u0000${g.name}`;
    let i = at.get(id);
    if (i === undefined) {
      i = kinds.length;
      kinds.push({ templateId: g.templateId, image: g.image, name: g.name });
      at.set(id, i);
    }
    cells[key] = i;
  }
  return { kinds, cells };
}

/** Обратно в «q,r» → охранник — тот вид, что ждут карта и сундуки. */
export function unpackGuards(w: {
  kinds: GuardView[];
  cells: Record<string, number>;
}): Record<string, GuardView> {
  const out: Record<string, GuardView> = {};
  for (const [key, i] of Object.entries(w.cells)) {
    const g = w.kinds[i];
    if (g) out[key] = g;
  }
  return out;
}
