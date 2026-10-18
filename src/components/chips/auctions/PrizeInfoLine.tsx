// Строка «что это»: раса · спец — у героя, слот · +прибавка — у артефакта.
// Редкость — отдельной цветной плашкой в заголовке лота (RarityChip), рядом с
// «Герой / Артефакт». У паков и ресурсов ни того, ни другого нет.
import { prizeInfoText, rarityLabel, type PrizeInfo } from "./auctionFormat";

export function RarityChip({ info, en }: { info: PrizeInfo | null | undefined; en: boolean }) {
  const rarity = rarityLabel(info?.rarity, en);
  if (!rarity) return null;
  return (
    <>
      <span className={`auction-rarity-chip auction-rarity-chip--${info?.rarity}`}>
        {rarity}
      </span>{" "}
    </>
  );
}

export function PrizeInfoLine({
  kind,
  info,
  en,
}: {
  kind: string;
  info: PrizeInfo | null | undefined;
  en: boolean;
}) {
  const text = prizeInfoText(kind, info, en);
  if (!text) return null;
  return <p className="auction-lot__meta">{text}</p>;
}
