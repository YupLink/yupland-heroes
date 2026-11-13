// Строка «Получить 1 000 золота» в профиле — только Ангелине (designer-gold.ts).
// Остальным сервер отвечает «нельзя», и строки нет.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import {
  DESIGNER_GOLD_STEP,
  getDesignerGoldAccess,
  takeDesignerGold,
} from "@/server/api/designer-gold";

export function DesignerGoldRow({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const access = useQuery({
    queryKey: ["designer-gold"],
    queryFn: () => getDesignerGoldAccess(),
    staleTime: Infinity,
  });
  const amount = DESIGNER_GOLD_STEP.toLocaleString(ru ? "ru-RU" : "en-US");
  const take = useMutation({
    mutationFn: () => takeDesignerGold(),
    onSuccess: () => {
      toast.success(ru ? `+${amount} золота` : `+${amount} gold`);
      return qc.invalidateQueries({ queryKey: RESOURCES_KEY });
    },
    onError: (e) => toast.error(humanError(e)),
  });
  if (!access.data?.allowed) return null;
  return (
    <button
      type="button"
      data-game-button="row"
      className="castle-profile__row"
      disabled={take.isPending}
      onClick={() => take.mutate()}
    >
      {take.isPending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <Coins aria-hidden="true" />
      )}
      <span>{ru ? `Получить ${amount} золота` : `Get ${amount} gold`}</span>
    </button>
  );
}
