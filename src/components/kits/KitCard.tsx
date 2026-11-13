import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
// Карточка набора: обложка и имя бокса, сколько штук, остаток тиража и мой
// лимит, цены в USDT / DARAI / Stars — как у тарифа подписки. Тап по цене —
// подтверждение строкой (сумма бывает крупной), «Купить» — списание со счёта;
// купленные боксы приходят в «Подарки».
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { subPriceText } from "@/lib/energySub";
import { kitBlock, kitTitle, type KitOffer, type KitToken } from "@/lib/kits";
import { SubPriceButtons } from "@/components/chips/SubPriceButtons";
import { useKitBuy } from "./useKitBuy";

type Pick = { token: KitToken; price: number };

export function KitCard({ kit }: { kit: KitOffer }) {
  const t = useT();
  const lang = useLang();
  const [pick, setPick] = useState<Pick | null>(null);
  usePurchaseMusic(pick !== null);
  const buy = useKitBuy(() => setPick(null));
  const name = kitTitle(kit);
  const block = kitBlock(kit);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-background/70 p-3">
      <div className="flex items-start gap-3">
        {kit.boxImage && (
          <img src={kit.boxImage} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-bold">{name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            {kit.left !== null && kit.stock !== null && (
              <span>{t("kits.left", { n: kit.left, total: kit.stock })}</span>
            )}
            {kit.perAccount !== null && (
              <span>{t("kits.mine", { n: kit.mine, limit: kit.perAccount })}</span>
            )}
          </div>
        </div>
      </div>

      {block ? (
        <button
          type="button"
          disabled
          className="w-full rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-bold text-gold opacity-40"
        >
          {block === "sold_out" ? t("kits.sold_out") : t("kits.bought")}
        </button>
      ) : (
        <SubPriceButtons
          prices={kit.prices}
          disabled={buy.isPending}
          onPick={(token, price) => setPick({ token, price })}
        />
      )}

      {pick && !block && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2 text-[12px]">
          <span className="min-w-0 flex-1">
            {t("kits.buy_confirm", { name, price: subPriceText(pick.token, pick.price, lang) })}
          </span>
          <button
            type="button"
            onClick={() =>
              buy.mutate({
                kitId: kit.id,
                token: pick.token,
                price: pick.price,
                boxId: kit.boxId,
                boxCount: kit.boxCount,
              })
            }
            disabled={buy.isPending}
            className="inline-flex items-center gap-1 rounded-lg gradient-gold px-3 py-1.5 font-bold text-gold-foreground disabled:opacity-50"
          >
            {buy.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("kits.buy")}
          </button>
          <button
            type="button"
            onClick={() => setPick(null)}
            disabled={buy.isPending}
            className="rounded-lg border border-border px-3 py-1.5"
          >
            {t("kits.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

