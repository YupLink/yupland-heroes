// Открыт ли ПвП фишек (настройка chip_pvp_enabled, server/api/chipsPvpSwitch).
// Пока ответа нет — считаем выключенным: кнопка не мигнёт и не исчезнет.
import { useQuery } from "@tanstack/react-query";
import { getChipPvpEnabled } from "@/server/api/chipsPvpSwitch";

export function usePvpEnabled(): boolean {
  const q = useQuery({
    queryKey: ["pvp", "enabled"],
    queryFn: () => getChipPvpEnabled(),
    staleTime: 60_000,
  });
  return q.data?.enabled === true;
}
