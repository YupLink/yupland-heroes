// Загрузка карточки фишки для Казармы замка: пока данных нет — состояние
// «загрузка/ошибка с повтором», а не пустота (у игроков — ChipDetailModalLoader).
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import type { ChipUpgradeState } from "@/lib/chips/upgradeBlock";
import { getMyChipsForTemplate } from "@/server/api/chips-stake";
import { ChipDetailLoadState } from "./ChipDetailLoadState";
import { BarracksChipDetailModal } from "./BarracksChipDetailModal";

export function BarracksChipDetailLoader({ chipId, templateId, stunUntil, upgradeStates, onClose }: {
  chipId: string;
  templateId: string;
  stunUntil?: string | null;
  upgradeStates?: Record<string, ChipUpgradeState>;
  onClose: () => void;
}) {
  const ru = useLang() === "ru";
  const q = useQuery({ queryKey: ["my-chips-for-template", templateId], queryFn: () => getMyChipsForTemplate({ data: { templateId } }) });
  // Вложенные окна (улучшение, результат) не сбрасываем на фоновом перечитывании.
  if (!q.data) return <ChipDetailLoadState ru={ru} error={q.isError || !q.isFetching} onRetry={() => void q.refetch()} onClose={onClose} />;
  return <BarracksChipDetailModal chipId={chipId} template={q.data.template} chips={q.data.chips} stunUntil={stunUntil} upgradeStates={upgradeStates} onClose={onClose} />;
}
