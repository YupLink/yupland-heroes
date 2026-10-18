// Удочку убрали из рук или взяли другой инструмент (ПРАВИЛА §8.24, §8.35):
// рыбалка кончается. Вынесено из fishing-settle (досчёт заброса) как есть.
import { mcpExec } from "@/server/db/mcpClient";
import { heroFishingSql } from "@/server/api/beta-raid/fishing/fishing-sql";
import { settleFishing } from "@/server/api/beta-raid/fishing/fishing-settle";

/**
 * Удочку убрали из рук или взяли другой инструмент (§8.24): сначала досчитать
 * улов удочкой в руках, потом закончить. Не рыбачит — одно чтение и всё. Сбой
 * смену инструмента не держит: рыбалку закончит следующий заход («не в руках»).
 */
export async function endFishingOnTool(heroId: string, wallet: string): Promise<void> {
  try {
    const rows = (await mcpExec(heroFishingSql(heroId), { wrapJson: true })) as Array<{
      account: string | null;
    }>;
    const account = rows?.[0]?.account;
    if (account) await settleFishing({ account, wallet, stop: "tool" });
  } catch (e) {
    console.warn(
      "[fishing] смена инструмента — улов не досчитан:",
      e instanceof Error ? e.message : e,
    );
  }
}
