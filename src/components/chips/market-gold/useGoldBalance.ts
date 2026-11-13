// Золото игрока для маркета фишек — общий кэш ресурсов ["my-resources"].
// null — баланс ещё не пришёл или не загрузился: тогда кнопки не гасим, отказ
// (если что) скажет сервер.
import { useResources } from "@/lib/hooks/useResources";

export function useGoldBalance(): number | null {
  const q = useResources();
  if (q.isError || q.data == null) return null;
  return Number(q.data.gold) || 0;
}
