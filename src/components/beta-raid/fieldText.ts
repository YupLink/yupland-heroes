// Подписи грядки: чем платит поле и кого туда пускают.
//
// Отдельным модулем от окна: те же строки нужны и в подсказке на карте, и в
// админском предпросмотре, а собирать фразу из режима уровня в двух местах —
// верный способ развести формулировки.
import type { FieldLevelMode, FieldRarity, FieldReward } from "@/lib/fieldConfig";

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Название награды: ресурс переводим, товар зовём его именем. */
export function fieldRewardName(reward: FieldReward, t: TFn): string {
  return reward.kind === "item" ? reward.name : t(`mine.res.${reward.resource}`);
}

/** «редкие и эпические герои до 20 уровня» — одной строкой. */
export function fieldRequirementText(
  req: { rarities: FieldRarity[]; levelMode: FieldLevelMode; levelFrom: number; levelTo: number },
  t: TFn,
): string {
  const rar =
    req.rarities.length === 0
      ? t("braid.field_any_rarity")
      : req.rarities.map((r) => t(`braid.rarity_${r}`)).join(" / ");
  const lvl =
    req.levelMode === "from"
      ? t("braid.field_lvl_from", { n: req.levelFrom })
      : req.levelMode === "to"
        ? t("braid.field_lvl_to", { n: req.levelTo })
        : req.levelMode === "range"
          ? t("braid.field_lvl_range", { a: req.levelFrom, b: req.levelTo })
          : t("braid.field_any_lvl");
  return `${rar} · ${lvl}`;
}
