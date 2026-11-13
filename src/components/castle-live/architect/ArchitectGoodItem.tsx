// Товар в цене Архитектора: картинка, имя и сколько штук; не хватает у
// выбранного героя — класс lack (красный). Строка заготовки и карточка Ратуши.
import { Package } from "lucide-react";
import { thumb } from "@/lib/image";
import type { ArchitectGoodView } from "@/lib/castleArchitectGoods";

export function ArchitectGoodItem({
  good,
  ru,
  className,
  okClassName,
  lackClassName,
  imgClassName,
}: {
  good: ArchitectGoodView;
  ru: boolean;
  className?: string;
  okClassName?: string;
  lackClassName: string;
  imgClassName: string;
}) {
  const lack = good.have < good.qty;
  const qty = good.qty.toLocaleString(ru ? "ru-RU" : "en-US");
  return (
    <span
      className={`${className ?? ""} ${(lack ? lackClassName : okClassName) ?? ""}`.trim() || undefined}
      title={`${good.name} ×${qty}`}
    >
      {good.image ? (
        <img src={thumb(good.image, 64)} alt="" loading="lazy" className={imgClassName} />
      ) : (
        <Package aria-hidden="true" className={imgClassName} />
      )}
      <span className="max-w-[9rem] truncate">{good.name}</span>×{qty}
    </span>
  );
}
