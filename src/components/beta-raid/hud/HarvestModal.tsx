// Окно «Добыча»: шахты, поля и очередь наград — в одном месте.
//
// Раньше это были две плашки НАД картой (шахты и награды) плюс объезд грядок
// по одной. Плашки съедали высоту карты на телефоне и появлялись рывком, когда
// что-то накапливалось. Теперь всё живёт за кружком под мини-картой, а цифра
// на кружке говорит, есть ли смысл открывать.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Gift, HandCoins, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { isPieceKind } from "@/lib/rewardGroup";
import { groupHarvestRewardDisplay } from "@/lib/harvestRewardDisplay";
import { rewardShownAmount } from "@/lib/rewardKinds";
import { formatQty } from "@/lib/formatQty";
import { minesCreditedLine } from "@/lib/minesCreditedLine";
import { thumb } from "@/lib/image";
import { fetchHarvest, refreshAfterCollect } from "./useHarvest";
import { useRewardClaim } from "./useRewardClaim";
import { claimAllMines } from "@/server/api/beta-raid/mine-claim";
import { prizeIcon, prizeImage } from "@/lib/prizeIcon";
import { rewardKindLabelKey } from "@/lib/rewardKinds";
import { HudModal } from "./HudModal";
import { HarvestSourceList } from "./HarvestSourceList";
import { HarvestNotices } from "./HarvestNotices";
import { HARVEST_KEY } from "./useHarvest";
import pickaxeArt from "@/assets/harvest/pickaxe.webp";
import trophyArt from "@/assets/harvest/trophy.webp";
import packArt from "@/assets/harvest/pack-box.webp";
import "./harvest-modal.css";
import "./harvest-approved.css";

const KIND_KEY: Record<string, string> = {
  tickets: "braid.rw_tickets",
  likes: "braid.rw_likes",
  energy: "braid.rw_energy",
  pack: "braid.rw_pack",
  item: "braid.rw_item",
  // safety-net: packId=null → показываем хотя бы «ресурс»/«custom», а не сырой ключ
  resource: "braid.rw_resource",
  custom: "braid.rw_custom",
};

