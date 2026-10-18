// Наборы в окне «Купить энергию»: боксы из конструктора за цену в $, всё, что
// админ включил. Включённых наборов нет — секции нет вовсе.
import { useQuery } from "@tanstack/react-query";
import { Gem } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getKitShop } from "@/api";
import { KitCard } from "./KitCard";
import { KITS_KEY } from "./useKitBuy";

export function KitsSection() {
  const t = useT();
  const q = useQuery({ queryKey: KITS_KEY, queryFn: () => getKitShop(), staleTime: 30_000 });
  // Ответ лежит в суточном кэше — форму не принимаем на веру (§11 п.13в).
  const kits = Array.isArray(q.data) ? q.data : [];
  if (kits.length === 0) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-gold/30 bg-gold/5 p-3">
      <div className="flex items-center gap-2 font-display text-base font-bold">
        <Gem className="h-4 w-4 text-gold" />
        {t("kits.title")}
      </div>
      {kits.map((k) => (
        <KitCard key={k.id} kit={k} />
      ))}
    </section>
  );
}
