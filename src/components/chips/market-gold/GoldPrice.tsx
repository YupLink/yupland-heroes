// Цена лота маркета фишек: значок золота, число и (по желанию) подпись «Цена в
// золоте» — владелец, 21.10.2026: «иконка золота должна стоять и должно писаться,
// что это цена в золоте».
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useLang } from "@/lib/i18n";
import { fmtGoldAmt } from "./goldMarket";

export function GoldPrice({
  value,
  caption = false,
  className = "",
  glyphClassName = "h-3.5 w-3.5",
}: {
  value: number;
  caption?: boolean;
  className?: string;
  glyphClassName?: string;
}) {
  const ru = useLang() === "ru";
  const cap = ru ? "Цена в золоте" : "Price in gold";
  return (
    <span className={`flex flex-col items-center ${className}`} title={cap}>
      {caption && <small className="text-[10px] font-normal leading-tight opacity-70">{cap}</small>}
      <span className="inline-flex items-center justify-center gap-1">
        <ResourceGlyph kind="gold" className={glyphClassName} label={ru ? "золото" : "gold"} />
        {fmtGoldAmt(value, ru)}
      </span>
    </span>
  );
}