type Prize = { resource: string; token: string | null };
/** Клад (§8.117) показываем его призом — «Золото 5 000», а не «treasure». */
const shownKind = (r: { kind: string; prize?: Prize }): string =>
  r.prize ? (r.prize.resource === "token" ? (r.prize.token ?? "token") : r.prize.resource) : r.kind;

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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /**
   * Подпись награды. Своему товару имя даёт сервер («Пшеница»), ресурсу —
   * словарь по коду из pack_id, остальному — старая таблица ключей. Без этого
   * в списке стояло сырое «resource» и «custom».
   */
  const label = (r: { kind: string; packId: string | null; name?: string; prize?: Prize }): string => {
    if (r.name) return r.name;
    const kind = shownKind(r);
    const key = rewardKindLabelKey(kind, r.packId) ?? KIND_KEY[kind];
    return key ? t(key) : kind;
  };
  const sourceLabel = (source: string): string => {
    const key = `harvest.source.${source}`;
    const translated = t(key);
    return translated === key ? source : translated;
  };

  const q = useQuery({ queryKey: HARVEST_KEY, queryFn: fetchHarvest });
  const data = q.data;
  const mines = data?.mines ?? [];
  const fields = data?.fields ?? [];
  const rewards = data?.rewards ?? [];
  const groupedRewards = groupHarvestRewardDisplay(rewards);
  const rewardIcon = (reward: (typeof groupedRewards)[number]) => {
    const kind = shownKind(reward);
    const img = reward.image ? thumb(reward.image, 72, "black")
      : kind === "energy" ? "/resources/energy.png"
      : kind === "likes" ? "/resources/likes.png"
      : kind === "pack" ? packArt
      : prizeImage(kind, reward.packId);
    const { Icon, color } = prizeIcon(kind);
    return img ? <img src={img} alt="" className="h-5 w-5 shrink-0 object-contain" />
      : <Icon aria-hidden className="h-5 w-5 shrink-0" color={color} strokeWidth={1.7} />;
  };

  /** Сбор со всех шахт — тот же вызов, что был у плашки над картой. */
  const collect = useMutation({
    mutationFn: () => claimAllMines(),
    onSuccess: (res) => {
      const line = minesCreditedLine(t, res.credited);
      toast.success(line ? t("mine.collected_all_toast", { line }) : t("mine.nothing_yet"), {
        position: "top-center",
      });
      // Счёт монет (DARAI) — и за отнятые грибы, собранные этим же нажатием (§8.71).
      refreshAfterCollect(qc);
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => setBusy(false),
  });

  const rc = useRewardClaim();

  const rewardCount = data?.rewardCount ?? 0;
  const singlePending = useIsMutating({ mutationKey: ["harvest-capture-collect"] }) > 0;
  const pending = busy || collect.isPending || rc.pending || singlePending;
  const collectButton = (
    <button data-harvest-collect data-game-button="secondary" type="button" onClick={() => { setBusy(true); collect.mutate(); }}
      disabled={pending || mines.length === 0}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#88847d] bg-[#222528] px-3 py-2.5 text-sm font-semibold text-[#e9e2d5] disabled:opacity-40">
      {collect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
      {t("harvest.collect_all")}
    </button>
  );
  const claimButton = (
    <button data-harvest-claim data-game-button="primary" type="button" onClick={rc.claimAll}
      disabled={pending || rewards.length === 0}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#ffda7c] bg-gradient-to-b from-[#ffd36b] to-[#dd9419] px-3 py-2.5 text-sm font-bold text-[#211a0e] shadow-[0_5px_15px_#9f650033] disabled:opacity-40">
      {rc.allPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
      {t("harvest.claim_rewards")}
    </button>
  );

  return (
    <HudModal
      title={t("harvest.title")}
      icon={<img src={pickaxeArt} alt="" className="h-7 w-7 object-contain" />}
      onClose={onClose}
      presentation="centered"
      modalKind="harvest"
    >
      {q.isPending ? (
        <div className="grid place-items-center py-10" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-[#c39d63]" />
        </div>
      ) : q.isError ? (
        <div className="space-y-3 py-7 text-center text-sm text-[#e9e2d5]">
          <p>{t("harvest.load_error")}</p>
          <button data-game-button="secondary" type="button" onClick={() => q.refetch()} className="min-h-11 rounded-xl border border-[#8a714e] px-4 py-2">{t("harvest.retry")}</button>
        </div>
      ) : (
        <>
          <HarvestNotices notices={data?.notices ?? []} count={data?.noticeCount ?? 0} onShowCell={onShowCell} />
          <section data-harvest-rewards className="rounded-[22px] border border-[#a37e4c]/70 bg-[#141618] p-2.5">
            <div data-harvest-rewards-heading className="flex min-h-11 w-full items-center justify-between gap-2 px-1 text-sm font-semibold text-[#e9e2d5]">
              <span className="flex items-center gap-2"><img src={trophyArt} alt="" className="h-5 w-5 object-contain" />{t("harvest.raid_rewards_n", { n: rewardCount })}</span>
              {rewards.length > 0 && <button data-harvest-details-toggle data-game-button="row" type="button" onClick={() => setDetailsOpen((value) => !value)} aria-expanded={detailsOpen} aria-controls="harvest-reward-details"
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-[#d4b987]">
                <Info aria-hidden className="h-4 w-4" />{t(detailsOpen ? "harvest.hide_details" : "harvest.details")}
              </button>}
            </div>
            <div data-harvest-reward-content>
              {groupedRewards.length === 0 ? <p className="rounded-xl border border-white/10 px-3 py-5 text-center text-xs text-muted-foreground">{t("harvest.no_rewards")}</p> : (
                <div data-harvest-summary className="rounded-xl border border-[#343738] bg-[#111415]">
                  {groupedRewards.map((reward, index) => <div data-harvest-drop key={`${reward.kind}:${reward.packId ?? ""}:${reward.name ?? ""}:${index}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2 text-[#e8e0d5]">{rewardIcon(reward)}<span className="min-w-0 break-words" style={{ overflowWrap: "anywhere" }}>{label(reward)}</span></span>
                    <b className="shrink-0 tabular-nums text-[#f4c653]">{isPieceKind(reward.kind) ? `×${reward.count}` : formatQty(rewardShownAmount(reward.kind, reward.amount))}</b>
                  </div>)}
                </div>
              )}
              {rewards.length > 0 && claimButton}
              <div id="harvest-reward-details" data-harvest-details hidden={!detailsOpen} className="space-y-2">{detailsOpen && rewards.map((source, index) => (
                <div data-harvest-source key={`${source.source}-${source.place ?? ""}-${index}`} className="overflow-hidden rounded-2xl border border-white/15 bg-black/15">
                  <div className="flex items-center justify-between gap-2 border-b border-white/15 px-3 py-2.5">
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-[#f0e8db]" style={{ overflowWrap: "anywhere" }}>{sourceLabel(source.source)}</span>
                    {source.place != null && <span className="shrink-0 rounded-full border border-[#6d512b]/70 bg-[#5d421c]/35 px-2 py-0.5 text-[11px] text-[#f0c35c]">{t("braid.place_n", { n: source.place })}</span>}
                  </div>
                  <div className="divide-y divide-white/10">{source.rewards.map((reward, rewardIndex) => {
                    return <div data-harvest-drop key={`${reward.kind}:${reward.packId ?? ""}:${rewardIndex}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-[#b6b1aa]">
                        {rewardIcon(reward)}
                        <span className="min-w-0 break-words" style={{ overflowWrap: "anywhere" }}>{label(reward)}</span>
                      </span>
                      <b className="shrink-0 tabular-nums text-[#f4c653]">{reward.kind === "pack" || reward.kind === "item" ? `×${reward.count}` : reward.amount}</b>
                    </div>;
                  })}</div>
                </div>
              ))}</div>
            </div>
          </section>


          <HarvestSourceList mines={mines} fields={fields} now={now} clock={data} onShowCell={onShowCell} action={collectButton} />
        </>
      )}
    </HudModal>
  );
}

