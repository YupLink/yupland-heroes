// Итог получения наград — одинаково во всех трёх окнах клейма.
//
// Сервер отдаёт не только «сколько выдано», но и warnings: ключи того, что НЕ
// доехало и осталось ждать в очереди (полный рюкзак, не выбран герой, битая
// ссылка). Клиенты читали одно `claimed` — игрок с полным рюкзаком получал
// зелёное «Награды забраны», а товар тихо оставался лежать. Хуже того, когда
// откладывалось ВСЁ, тот же зелёный тост говорил «забрано 0» — успехом.
//
// Отсюда правило: ноль выданных при непустых предупреждениях — это отказ,
// а не успех, и причина показывается словами игрока.
import { toast } from "sonner";
import { humanError } from "./humanError";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Ровно то, что нужно от ответа claimRaidRewards: остальное окна читают сами. */
export type ClaimResult = { claimed: number; warnings?: string[] };

/**
 * Показать итог клейма.
 *
 * @param successText — своя формулировка успеха (в окне «Добыча» она без
 *   счётчика); не задана — общая «Забрано наград: N».
 */
export function showClaimResult(res: ClaimResult, t: Translate, successText?: string): void {
  // Предупреждения приходят КЛЮЧАМИ словаря, иногда с числами
  // («market.backpack_need:3:1»). Переводит их humanError — тот же путь, что
  // у обычных отказов сервера.
  const reasons = (res.warnings ?? []).map((w) => humanError(w));
  const details = reasons.join(" · ");
  if (res.claimed <= 0 && reasons.length > 0) {
    toast.error(t("braid.rewards_deferred_all"), { description: details });
    return;
  }
  toast.success(successText ?? t("raid.claimed_n", { n: res.claimed }));
  if (reasons.length > 0) {
    toast.warning(t("braid.rewards_deferred_some"), { description: details });
  }
}
