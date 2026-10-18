// Разбор ответа ИИ в рецепт зоны — чистая функция, без сети и базы.
//
// ИИ просят «только JSON», но он всё равно то заворачивает его в ```json,
// то дописывает фразу сверху. Падать из-за этого нельзя: вырезаем первый
// объект по фигурным скобкам и уже его проверяем схемой. Всё, чего ИИ не
// прислал (масштаб, густота декора), берёт значения defaultRecipe; слои с
// выдуманной местностью выбрасываются молча — рисовать «несуществующее»
// нельзя, а один лишний слой не повод отказывать во всём рецепте.
import { z } from "zod";
import { zoneRecipeSchema, type ZoneAiOutput } from "@/lib/raid/zonegen/recipe";

const shape = zoneRecipeSchema.shape;
const aiRecipeSchema = zoneRecipeSchema.omit({ seed: true }).extend({
  scale: shape.scale.default(12),
  decorRate: shape.decorRate.default(1),
  decorStrict: shape.decorStrict.default(true),
  smallSingle: shape.smallSingle.default(12),
  note: z.string().max(300).optional(),
});

const clamp = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};

/** JSON-объект из текста: из ```-блока или между первой `{` и последней `}`. */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  if (!body.trim()) throw new Error("ИИ вернул пустой ответ — попробуй ещё раз");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("ИИ вернул не JSON");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error("ИИ вернул повреждённый JSON");
  }
}

export function parseAiRecipe(text: string, knownTerrainIds: Iterable<string>): ZoneAiOutput {
  const known = new Set(knownTerrainIds);
  const raw = extractJsonObject(text);
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Слои чистим ДО схемы: вес «120» или строкой — не повод отказать, а
  // выдуманный terrainId — не повод отказать во всём рецепте.
  const layers = (Array.isArray(obj.layers) ? obj.layers : [])
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .filter((l) => typeof l.terrainId === "string" && known.has(l.terrainId))
    .map((l) => ({ terrainId: String(l.terrainId), weight: clamp(l.weight, 0, 100) ?? 0 }))
    .slice(0, 12);
  if (layers.length === 0) throw new Error("ИИ не подобрал ни одной местности из каталога");
  const small = clamp(obj.smallSingle, 0, 500);
  const parsed = aiRecipeSchema.parse({
    layers,
    scale: clamp(obj.scale, 2, 80),
    decorRate: clamp(obj.decorRate, 0, 3),
    decorStrict: typeof obj.decorStrict === "boolean" ? obj.decorStrict : undefined,
    smallSingle: small === undefined ? undefined : Math.round(small),
    note: typeof obj.note === "string" ? obj.note.trim().slice(0, 300) : undefined,
  });
  const { note, ...recipe } = parsed;
  return { recipe, note: note ?? "" };
}
