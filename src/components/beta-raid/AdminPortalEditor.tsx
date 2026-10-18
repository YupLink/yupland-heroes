// Настройка портала в режиме бога: сеть, уровень героя и цена прохода прямо на
// живой карте.
//
// Тот же редактор, что и в гекс-редакторе, — правило одно, форма одна. Пишет в
// building_config клетки через общую очередь правок (как шахта и табличка), и
// черновик держим до первого касания: поздний ответ сервера иначе затирал бы
// уже введённое.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { PortalConfigEditor } from "@/components/admin/hex-editor/PortalConfigEditor";
import { portalConfig as readPortalConfig, type PortalConfig } from "@/lib/portal";
import { MAP_KEY } from "./useMapProgressive";
import type { MapDataV } from "./mapBlob";

export function AdminPortalEditor({
  config,
  onSave,
}: {
  /** Текущий building_config клетки: невыгруженный или серверный. */
  config: Record<string, unknown> | null;
  /** Записать настройку портала в очередь правок клетки. */
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  // Карта на экране — этаж, где стоит клетка: его комнаты предлагаются первыми.
  const mapId = useQueryClient().getQueryData<MapDataV>(MAP_KEY)?.mapId || null;
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<PortalConfig | null>(null);
  const value = draft ?? readPortalConfig(config, true);

  return (
    <PortalConfigEditor
      config={value}
      tokens={tokens}
      mapId={mapId}
      onChange={(next) => {
        setDraft(next);
        // Соседние ключи конфига (надпись, шахта, цены дерева) не трогаем:
        // на клетке они живут рядом.
        onSave({ ...(config ?? {}), portal: next });
      }}
    />
  );
}
