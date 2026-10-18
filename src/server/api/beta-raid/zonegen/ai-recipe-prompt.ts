// Промпт для ИИ-рецепта зоны — чистая сборка текста, без сети.
//
// ИИ не рисует клетки: он выбирает местности из каталога и доли. Каталог даём
// парами «id — имя», чтобы ответ ссылался на настоящие id, а «опыт карты»
// (как густо и чем админ уже украшал каждую местность) — для колорита: ИИ
// видит, что «Лес» у нас с ёлками, и не предлагает пустыню под грибы.
import type { Affinity } from "@/lib/raid/zonegen/recipe";
import type { CatalogItem } from "./catalog";

export type PromptInput = {
  text: string;
  cellCount: number;
  terrains: CatalogItem[];
  decorNames: Record<string, string>;
  affinity: Affinity;
};

/** Строка опыта по одной местности: доля с декором и топ-3 по имени. */
function experienceLine(
  name: string,
  a: Affinity["byTerrain"][string],
  decor: Record<string, string>,
) {
  const pct = a.total > 0 ? Math.round((100 * a.decorated) / a.total) : 0;
  const top = a.pool
    .slice(0, 3)
    .map((p) => decor[p.decorationId] ?? p.decorationId)
    .join(", ");
  return `- ${name}: ${a.total} клеток, декор на ${pct} %${top ? `; чаще всего: ${top}` : ""}`;
}

export function buildRecipePrompt(input: PromptInput): string {
  const catalog = input.terrains.map((t) => `- ${t.id} — ${t.name}`).join("\n");
  const experience =
    input.terrains
      .filter((t) => (input.affinity.byTerrain[t.id]?.total ?? 0) > 0)
      .map((t) => experienceLine(t.name, input.affinity.byTerrain[t.id], input.decorNames))
      .join("\n") || "(карта пока пустая)";
  return `Ты — помощник ландшафтного дизайнера гекс-карты игры YupLink. Админ выделил зону \
из ${input.cellCount} клеток и описал, что хочет там видеть. Составь РЕЦЕПТ генерации: \
какие местности и в каких долях. Клетки рисует программа, тебе нужны только доли.

Каталог местностей (id — имя):
${catalog}

Опыт карты — как админ уже красил (сколько клеток, доля с декором, частый декор):
${experience}

Описание админа:
<text>
${input.text.trim()}
</text>

Правила:
- terrainId — ТОЛЬКО id из каталога, ничего не выдумывай;
- слоёв 1–6, веса — проценты, в сумме около 100; порядок слоёв — от низин к высотам (вода первой);
- scale — размер пятна в клетках: 4 — рябь, 12 — обычно, 30 — материки;
- decorRate — густота декора относительно опыта карты: 0 — без декора, 1 — как на карте, 2 — вдвое гуще;
- decorStrict — true: на местность идёт только тот декор, что админ на ней уже ставил;
- smallSingle — зона меньше N клеток красится одним типом; если ${input.cellCount} меньше smallSingle, дай ровно один слой;
- note — одна фраза по-русски, что получилось.

Верни ТОЛЬКО JSON без пояснений и без markdown:
{"layers":[{"terrainId":"…","weight":60}],"scale":12,"decorRate":1,"decorStrict":true,"smallSingle":12,"note":"…"}`;
}
