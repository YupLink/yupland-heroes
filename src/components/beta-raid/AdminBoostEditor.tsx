// Настройка алтаря-БУСТА в режиме бога: характеристика, вилка прибавки и цена
// прямо на живой карте.
//
// Тот же редактор, что в гекс-редакторе, — правило одно, форма одна. Черновик
// держим до первого касания: поздний ответ сервера иначе затирал бы введённое.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { BoostConfigEditor } from "@/components/admin/hex-editor/BoostConfigEditor";
import { boostConfigDraft, type BoostCellConfig } from "@/lib/boostConfig";

export function AdminBoostEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<BoostCellConfig | null>(null);
  const value = draft ?? boostConfigDraft(config);

  return (
    <BoostConfigEditor
      config={value}
      tokens={tokens}
      onChange={(next) => {
        setDraft(next);
        // Соседние ключи конфига клетки не трогаем — они живут рядом.
        onSave({ ...(config ?? {}), boost: next });
      }}
    />
  );
}
