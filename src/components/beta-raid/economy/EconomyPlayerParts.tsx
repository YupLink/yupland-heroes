// Раскрытая карточка балансов игрока: все ресурсы одного игрока с иконками.
// Отдельный модуль — чтобы EconomyPlayersTab оставался ≤250 строк.
//
// Картинки и подписи приходят с сервера через currencyMap (см.
// admin-economy-currency-icons.ts) — здесь только раскладка. Если картинки
// нет, показываем текстовый плашковый шорткод из первых букв подписи.
import type { PlayerBalance } from "@/server/api/beta-raid/admin-economy-types";
import { fmt, currencyLabel } from "./economyFormat";
import { CurrencyIcon } from "./CurrencyIcon";

export type CurrencyMeta = { label: string; image: string | null };

function metaOf(map: Map<string, CurrencyMeta>, key: string): CurrencyMeta {
  return map.get(key) ?? { label: currencyLabel(key), image: null };
}

export function PlayerDetails({
  balances,
  currencyMap,
}: {
  balances: PlayerBalance[];
  currencyMap: Map<string, CurrencyMeta>;
}) {
  const rows = balances.filter((b) => b.amount !== 0);
  if (rows.length === 0) {
    return <div className="text-[11px] text-muted-foreground">Балансов нет.</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
      {rows.map((b) => {
        const m = metaOf(currencyMap, b.currency);
        return (
          <div
            key={b.currency}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5"
          >
            <div className="shrink-0">
              <CurrencyIcon currencyKey={b.currency} image={m.image} label={m.label} size="lg" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[10px] uppercase text-muted-foreground">{m.label}</div>
              <div className="tabular-nums text-[13px] font-semibold">{fmt(b.amount)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
