// Рецепт зоны по описанию — server fn «спросить ИИ» для кисти режима бога.
//
// Только админ: ИИ платный, ключи — серверные (src/server/ai/mimo.ts). Клиент
// получает разобранный рецепт и одну фразу-пояснение, сырой ответ модели и
// промпт наружу не уходят. Сид не назначаем — его крутит клиент кнопкой
// «Перегенерировать» (контракт ZoneAiOutput).
//
// Модуль ИИ подключается динамически внутри handler'а: сюда заглядывает
// клиентская сборка через barrel, а серверному клиенту с ключами в ней делать
// нечего даже в виде мёртвого кода.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ZONE_MAX_CELLS, type ZoneAiOutput } from "@/lib/raid/zonegen/recipe";
import { requireAdmin } from "@/server/auth";
import { godMapId } from "@/server/api/beta-raid/god-map";
import { loadAffinity } from "./affinity";
import { loadDecorCatalog, loadTerrainCatalog, namesById } from "./catalog";
import { buildRecipePrompt } from "./ai-recipe-prompt";
import { parseAiRecipe } from "./ai-recipe-parse";

// Лимит — на ВЕСЬ ответ, включая скрытые «размышления» модели: у mimo-v2.5-pro
// они идут отдельным блоком и на реальном каталоге (42 местности) съедали
// 1 500 токенов целиком — текст приходил пустым, админ видел «ИИ вернул не
// JSON» (прогон 21.09). Берём запас как у задачника.
const ANSWER_MAX_TOKENS = 6000;

export const zoneAiInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  cellCount: z.number().int().min(1).max(ZONE_MAX_CELLS),
});

export const adminZoneRecipeAi = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => zoneAiInputSchema.parse(d))
  .handler(async ({ data }): Promise<ZoneAiOutput> => {
    requireAdmin();
    const { mimoConfigured, askMimo } = await import("@/server/ai/mimo");
    // Отказ — ключом словаря: humanError на клиенте переведёт (договор voidGate).
    if (!mimoConfigured()) throw new Error("zonegen.ai_not_configured");
    const mapId = await godMapId();
    const [terrains, decor, affinity] = await Promise.all([
      loadTerrainCatalog(),
      loadDecorCatalog(),
      loadAffinity(mapId),
    ]);
    if (terrains.length === 0) throw new Error("В каталоге нет ни одной местности");
    const prompt = buildRecipePrompt({
      text: data.text,
      cellCount: data.cellCount,
      terrains,
      decorNames: namesById(decor),
      affinity,
    });
    const answer = await askMimo(prompt, { maxTokens: ANSWER_MAX_TOKENS });
    return parseAiRecipe(
      answer,
      terrains.map((t) => t.id),
    );
  });
