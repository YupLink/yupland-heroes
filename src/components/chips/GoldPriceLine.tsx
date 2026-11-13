// Цена улучшения фишки в золоте (владелец, 21.10.2026): «иконка золота и писаться
// должно, что это золото требуется». Строка «Требуется золото: N» со значком; не
// хватает — «Не хватает золота: нужно N, у тебя M», той же фразой, что отказ
// сервера (словарь chips.upg_gold). Кнопку улучшения при нехватке гасит вызывающий
// по goldShort.
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { fmtGold } from "@/lib/craftGold";
import { useLang, useT } from "@/lib/i18n";

/** Не хватает золота — только когда и цена, и баланс уже известны. */
export const goldShort = (need: number | null, have: number | null): boolean =>
  need != null && have != null && have < need;

/** «Не хватает золота: нужно N, у тебя M». */
export function GoldShortNote({
  need,
  have,
  className,
}: {
  need: number;
  have: number;
  className?: string;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  return (
    <p role="status" className={className}>
      {t("chips.upg_gold", { need: fmtGold(need, ru), have: fmtGold(have, ru) })}
    </p>
  );
}

/** «Требуется золото: N» или, если не хватает, — отказ той же формы, что у сервера. */
export function GoldRequiredLine({
  need,
  have,
  className,
}: {
  need: number | null;
  have: number | null;
  className?: string;
}) {
  const ru = useLang() === "ru";
  if (need == null) return null;
  if (have != null && goldShort(need, have))
    return <GoldShortNote need={need} have={have} className={className} />;
  return (
    <p className={className}>
      {ru ? "Требуется золото:" : "Gold required:"}{" "}
      <ResourceGlyph kind="gold" className="h-4 w-4 align-[-3px]" /> {fmtGold(need, ru)}
    </p>
  );
}
