// Плашка «столько-то этого токена на счету» рядом с ценой.
//
// Владелец просил видеть остаток прямо в момент оплаты, а не ходить за ним на
// отдельный экран. Если счёт не наш или число ещё не доехало — плашка не
// рисуется вовсе: пустое место честнее прочерка.
import { Link } from "@tanstack/react-router";
import { useAccountBalance } from "@/lib/hooks/useAccountBalances";

export function AccountBalanceBadge({
  token,
  need,
}: {
  token: string | null | undefined;
  /** Цена покупки. Если задана и её не хватает — плашка зовёт пополнить. */
  need?: number;
}) {
  const balance = useAccountBalance(token);
  if (balance === null || !token) return null;

  const short = need != null && balance < need;
  const shown = balance.toLocaleString("ru-RU", { maximumFractionDigits: 4 });

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
        short
          ? "border-red-500/40 bg-red-500/5 text-red-400"
          : "border-border/60 bg-secondary/20 text-muted-foreground"
      }`}
    >
      на счету {shown} {token}
      {short && (
        <Link to="/wallet" className="font-semibold text-gold underline-offset-2 hover:underline">
          пополнить
        </Link>
      )}
    </span>
  );
}
