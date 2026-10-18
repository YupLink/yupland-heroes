// Инструмент для декора (владелец, 27.09): «1 топор = 1 декор»; с 28.09 — с
// прочностью («Износ за удар, %» у своего товара, lib/raid/toolWear.ts).
//
// Рубка снимает с текущей штуки стопки инструмента износ его товара; пусто —
// 100 %, то есть штука ломается сразу, как раньше. Дошло до нуля — из стопки
// ушла 1 шт., следующая начинает со 100 %. Снимает tool-wear одним оператором
// под локом героя и с ключом рубки: пока одна рубка инструментом в деле, вторая
// им не бьёт («занят»); без целой штуки — отказ; повтор моста прочность второй
// раз не снимет; откат вернёт ровно снятое.
//
// Основной инструмент (29.09, §8.24): рубит только инструмент в руках героя —
// выбор стопки (main-tool) до удара, гард — в самом ударе. Другой в руках —
// отказ «возьми в руки» с именем инструмента.
//
// Несколько инструментов у декора (05.10): подходит любой из списка — в руках
// из списка, то он; иначе первый по порядку, который есть (pickMain «items»).
// Износ — у реально взятого, его же имя — в ответе (used).
import { settleToolWear, undoToolWear, wearTool, type WearAt } from "./tool-wear";
import { resolveBackpack } from "./market-backpack";
import { canonStackKey } from "./item-alias";
import { wearStep } from "@/lib/raid/toolWear";
import { notMainError, pickMainTool } from "./main-tool/main-tool";
import type { ToolNeedKind } from "./main-tool/main-tool-sql";

/** wear — «Износ за удар, %» товара-инструмента; нет — ломается с первого удара. */
export type DecorTool = { id: string; name: string; wear?: number | null };

/** Снятая прочность: back — откат (рубка сорвалась), done — рубка прошла. */
export type ToolCharge = { back: () => Promise<void>; done: () => Promise<void> };

/** Снятая прочность рубки и инструмент, которым рубили на самом деле. */
export type DecorCharge = ToolCharge & { used: DecorTool };

/** Ключ отказа для клиента: там подставится имя инструмента («Нужен Топор»). */
export const NEED_TOOL = "braid.decor_need_tool";
/** Этим инструментом ещё идёт другая рубка (второе окно, двойной запрос). */
export const TOOL_BUSY = "braid.decor_tool_busy";

/**
 * Удар стопкой `at` как основным инструментом (общий у топора и лопаты). Не
 * вышло — откат по ключу и отказ: занят — TOOL_BUSY, не в руках — «возьми в
 * руки: name», иначе NEED_TOOL.
 */
export async function hitTool(
  at: WearAt,
  o: { step: number; need: ToolNeedKind; name: string },
): Promise<ToolCharge> {
  const back = () =>
    undoToolWear(at).catch((e) =>
      console.error(
        "[decor-tool] откат прочности не прошёл:",
        at.op,
        e instanceof Error ? e.message : e,
      ),
    );
  let hit: Awaited<ReturnType<typeof wearTool>> = "none";
  try {
    hit = await wearTool({ ...at, step: o.step, need: o.need });
  } catch (e) {
    console.warn("[decor-tool] инструмент не списан:", e instanceof Error ? e.message : e);
  }
  if (hit !== "ok") {
    // Дошёл ли удар до базы — неизвестно (ответ потерян или пришёл кривым):
    // откат по ключу вернёт снятое, а если удара не было, положит заглушку, и
    // опоздавшая попытка ничего не снимет. Безвреден при любом исходе.
    await back();
    if (hit === "idle") throw notMainError(o.name);
    throw new Error(hit === "busy" ? TOOL_BUSY : NEED_TOOL);
  }
  return { back, done: () => settleToolWear(at) };
}

/**
 * Снять прочность инструмента героя за одну рубку — любым из списка декора.
 * Не вышло (нет героя, нет ни одного с целой штукой, в руках другой, соседняя
 * рубка ещё в деле) — отказ ключом; «возьми в руки» — с именем того, что взять.
 */
export async function payDecorTool(
  wallet: string,
  tools: readonly DecorTool[],
  ref: string,
): Promise<DecorCharge> {
  const bp = await resolveBackpack(wallet).catch(() => null);
  if (!bp || tools.length === 0) throw new Error(NEED_TOOL);
  // Ключ стопки — канон вида, как у оплаты товаром (item-alias).
  const keyed = await Promise.all(
    tools.map(async (t) => ({ tool: t, key: await canonStackKey("custom", t.id, t.name) })),
  );
  const need = { kind: "items" as const, keys: keyed.map((k) => k.key) };
  const { pick } = await pickMainTool(bp.heroId, need);
  const hit = pick.ok || pick.why === "idle" ? keyed.find((k) => k.key === pick.key) : undefined;
  if (!pick.ok || !hit) {
    throw !pick.ok && pick.why === "idle"
      ? notMainError(hit?.tool.name ?? "")
      : new Error(NEED_TOOL);
  }
  const at = { heroId: bp.heroId, stackKey: hit.key, op: `wear:${ref}` };
  const used = hit.tool;
  const charge = await hitTool(at, { step: wearStep(used.wear), need: "item", name: used.name });
  return { ...charge, used };
}
