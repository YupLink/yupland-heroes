// Открытие Bonus Box пачкой (владелец, 28.10.2026): «Дать возможность открытия
// паков бонус по 10 штук» → «открыть все — максимум 50 —
// рандом должен сохраниться — показывать списком, что выиграно — общие награды
// суммируются в одно; одинаковые арты — ×n в уголке». Только Bonus Box —
// другие мистические боксы открываются по одному. Общие правила для сервера и
// экрана; каждый бокс пачки бросается отдельно, как одиночное открытие.
import { REF_BOX_PACK_ID } from "@/lib/referralRewards";
import type { MysticPrize } from "@/server/api/mystic-grant";

/** Больше боксов за одно нажатие не открывается («открыть все — максимум 50»). */
export const MYSTIC_BATCH_MAX = 50;

/** Пак открывается пачкой — только Bonus Box. */
export function isMysticBatchPack(packId: string): boolean {
  return packId === REF_BOX_PACK_ID;
}

/**
 * «Открыть все» для стака ×count (рядом с «Открыть», которое всегда 1):
 * min(count, 50) при count ≥ 2; 0 — кнопки нет. Подпись как у паков с
 * фишками (PackDetails): «Все ×N» при N ≤ 50, иначе «Открыть 50».
 */
export function mysticOpenAllCount(packId: string, count: number): number {
  const total = Math.floor(count);
  if (!isMysticBatchPack(packId) || total < 2) return 0;
  return Math.min(total, MYSTIC_BATCH_MAX);
}

/** Призы с количеством — складываются в одну строку с общей суммой. */
const AMOUNT_KINDS = new Set(["energy", "likes", "tickets", "resource", "token", "custom", "ft"]);

export type MysticPrizeGroup = {
  prize: MysticPrize;
  /** Сколько боксов дали этот приз. */
  times: number;
  /** true — количество сложено в prize.amount; false — показывать «×times». */
  summed: boolean;
};

/** Чем одинаковые призы совпадают: количественные — вид+код, предметы — облик. */
function groupKey(p: MysticPrize): string {
  if (AMOUNT_KINDS.has(p.kind)) return `${p.kind}|${p.code ?? p.name ?? ""}`;
  return [p.kind, p.name, p.image, p.rarity, p.level].map((v) => v ?? "").join("|");
}

/**
 * Итог пачки списком. Энергия, лайки, золото, ресурсы и токены по коду,
 * одинаковые товары рюкзака — одна строка с суммой. Одинаковые артефакты,
 * герои, паки (то же имя, редкость, уровень) и пустые — одна карточка «×n».
 * Порядок — по первому выпадению.
 */
export function groupMysticPrizes(prizes: MysticPrize[]): MysticPrizeGroup[] {
  const byKey = new Map<string, MysticPrizeGroup>();
  for (const p of prizes) {
    const key = groupKey(p);
    const g = byKey.get(key);
    if (!g) {
      const shown: MysticPrize = { ...p };
      delete shown.itemId; // экземпляр у каждого свой, в строке итога не нужен
      byKey.set(key, { prize: shown, times: 1, summed: AMOUNT_KINDS.has(p.kind) });
      continue;
    }
    g.times += 1;
    if (g.summed) {
      // У товара рюкзака без количества — 1 штука (как в окне одного приза).
      const one = (x: MysticPrize) => x.amount ?? (x.kind === "custom" ? 1 : 0);
      g.prize.amount = Math.round((one(g.prize) + one(p)) * 100) / 100;
    }
  }
  return [...byKey.values()];
}
