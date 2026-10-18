// Какой стопкой действовать герою (ПРАВИЛА §8.24): рубка и добыча декора —
// только его инструментом, «Закопать», «Выкопать» и «Копать» — только лопатой,
// и только если она основная (или единственная подходящая, пока основного нет).
//
// Здесь — выбор стопки и отказ понятным текстом ДО денег и износа. Последнее
// слово за оператором удара (tool-wear hitSql + main-tool-sql mainOkSql): между
// этим чтением и ударом игрок мог сменить основной, и тогда удар откажет сам.
import { effectiveMain, pickMain, type MainPick, type ToolNeed } from "@/lib/raid/mainTool";
import { loadToolState, type StateStack } from "@/server/api/beta-raid/main-tool/main-tool-read";

/** Отказ «возьми в руки»: инструмент есть, но основной — другой (или лопат несколько). */
export const NOT_MAIN = "tool.not_main";

/** Ключ с именем инструмента: клиент покажет «Сначала возьми в руки: Топор». */
export const notMainError = (tool: string): Error =>
  new Error(`${NOT_MAIN}|${JSON.stringify({ tool })}`);

/** Выбор и стопка выбора (имя, «Износ за удар»): у ok — чем бить, у idle — что взять. */
export type MainChoice = { pick: MainPick; stack: StateStack | null };

export async function pickMainTool(heroId: string, need: ToolNeed): Promise<MainChoice> {
  const st = await loadToolState(heroId);
  const pick = pickMain(effectiveMain(st.stored, st.stacks), st.stacks, need);
  const key = pick.ok || pick.why === "idle" ? pick.key : null;
  return { pick, stack: st.stacks.find((s) => s.stackKey === key) ?? null };
}
