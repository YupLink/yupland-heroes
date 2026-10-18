// Хуки турниров в местах событий, где под рукой только кошелёк.
// Без await у вызывающего и без броска: турнир не ломает рубку.
import { isAxeTool, isLogItem, isPickTool, isStoneItem } from "@/lib/tournament/metricSources";
import { raidOwner } from "../beta-raid/owner";
import { noteTournament } from "./tour-note";

/**
 * Рубка декора инструментом (владелец, 03.10.2026): топор — очко в «срубил
 * деревьев» и брёвна (сколько выдано) в «Дерево»; кирка — камни в «Камень».
 * Что выдано — по имени товара (isLogItem / isStoneItem): бананы, шишки,
 * монетки, слитки — не дерево и не камень.
 * ref — ключ этой рубки (клетка + момент: декор с клетки забирается атомарно,
 * дважды в одну миллисекунду его не срубить).
 * hand — рубка руками (§8.56): руками рубят только то, что берёт деревянный или
 * каменный топор, — это дерево, очко и брёвна как за топор.
 */
export async function noteChop(
  wallet: string,
  toolName: string | null | undefined,
  ref: string,
  amount = 0,
  itemName: string | null = null,
  hand = false,
): Promise<void> {
  const axe = hand || isAxeTool(toolName);
  const pick = !axe && isPickTool(toolName);
  if (!axe && !pick) return;
  const counts = axe ? isLogItem(itemName) : isStoneItem(itemName);
  try {
    const account = await raidOwner(wallet);
    if (axe) await noteTournament(account, "chop", 1, ref);
    if (amount > 0 && counts) {
      await noteTournament(account, axe ? "wood" : "stone", amount, `${ref}:got`);
    }
  } catch (e) {
    console.warn("[tour] рубка не засчиталась:", e instanceof Error ? e.message : e);
  }
}
