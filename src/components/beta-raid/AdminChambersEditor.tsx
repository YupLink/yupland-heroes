// Настройка покоев в режиме бога: цены отдыха — прямо на живой карте.
//
// Черновик держим до первого касания: поздний ответ сервера иначе затирал бы
// уже введённое. Формат цен — тот же ServicePrice[], редактор общий с деревом
// уровней (TreePricesEditor).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Moon } from "lucide-react";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { TreePricesEditor } from "@/components/admin/hex-editor/TreePricesEditor";
import { chambersPricesDraft, type ServicePrice } from "@/lib/buildingEffect";

export function AdminChambersEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<ServicePrice[] | null>(null);
  const value = draft ?? chambersPricesDraft(config);

  return (
    <>
      <p className="mb-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-gold">
        <Moon className="h-3 w-3" />
        Цены отдыха в ЭТИХ покоях
      </p>
      <TreePricesEditor
        prices={value}
        tokens={tokens}
        onChange={(next) => {
          setDraft(next);
          const rest = { ...(config ?? {}) } as Record<string, unknown>;
          const kept = next.filter((p) => p.amount > 0);
          if (kept.length > 0) rest.chambersPrices = kept;
          else delete rest.chambersPrices;
          onSave(rest);
        }}
      />
      {value.length === 0 && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          Пока цен нет — покои закрыты, снимать эффекты негде.
        </p>
      )}
    </>
  );
}
