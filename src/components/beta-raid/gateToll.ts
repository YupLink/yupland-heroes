// Плата за дверь — вслух.
//
// Молча списанное золото игрок читает как пропажу, поэтому шаг через
// шлагбаум обязан сказать, что и сколько забрал, и обновить счётчики.
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { TICKETS_KEY } from "@/lib/hooks/useTickets";
import { invalidateBackpack } from "@/lib/query";
import { priceText } from "./portalPriceText";
import type { PortalPrice } from "@/lib/portal";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export function announceToll(qc: QueryClient, toll: PortalPrice[] | undefined, t: TFn): void {
  if (!toll || toll.length === 0) return;
  toast.info(t("braid.gate_paid", { price: priceText(toll, t) }));
  qc.invalidateQueries({ queryKey: RESOURCES_KEY });
  qc.invalidateQueries({ queryKey: ["my-like-balance"] });
  // Дверь за токен (Darai) или билеты: без этого счёт в шапке стоял бы
  // прежним до опроса, хотя плашка только что обещала списание.
  qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
  qc.invalidateQueries({ queryKey: TICKETS_KEY });
  // Дверь за товар (яблоки, слиток) забирает из рюкзака — обновить и его.
  if (toll.some((p) => p.resource === "item")) invalidateBackpack(qc);
}
