// Казна — в профиле (владелец, 07.10.2026: «в профиль внедрить казну»):
// отдельной постройки Казны в замке больше нет, вход — отсюда.
import { ChevronRight, Landmark } from "lucide-react";
import { useAccountBalances } from "@/lib/hooks/useAccountBalances";

export function ProfileTreasuryEntry({ ru, onOpen }: { ru: boolean; onOpen: () => void }) {
  const balances = useAccountBalances();
  const stars = balances.data?.balances.find((b) => b.token.toLowerCase() === "stars")?.balance;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-gold/40 bg-gold/5 px-3 text-left"
    >
      <Landmark className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
      <span className="flex-1">
        <span className="block font-semibold">{ru ? "Казна" : "Treasury"}</span>
        <span className="block text-xs text-muted-foreground">
          {ru ? "Звёзды и монеты" : "Stars and coins"}
          {stars != null && ` · ★ ${stars.toLocaleString(ru ? "ru-RU" : "en-US")}`}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
