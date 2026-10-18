import { useQuery } from "@tanstack/react-query";
import { getMyChipsForTemplate } from "@/server/api/chips-stake";
import { ChipDetailModal } from "./ChipDetailModal";

export function ChipDetailModalLoader({
  chipId,
  templateId,
  stunUntil,
  onClose,
}: {
  chipId: string;
  templateId: string;
  /** Оглушение приходит из инвентаря: getMyChipsForTemplate его не отдаёт. */
  stunUntil?: string | null;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["my-chips-for-template", templateId],
    queryFn: () => getMyChipsForTemplate({ data: { templateId } }),
  });
  if (q.isLoading || !q.data) return null;
  return (
    <ChipDetailModal
      chipId={chipId}
      template={q.data.template}
      chips={q.data.chips}
      stunUntil={stunUntil}
      onClose={onClose}
    />
  );
}
