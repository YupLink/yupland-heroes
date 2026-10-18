// Строки «оплатить со счёта» в карточке энергопака.
//
// Вынесено из карточки: способов оплаты стало больше, и карточка перестала
// помещаться в лимит файла. Здесь ровно одна мысль — те же валюты, но деньги
// берутся из базы, а не подписью в кошельке. Тариф в $ (07.10.2026) — три
// строки: звёзды, USDT и DARAI по курсу (lib/usdTariff.ts).
import { Wallet } from "lucide-react";
import { AccountBalanceBadge } from "@/components/AccountBalanceBadge";
import type { UsdPrices, UsdToken } from "@/lib/usdTariff";
import { EnergyPayRow as PayRow } from "./EnergyPayRow";

type Offer = {
  key: string;
  label: string;
  kind: string;
  symbol: string | null;
  price: number | null;
  usd?: UsdPrices | null;
};

const USD_ORDER: UsdToken[] = ["STARS", "USDT", "Darai"];
const USD_LABEL: Record<UsdToken, string> = { STARS: "★", USDT: "USDT", Darai: "DARAI" };

export function EnergyAccountRows({
  offers,
  pending,
  busy,
  onBuy,
  onBuyUsd,
  part = "all",
}: {
  /** stars — только строки за звёзды (их ставим первыми), rest — остальное. */
  part?: "all" | "stars" | "rest";
  offers: Offer[];
  pending: boolean;
  busy: boolean;
  onBuy: (a: { symbol: string; payKind: "token" | "darai" }) => void;
  onBuyUsd: (a: { token: UsdToken; shown: number }) => void;
}) {
  // Билеты и энергия сюда не попадают — они и так живут в базе.
  const rows = offers.filter(
    (o) => (o.kind === "token" || o.kind === "darai") && o.price != null,
  );
  // Цена в $: вид usd — три строки; USDT-лесенка — только звёзды (сама USDT
  // — обычной строкой ниже, «если $ — от $»).
  const usdRows = offers.flatMap((o) =>
    o.usd && (o.kind === "usd" || (o.kind === "token" && o.symbol === "USDT"))
      ? (o.kind === "usd" ? USD_ORDER : (["STARS"] as UsdToken[])).flatMap((token) => {
          const price = o.usd?.[token];
          return price != null ? [{ key: `${o.key}:${token}`, token, price, step: o.price }] : [];
        })
      : [],
  );
  const usdShown = usdRows.filter((r) =>
    part === "all" ? true : part === "stars" ? r.token === "STARS" : r.token !== "STARS",
  );
  return (
    <>
      {usdShown.map((r) => (
        <PayRow
          key={r.key}
          icon={<Wallet className="h-4 w-4 text-emerald-400" />}
          label={
            <span className="inline-flex items-baseline gap-1 tabular-nums">
              {r.price.toLocaleString("ru-RU")}
              <span className="text-[11px] font-medium text-muted-foreground">
                {USD_LABEL[r.token]} со счёта
              </span>
              <span className="text-[10px] text-muted-foreground/70">${r.step}</span>
            </span>
          }
          hint={<AccountBalanceBadge token={r.token} need={r.price} />}
          disabled={false}
          pending={pending}
          busy={busy}
          onClick={() => onBuyUsd({ token: r.token, shown: r.price })}
        />
      ))}
      {part !== "stars" && rows.map((o) => (
        <PayRow
          key={`${o.key}:acc`}
          icon={<Wallet className="h-4 w-4 text-gold" />}
          label={
            <span className="inline-flex items-baseline gap-1 tabular-nums">
              {o.price?.toLocaleString("ru-RU")}
              <span className="text-[11px] font-medium text-muted-foreground">
                {o.label} со счёта
              </span>
            </span>
          }
          hint={
            <AccountBalanceBadge
              token={o.kind === "darai" ? "Darai" : o.symbol}
              need={o.price ?? undefined}
            />
          }
          disabled={false}
          pending={pending}
          busy={busy}
          onClick={() =>
            onBuy({
              symbol: o.kind === "darai" ? "Darai" : (o.symbol as string),
              payKind: o.kind === "darai" ? "darai" : "token",
            })
          }
        />
      ))}
    </>
  );
}
