// Плата за ворота в плашке маршрута: « · 🪙 50 · 1 Darai» рядом с энергией.
//
// Владелец: цену ворот писать в той же графе, где стоит цена в энергии, —
// игрок видит заранее, что спишется, и решает сам. Списание делает шаг в
// дверь (gate-toll), здесь только предупреждение: строка, которой не хватает,
// краснеет, как «не хватает энергии», но кнопку «Идти» не гасит — последнее
// слово за сервером у самой двери.
//
// Иконки — те же, что в полосе ресурсов (marketResourceIconSrc); у токена,
// билетов и товара картинки нет — пишем словом, как в окне портала.
import { useT } from "@/lib/i18n";
import type { PortalPrice } from "@/lib/portal";
import { usePlayerFunds } from "./market/usePlayerFunds";
import { priceRow, priceShort, priceText } from "./portalPriceText";

export function PathTollLine({ toll }: { toll: PortalPrice[] }) {
  const t = useT();
  const have = usePlayerFunds();
  return (
    <span
      className="inline-flex items-center gap-1"
      title={t("braid.route_toll", { price: priceText(toll, t) })}
    >
      {toll.map((p) => {
        // Товар (рюкзак) клиент не читает — строка не краснеет; DARAI звездочника — звёздами.
        const short = priceShort(p, have);
        const { icon, label } = priceRow(p, t);
        return (
          <span
            key={`${p.resource}|${p.token ?? ""}|${p.itemKey ?? ""}`}
            className={`inline-flex items-center gap-0.5 ${short ? "text-destructive" : "text-gold"}`}
          >
            {" · "}
            {icon && <img src={icon} alt="" className="h-3 w-3" loading="lazy" decoding="async" />}
            {label}
          </span>
        );
      })}
    </span>
  );
}
