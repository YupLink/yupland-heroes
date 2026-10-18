// Значок «проверь доход коллекции» на вкладке Казармы: все виды собраны от
// 3★, а доход нулевой — значит, коллекцию пора улучшить в Музее.
type CollectionFarmStatus = {
  templateCount: number;
  perTemplate: Array<{ bestLevel: number }>;
  ratePerDay: number;
};

export function needsCollectionUpgrade(farm: CollectionFarmStatus): boolean {
  return (
    farm.templateCount > 0 &&
    farm.perTemplate.length === farm.templateCount &&
    farm.perTemplate.every((item) => item.bestLevel >= 3) &&
    farm.ratePerDay <= 0
  );
}
