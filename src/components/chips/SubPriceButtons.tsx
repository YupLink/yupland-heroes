// Цена за $ в трёх валютах — кнопками: USDT, DARAI по курсу, Stars. Общая для
// тарифов подписки и наборов. Числа — готовые с сервера; нет курса — кнопка
// DARAI неактивна. Скидка DARAI и наценка Stars игроку не показываются.
import { useLang } from "@/lib/i18n";
import { SUB_TOKENS, subPriceText, type SubToken } from "@/lib/energySub";
import { useEntryRules } from "@/hooks/useEntryRules";

export function SubPriceButtons({
  prices,
  disabled,
  onPick,
}: {
  prices: Partial<Record<SubToken, number | null>> | null | undefined;
  disabled: boolean;
  onPick: (token: SubToken, price: number) => void;
}) {
  const lang = useLang();
  // Звёзды — только аккаунту с настоящим Telegram (§8.127).
  const stars = useEntryRules().stars;
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUB_TOKENS.filter((tok) => stars || tok !== "STARS").map((tok) => {
        // Ответ лежит в суточном кэше — число проверяем, а не верим форме.
        const raw = prices?.[tok];
        const price = typeof raw === "number" && raw > 0 ? raw : null;
        return (
          <button
            key={tok}
            type="button"
            disabled={price == null || disabled}
            onClick={() => price != null && onPick(tok, price)}
            className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12px] font-bold text-gold disabled:opacity-40"
          >
            {price == null ? `— ${tok}` : subPriceText(tok, price, lang)}
          </button>
        );
      })}
    </div>
  );
}
