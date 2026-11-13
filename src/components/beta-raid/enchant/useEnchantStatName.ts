// Имя стата в лавке зачарования — одно для итога попытки и превью «было → стало».
import { useLang, useT } from "@/lib/i18n";
import { metaLabel } from "@/components/heroMeta";
import { ENCHANT_FISH_KEY } from "@/lib/enchant/enchantGear";

/** Ключи статов — как у артефакта (Attack, раса, земля…); рыбалка — свой ключ. */
export function useEnchantStatName(): (k: string) => string {
  const t = useT();
  const lang = useLang();
  return (k) => (k === ENCHANT_FISH_KEY ? t("enchantshop.stat_fishing") : metaLabel(k, lang));
}
