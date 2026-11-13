// Общее для окна банка: ключ списка пулов, формат чисел, значок ресурса.
import { isBankResource, tokenIcon, tokenLabel, tokenLetters, type BankToken } from "@/lib/castleBank";

export { BANK_POOLS_KEY } from "./bankKeys";

export function fmtNum(n: number, ru: boolean): string {
  return n.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 6 });
}

/** Значок ресурса или монеты: картинка; монета без картинки — кружок с буквами, как в Казне. */
export function TokenBadge({ token, ru }: { token: BankToken; ru: boolean }) {
  const icon = tokenIcon(token);
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      {icon ? (
        <img
          src={icon}
          alt=""
          className={isBankResource(token) ? "h-5 w-5 object-contain" : "h-5 w-5 rounded-full object-cover"}
        />
      ) : (
        <span className="grid h-5 w-5 place-items-center rounded-full border border-[#b5945e] bg-[#213c59] text-[9px] text-[#edc36b]">
          {tokenLetters(token)}
        </span>
      )}
      {tokenLabel(token, ru)}
    </span>
  );
}
