// Кнопки режима стройки поверх карты (ПРАВИЛА §8.59 п. 8, владелец 21.10.2026):
// красный ✗ — выйти из режима (виден всегда), зелёный ✓ — только когда призрак
// на зелёной клетке: кладёт чертёж. На красной клетке вместо ✓ — коротко, почему
// нельзя. Позицию под призраком ставит кадр карты (placeMineBuildUi).
import { memo, useSyncExternalStore } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { createMinePlan } from "@/server/api/beta-raid/mine-place/mine-plan";
import {
  exitMineBuild,
  getMineBuild,
  ghostCandidate,
  minePlanKey,
  notePlanCreated,
  setMineBuildEl,
  subscribeMineBuild,
} from "./mineBuildStore";

const BTN =
  "pointer-events-auto grid h-11 w-11 place-items-center rounded-full border-2 shadow-lg active:scale-95 disabled:opacity-60";

function MineBuildLayerView() {
  const t = useT();
  const qc = useQueryClient();
  const build = useSyncExternalStore(subscribeMineBuild, getMineBuild, () => null);
  // Клетка под призраком — из того же снимка: новый build = новый снимок.
  const at = build ? ghostCandidate() : null;
  const plan = useMutation({
    mutationFn: (v: { stackKey: string; q: number; r: number }) => createMinePlan({ data: v }),
    onSuccess: (view) => {
      qc.setQueryData(minePlanKey(view.mapId), view);
      exitMineBuild();
      toast.success(t("mineplace.plan_set"));
      notePlanCreated(view);
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  if (!build?.ghost) return null;
  const ok = !!at?.ok;
  return (
    <div
      ref={setMineBuildEl}
      className="pointer-events-none absolute left-0 top-0 z-[35] flex flex-col items-center gap-1"
      style={{ visibility: "hidden" }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t("mineplace.exit")}
          onClick={exitMineBuild}
          disabled={plan.isPending}
          className={`${BTN} border-[#ff5470] bg-[#3a0d16]/90 text-[#ff5470]`}
        >
          <X className="h-5 w-5" strokeWidth={3} />
        </button>
        {ok && (
          <button
            type="button"
            aria-label={t("mineplace.confirm")}
            disabled={plan.isPending}
            onClick={() =>
              build.ghost &&
              plan.mutate({ stackKey: build.stackKey, q: build.ghost.q, r: build.ghost.r })
            }
            className={`${BTN} border-[#37d67a] bg-[#0d3a22]/90 text-[#37d67a]`}
          >
            {plan.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" strokeWidth={3} />
            )}
          </button>
        )}
      </div>
      {at && !at.ok && at.reason && (
        <div className="max-w-[220px] rounded-full bg-black/80 px-3 py-1 text-center text-[11px] font-medium leading-tight text-[#ff8a9c]">
          {serverErrorText(new Error(at.reason), t)}
        </div>
      )}
    </div>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const MineBuildLayer = memo(MineBuildLayerView);
