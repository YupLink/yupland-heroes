// Окно «Добыча»: шахты, поля и очередь наград — в одном месте.
//
// Раньше это были две плашки НАД картой (шахты и награды) плюс объезд грядок
// по одной. Плашки съедали высоту карты на телефоне и появлялись рывком, когда
// что-то накапливалось. Теперь всё живёт за кружком под мини-картой, а цифра
// на кружке говорит, есть ли смысл открывать.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Gift, Loader2, Pickaxe } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { getHarvestSummary } from "@/server/api/beta-raid/harvest-summary";
import { claimAllMines } from "@/server/api/beta-raid/mine-claim";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { HudModal } from "./HudModal";
import { HarvestSection } from "./HarvestSection";
import { MineList, FieldList, num } from "./HarvestLists";
import { HarvestByKind } from "./HarvestByKind";
import { HarvestRewards } from "./HarvestRewards";
import { MineCaptureNotices } from "./MineCaptureNotices";
import { useRewardClaim } from "./useRewardClaim";
import { HARVEST_KEY } from "./useHarvest";

export function HarvestModal({
  onClose,
  onShowCell,
}: {
  onClose: () => void;
  /** Показать клетку на карте: окно закрывается, камера едет, клетка мигает. */
  onShowCell?: (q: number, r: number) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: HARVEST_KEY, queryFn: () => getHarvestSummary() });
  const data = q.data;
  const mines = data?.mines ?? [];
  const fields = data?.fields ?? [];
  const rewards = data?.rewards ?? [];

  /** Сбор со всех шахт — тот же вызов, что был у плашки над картой. */
  const collect = useMutation({
    mutationFn: () => claimAllMines(),
    onSuccess: (res) => {
      const line = Object.entries(res.credited)
        .map(([k, n]) => {
          const translated = t(`mine.res.${k}`);
          return `${n} ${translated === `mine.res.${k}` ? k : translated}`;
        })
        .join(" · ");
      toast.success(line ? t("mine.collected_all_toast", { line }) : t("mine.nothing_yet"), {
        position: "top-center",
      });
      for (const key of [HARVEST_KEY, MINE_PENDINGS_KEY, RESOURCES_KEY, ENERGY_KEY]) {
        qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      }
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => setBusy(false),
  });

  // Награды карты: боссы, сундуки, рейд — очередь одна; забирать можно всё
  // разом или одну группу по типу (кнопки в HarvestRewards). Тост и
  // инвалидации у обоих путей общие — в хуке.
  const rc = useRewardClaim();

  const rewardCount = data?.rewardCount ?? 0;
  const perHour = mines.reduce((s, m) => s + (m.yield || 0), 0);
  const fieldsPerHour = fields.reduce((s, f) => s + (f.perHour || 0), 0);
  const pending = busy || collect.isPending || rc.pending;

  return (
    <HudModal
      title={t("harvest.title")}
      subtitle={
        mines.length + fields.length > 0
          ? `${t("harvest.total_per_hour")}: ${num(perHour + fieldsPerHour)}`
          : undefined
      }
      icon={<Pickaxe className="h-4 w-4 text-gold" />}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={rc.claimAll}
            disabled={pending || rewardCount === 0}
            data-claim-all
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-40"
          >
            {rc.allPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Gift className="h-4 w-4" />
            )}
            {t("harvest.claim_all_rewards")}
          </button>
          <button
            type="button"
            onClick={() => {
              setBusy(true);
              collect.mutate();
            }}
            disabled={pending || mines.length === 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-300 disabled:opacity-40"
          >
            {collect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HandCoins className="h-4 w-4" />
            )}
            {t("harvest.collect_all")}
          </button>
        </>
      }
    >
      {q.isPending ? (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Свод по видам: игроку сразу видно «моя добыча яблок / DARAI /
              бананов в час» без развёртывания списка. Ноль-добычу
              не рисуем (жалоба «если не добывается — не отображать»). */}
          <HarvestByKind mines={mines} fields={fields} />

          {/* «Шахты отбили» — раньше наград: игрок пришёл узнать, куда делась
              шахта и что за это начислено. Пусто — секции нет. */}
          <MineCaptureNotices captures={data?.captures ?? []} onShowCell={onShowCell} />

          {/* Награды — после «Шахты отбили», но раньше остального: за ними и
              приходят — босс повержен, сундук вскрыт, а шахты с полями капают
              сами и терпят. Список по типам, у каждой группы своя кнопка. */}
          <HarvestRewards
            sources={rewards}
            count={rewardCount}
            pending={pending}
            busyKey={rc.busyKey}
            onClaimGroup={rc.claimGroup}
          />

          <HarvestSection
            title={t("harvest.mines_n", { n: mines.length })}
            count={mines.length}
            defaultOpen={mines.length > 0 && mines.length <= 6}
          >
            <MineList mines={mines} onShowCell={onShowCell} />
          </HarvestSection>

          <HarvestSection
            title={t("harvest.fields_n", { n: fields.length })}
            count={fields.length}
            defaultOpen={fields.length > 0 && fields.length <= 6}
          >
            <FieldList fields={fields} onShowCell={onShowCell} />
          </HarvestSection>
        </>
      )}
    </HudModal>
  );
}
