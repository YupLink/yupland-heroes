// Покупка пака фишек: золото (бывшие билеты, ПРАВИЛА §8.61), перевод $DARAI и списание с ресурсного счёта.
//
// Вынесено из ChipPackCard, чтобы карточка осталась разметкой (≤250 строк) —
// тем же приёмом, что и у энергопаков.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { buyChipPack, purchaseChipPackViaDarai } from "@/server/api/chips-pack";
import { buyChipPackFromAccount } from "@/server/api/chips-pack-account-pay";
import { signFtTransfer } from "@/lib/ftTransfer";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { humanError } from "@/lib/humanError";

const DARAI_RECEIVER = "darai_gdrop.near";

/** Покупка пака за DARAI подписью из кошелька. Вынесена из хука, чтобы ею же
 *  платил Торговый дом замка (TradingHouseLive), — одна логика на оба окна. */
export async function buyChipPackWithDaraiOnChain(
  pack: { id: string; priceDarai: number | null },
  count: number,
) {
  if (pack.priceDarai == null) throw new Error("Цена в DARAI не задана");
  const n = Math.max(1, Math.floor(count));
  // Общий хелпер подписи: свои константы газа и умножение через BigInt
  // (падало на дробной цене) жили тут копией из окна пополнения.
  // memo обязателен — по нему крон отличает пак-платёж от билетного.
  const txHash = await signFtTransfer({
    ftContract: "darai.tkn.near",
    receiverId: DARAI_RECEIVER,
    amountHuman: pack.priceDarai * n,
    decimals: 18,
    memo: `buy chip pack ${pack.id}`,
  });
  try {
    window.localStorage.setItem(
      "pending_pack_purchase",
      JSON.stringify({
        packId: pack.id,
        txHash,
        priceDarai: pack.priceDarai,
        count: n,
        at: Date.now(),
      }),
    );
  } catch {
    /* ignore */
  }
  const res = await purchaseChipPackViaDarai({
    data: { packId: pack.id, txHash, count: n },
  });
  try {
    window.localStorage.removeItem("pending_pack_purchase");
  } catch {
    /* ignore */
  }
  return res;
}

export function useChipPackPurchase(pack: { id: string; priceDarai: number | null }) {
  const t = useT();
  const qc = useQueryClient();

  const buy = useMutation({
    mutationFn: async ({ payWith, count }: { payWith: "gold" | "darai"; count: number }) => {
      for (let i = 0; i < count; i++) {
        await buyChipPack({ data: { packId: pack.id, payWith } });
      }
    },
    onSuccess: () => {
      toast.success(t("chips.pack_bought"));
      qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
      qc.invalidateQueries({ queryKey: ["my-resources"] });
      qc.invalidateQueries({ queryKey: ["my-darai-balance"] });
      qc.invalidateQueries({ queryKey: ["my-darai-deposits"] });
      qc.invalidateQueries({ queryKey: ["chip-packs-public"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Оплата с ресурсного счёта: без подписи и без ожидания сети. Ключ нажатия
  // генерим один раз на клик — повтор запроса по таймауту иначе списал бы
  // второй раз. crypto.randomUUID в вебвью Telegram нет, отсюда фолбэк.
  const buyFromAccount = useMutation({
    mutationFn: (arg: number | { count: number; token?: "Darai" | "STARS" }) => {
      const count = typeof arg === "number" ? arg : arg.count;
      const token = typeof arg === "number" ? "Darai" : (arg.token ?? "Darai");
      const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
      const opId =
        typeof c?.randomUUID === "function"
          ? c.randomUUID().replace(/-/g, "").slice(0, 24)
          : `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      // Звёзды считаются от DARAI по курсу — сервер сверит с показанной ценой.
      const shown =
        token === "STARS" ? ((pack as { priceStars?: number | null }).priceStars ?? undefined) : undefined;
      return buyChipPackFromAccount({
        data: { packId: pack.id, count: Math.max(1, Math.floor(count)), opId, token, shown },
      });
    },
    onSuccess: (r) => {
      toast.success(`Паков: ${r.count} · со счёта ${r.spent.toLocaleString("ru-RU")} ${r.token}`);
      qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
      qc.invalidateQueries({ queryKey: ["chip-packs-public"] });
      qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      // «Мои NFT» показывает тот же баланс — обновляем и его, иначе там
      // висит цифра до покупки, и кажется, что деньги не списались.
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const buyDaraiOnChain = useMutation({
    mutationFn: (count: number) => buyChipPackWithDaraiOnChain(pack, count),
    onSuccess: () => {
      toast.success(
        t("chips.pack_bought_darai", {
          price: pack.priceDarai?.toLocaleString("ru-RU") ?? "",
        }),
      );
      qc.invalidateQueries({ queryKey: ["my-chip-packs"] });
      qc.invalidateQueries({ queryKey: ["chip-packs-public"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return { buy, buyFromAccount, buyDaraiOnChain };
}
