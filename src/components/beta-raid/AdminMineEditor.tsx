// Настройка шахты в режиме бога: ресурс/выход/цена захвата прямо на живой карте.
//
// Пишет плоско в building_config клетки (ту же форму читает SQL) через общую
// очередь правок — как надпись таблички. Черновик держим до первого касания,
// иначе поздний ответ сервера затёр бы уже введённое (как у AdminSignEditor).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { MineConfigEditor } from "@/components/admin/hex-editor/MineConfigEditor";
import { mineConfigDraft, type MineConfig } from "@/lib/mineConfig";

export function AdminMineEditor({
  config,
  onSave,
}: {
  /** Текущий building_config клетки: невыгруженный или серверный. */
  config: Record<string, unknown> | null;
  /** Записать плоский конфиг шахты в очередь правок клетки. */
  onSave: (flat: Record<string, unknown>) => void;
}) {
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<MineConfig | null>(null);
  const value = draft ?? mineConfigDraft(config);

  const onChange = (next: MineConfig) => {
    setDraft(next);
    const flat: Record<string, unknown> = {
      resource: next.resource,
      yield: next.yield,
      captureCost: next.captureCost,
    };
    if (next.resource === "token" && next.token) flat.token = next.token;
    onSave(flat);
  };

  return <MineConfigEditor config={value} tokens={tokens} onChange={onChange} />;
}
