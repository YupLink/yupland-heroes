// Строка «Демо-остров» в профиле (island/demo-island.ts) — только у кого право
// demo_island; остальным сервер отвечает «нельзя», и строки нет. На демо-острове
// та же строка выводит обратно — туда, откуда пришла. После перехода — сразу
// карта с героем (requestCenter закрывает профиль и открывает мир).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, TreePalm } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { requestCenter } from "@/components/beta-raid/centerMapBus";
import { useIslandRefresh } from "@/components/beta-raid/island/useIsland";
import {
  demoIslandEnter,
  demoIslandLeave,
  getDemoIslandAccess,
} from "@/server/api/beta-raid/island/demo-island-api";

const KEY = ["demo-island"] as const;

export function DemoIslandRow({ ru }: { ru: boolean }) {
  const qc = useQueryClient();
  const refresh = useIslandRefresh();
  const access = useQuery({ queryKey: KEY, queryFn: () => getDemoIslandAccess(), staleTime: 0 });
  const onDemo = access.data?.onDemo === true;
  const move = useMutation({
    mutationFn: async () =>
      onDemo ? (await demoIslandLeave()).moved : await demoIslandEnter(),
    onSuccess: (to) => {
      refresh();
      void qc.invalidateQueries({ queryKey: KEY });
      if (to) requestCenter({ q: to.at.q, r: to.at.r });
    },
    onError: (e) => toast.error(humanError(e)),
  });
  if (!access.data?.allowed) return null;
  const Icon = move.isPending ? Loader2 : onDemo ? LogOut : TreePalm;
  return (
    <button
      type="button"
      data-game-button="row"
      className="castle-profile__row"
      disabled={move.isPending}
      onClick={() => move.mutate()}
    >
      <Icon className={move.isPending ? "animate-spin" : undefined} aria-hidden="true" />
      <span>
        {onDemo
          ? ru
            ? "Уйти с демо-острова"
            : "Leave demo island"
          : ru
            ? "Демо-остров"
            : "Demo island"}
      </span>
    </button>
  );
}
