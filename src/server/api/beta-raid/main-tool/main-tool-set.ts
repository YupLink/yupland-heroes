// «Сделать основным» / «Убрать из рук» (ПРАВИЛА §8.24): основной инструмент
// выбранного героя. Основным бывает только инструмент — инструмент декора
// (топор, кирка: meta.interact.toolItemIds шаблона), лопата (is_shovel) или
// удочка (is_rod, §8.35) — и только стопка с целой штукой. В руках один: запись
// одна на героя, под тем же локом `bp:<герой>`, что и удар.
//
// Удочку убрали из рук или взяли другое — рыбалка кончается (§8.35): сначала
// досчитывается улов, пойманный удочкой в руках, потом меняется основной.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { requireWallet } from "@/server/auth";
import { actionGate } from "@/server/rateGate";
import { resolveBackpack } from "@/server/api/beta-raid/market-backpack";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { setMainSql } from "@/server/api/beta-raid/main-tool/main-tool-sql";
import {
  decorToolKeys,
  loadToolState,
  type StateStack,
} from "@/server/api/beta-raid/main-tool/main-tool-read";
import { endFishingOnTool } from "@/server/api/beta-raid/fishing/fishing-tool-end";

/** Отказы: не инструмент / стопки с целой штукой уже нет. */
export const NOT_TOOL = "tool.not_tool";
export const TOOL_GONE = "tool.gone";

/**
 * Стопку можно взять в руки: она есть (с целой штукой) и это инструмент —
 * лопата, удочка или инструмент какого-либо декора. Нет — отказ ключом.
 */
export async function requireToolStack(heroId: string, stackKey: string): Promise<StateStack> {
  const st = await loadToolState(heroId);
  const s = st.stacks.find((x) => x.stackKey === stackKey && x.count >= 1);
  if (!s) throw new Error(TOOL_GONE);
  if (s.shovel !== true && s.rod !== true && !(await decorToolKeys()).has(stackKey)) {
    throw new Error(NOT_TOOL);
  }
  return s;
}

export const setMainTool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ stackKey: z.string().min(1).max(200).nullable() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; main: string | null }> => {
    const wallet = requireWallet();
    await actionGate("main-tool", wallet);
    const bp = await resolveBackpack(wallet);
    if (!bp) throw new Error("market.backpack_no_hero");
    const key = data.stackKey;
    const stack = key !== null ? await requireToolStack(bp.heroId, key) : null;
    if (stack?.rod !== true) await endFishingOnTool(bp.heroId, wallet);
    const row = sqlRow<{ set: boolean }>((await mcpExec(setMainSql(bp.heroId, key))) as unknown[]);
    if (row?.set !== true) throw new Error(key === null ? "market.backpack_no_hero" : TOOL_GONE);
    return { ok: true as const, main: key };
  });
