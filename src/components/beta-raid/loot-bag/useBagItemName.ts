// Имя позиции мешочка на языке игрока — одно на плитки окна (LootBagGrid) и
// тост «Не влезло» (useLootBagActions): DARAI-шахта — по виду стопки
// (lib/daraiMine), ресурс счёта — словарём, прочее — по имени.
import { useLang, useT } from "@/lib/i18n";
import { bagResOf } from "@/lib/lootBag";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { dmineNameOr } from "@/lib/daraiMine";

export function useBagItemName(): (name: string, stackKey: string) => string {
  const t = useT();
  const lang = useLang();
  return (name, stackKey) => {
    const res = bagResOf(stackKey);
    if (!res) return dmineNameOr(stackKey, localizeAssetName(name, lang), lang);
    const word = t(`mine.res.${res}`);
    return word.charAt(0).toUpperCase() + word.slice(1);
  };
}
