// Плитка группы в пикере «Какой артефакт отдать» (MarketArtPick): картинка с
// полосой прочности, имя, «свободно N». Вынесено ради лимита ≤250 строк.
//
// multi — ломбард, как у героев (MarketHeroPick): отмеченная группа с галочкой,
// а если свободных больше одной — степпер «сколько штук из неё» (ноль снимает
// отметку). Степпер глотает клик, иначе каждое «+» заодно снимало бы отметку.
import { Check, ImageOff } from "lucide-react";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { ArtWearBar } from "@/components/ArtWearBar";
import { EnchantMark } from "@/components/EnchantMark";
import { QtyStepper } from "./QtyStepper";
import { numText } from "./num";
import type { PickRow } from "./artPickSel";

export function ArtPickTile({
  a,
  picked,
  n,
  multi,
  onTap,
  onN,
}: {
  /** enchanted / enchantPct — зачарованные в группе (§8.87): ✦ с «N из M». */
  a: PickRow & { imageUrl: string | null; enchanted?: number; enchantPct?: number };
  picked: boolean;
  /** Сколько штук группы отмечено (multi). */
  n: number;
  multi: boolean;
  onTap: () => void;
  onN: (n: number) => void;
}) {
  const t = useT();
  return (
    <div
      onClick={onTap}
      className={`relative flex cursor-pointer flex-col gap-1 rounded-lg border p-1.5 ${
        picked ? "border-gold bg-gold/10" : "border-border"
      }`}
    >
      <div className="relative overflow-hidden rounded-lg">
        {a.imageUrl ? (
          <img
            // Через уменьшающий прокси: арты лежат полноразмерными, а плитка тут ~110 px.
            src={thumb(a.imageUrl, 160)}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-lg border border-border object-contain"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center rounded-lg border border-border text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
        {/* Полоса — прочность группы: у ломбарда бывает и ноль. */}
        <ArtWearBar durability={100 - (a.wear ?? 0)} />
        {/* Группа — шаблон и износ: экземпляры в ней не различить, поэтому «1 из 5». */}
        {!!a.enchanted && (
          <EnchantMark pct={a.enchantPct} corner of={{ n: a.enchanted, total: a.count }} />
        )}
      </div>
      {multi && picked && (
        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-gold text-gold-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
      <span className="truncate text-[11px] leading-tight">{a.name}</span>
      <span className="text-[10px] text-muted-foreground">
        {t("market.art_free", { n: numText(a.count) })}
      </span>
      {multi && picked && a.count > 1 && (
        <div onClick={(e) => e.stopPropagation()}>
          <QtyStepper value={n} min={0} max={a.count} compact onChange={onN} />
        </div>
      )}
    </div>
  );
}
