// «Добыча» в замке (дизайн Ангелины, 07.10.2026): доход шахт и полей лентой
// сверху (HarvestIncomeStrip), «Собрать всё» под ней, награды рейда списком и
// «Забрать награды». Те же серверные действия, что у окна рейда (HarvestModal);
// у игроков в рейде — прежнее окно, пока замок не открыт всем.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Gift, HandCoins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { mineRowReady } from "@/lib/mineLost";
import { showClaimResult } from "@/lib/claimToast";
import { claimAllMines } from "@/server/api/beta-raid/mine-claim";
import { claimRaidRewards } from "@/server/api/raid-rewards";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { prizeIcon, prizeImage } from "@/lib/prizeIcon";
import { rewardKindLabelKey, rewardShownAmount } from "@/lib/rewardKinds";
import { invalidateHeroQueries } from "@/lib/query";
import { HudModal } from "./HudModal";
import { HarvestIncomeStrip } from "./HarvestIncomeStrip";
import { fetchHarvest, HARVEST_KEY } from "./useHarvest";
import pickaxeArt from "@/assets/harvest/pickaxe.webp";
import trophyArt from "@/assets/harvest/trophy.webp";
import packArt from "@/assets/harvest/pack-box.webp";
import "./harvest-modal.css";

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

export function CastleHarvestModal({
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
  const [rewardsOpen, setRewardsOpen] = useState(true);
  /**
   * Подпись награды. Своему товару имя даёт сервер («Пшеница»), ресурсу —
   * словарь по коду из pack_id, остальному — старая таблица ключей. Без этого
   * в списке стояло сырое «resource» и «custom».
   */
  const label = (r: { kind: string; packId: string | null; name?: string }): string => {
    if (r.name) return r.name;
    const key = rewardKindLabelKey(r.kind, r.packId) ?? KIND_KEY[r.kind];
    return key ? t(key) : r.kind;
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

  /** Сбор со всех шахт — тот же вызов, что был у плашки над картой. */
  const collect = useMutation({
    mutationFn: () => claimAllMines(),
    onSuccess: (res) => {
      const line = Object.entries(res.credited)
        .filter(([, n]) => Number(n) > 0)
        .map(([k, n]) => {
          const translated = t(`mine.res.${k}`);
          return `${n} ${translated === `mine.res.${k}` ? k : translated}`;
        })
        .join(" · ");
      if (line) toast.success(t("mine.collected_all_toast", { line }), { position: "top-center" });
      else if (mines.some((m) => mineRowReady(m) > 0))
        toast.warning(t("harvest.collect_unconfirmed"), { position: "top-center" });
      else toast.info(t("mine.nothing_yet"), { position: "top-center" });
      for (const key of [HARVEST_KEY, MINE_PENDINGS_KEY, RESOURCES_KEY, ENERGY_KEY]) {
        qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      }
      qc.invalidateQueries({ queryKey: ["acc-balances"], refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => setBusy(false),
  });

  /** Награды карты: боссы, сундуки, рейд — очередь одна. */
  const claim = useMutation({
    mutationFn: () => claimRaidRewards(),
    onSuccess: (res) => {
      // Не только успех: то, что не доехало (полный рюкзак, нет героя), сервер
      // вернул в res.warnings — без этого товар молча оставался в очереди.
      if (res.claimed === 0 && !(res.warnings?.length)) toast.info(t("harvest.no_rewards"), { position: "top-center" });
      else showClaimResult(res, t, t("braid.rewards_claimed"));
      // Всё, что оседает у ГЕРОЯ, — общим списком репо: свой товар падает в
      // рюкзак, артефакты и герои — в my-game-items. Своей копии списка здесь
      // быть не должно (правило «обновление страницы = табу»).
      invalidateHeroQueries(qc, ["my-chip-inventory"]);
      // Ресурс уходит на СЧЁТ, а не к герою, — этот ключ вне общего списка.
      for (const key of [
        HARVEST_KEY,
        ["raid-pending-rewards"],
        ["my-like-balance"],
        ["my-chip-packs"],
        ENERGY_KEY,
        RESOURCES_KEY,
      ]) {
        qc.invalidateQueries({ queryKey: key as string[], refetchType: "all" });
      }
    },
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: () => setBusy(false),
  });

  const rewardCount = data?.rewardCount ?? 0;
  const pending = busy || collect.isPending || claim.isPending || q.isFetching;
  const collectButton = (
    <button data-harvest-collect data-game-button="secondary" type="button" onClick={() => { setBusy(true); collect.mutate(); }}
      disabled={pending || mines.length === 0}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#88847d] bg-[#222528] px-3 py-2.5 text-sm font-semibold text-[#e9e2d5] disabled:opacity-40">
      {collect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
      {t("harvest.collect_all")}
    </button>
  );
  const claimButton = (
    <button data-harvest-claim data-game-button="primary" type="button" onClick={() => { setBusy(true); claim.mutate(); }}
      disabled={pending || rewards.length === 0}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[#ffda7c] bg-gradient-to-b from-[#ffd36b] to-[#dd9419] px-3 py-2.5 text-sm font-bold text-[#211a0e] shadow-[0_5px_15px_#9f650033] disabled:opacity-40">
      {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
      {t("harvest.claim_rewards")}
    </button>
  );

  return (
    <HudModal
      title={t("harvest.title")}
      icon={<img src={pickaxeArt} alt="" className="h-7 w-7 object-contain" />}
      onClose={onClose}
      presentation="centered"
    >
      {q.isPending || (q.isFetching && !q.isError) ? (
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
          <HarvestIncomeStrip mines={mines} fields={fields} now={now} onShowCell={onShowCell} action={collectButton} />

          <section data-harvest-rewards className="rounded-[22px] border border-[#a37e4c]/70 bg-[#141618] p-2.5">
            <button data-game-button="row" type="button" onClick={() => setRewardsOpen((value) => !value)} aria-expanded={rewardsOpen}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-1 text-left text-sm font-semibold text-[#e9e2d5]">
              <span className="flex items-center gap-2"><img src={trophyArt} alt="" className="h-5 w-5 object-contain" />{t("harvest.raid_rewards_n", { n: rewardCount })}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${rewardsOpen ? "" : "-rotate-90"}`} />
            </button>
            {rewardsOpen && <div className="mt-2 space-y-2">
              {rewards.length === 0 ? <p className="rounded-xl border border-white/10 px-3 py-5 text-center text-xs text-muted-foreground">{t("harvest.no_rewards")}</p> : rewards.map((source, index) => (
                <div data-harvest-source key={`${source.source}-${source.place ?? ""}-${index}`} className="overflow-hidden rounded-2xl border border-white/15 bg-black/15">
                  <div className="flex items-center justify-between gap-2 border-b border-white/15 px-3 py-2.5">
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold text-[#f0e8db]" style={{ overflowWrap: "anywhere" }}>{sourceLabel(source.source)}</span>
                    {source.place != null && <span className="shrink-0 rounded-full border border-[#6d512b]/70 bg-[#5d421c]/35 px-2 py-0.5 text-[11px] text-[#f0c35c]">{t("braid.place_n", { n: source.place })}</span>}
                  </div>
                  <div className="divide-y divide-white/10">{source.rewards.map((reward, rewardIndex) => {
                    // Награда билетами выдаётся золотом ×100 (ПРАВИЛА §8.61): спрайт и сумма — золота.
                    const img = reward.kind === "energy" ? "/resources/energy.png"
                      : reward.kind === "likes" ? "/resources/likes.png"
                      : reward.kind === "pack" ? packArt
                      : prizeImage(reward.kind, reward.packId);
                    const { Icon, color } = prizeIcon(reward.kind);
                    return <div data-harvest-drop key={`${reward.kind}:${reward.packId ?? ""}:${rewardIndex}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-[#b6b1aa]">
                        {img ? <img src={img} alt="" className="h-5 w-5 shrink-0 object-contain" /> : <Icon aria-hidden className="h-5 w-5 shrink-0" color={color} strokeWidth={1.7} />}
                        <span className="min-w-0 break-words" style={{ overflowWrap: "anywhere" }}>{label(reward)}</span>
                      </span>
                      <b className="shrink-0 tabular-nums text-[#f4c653]">{reward.kind === "pack" || reward.kind === "item" ? `×${reward.count}` : rewardShownAmount(reward.kind, reward.amount)}</b>
                    </div>;
                  })}</div>
                </div>
              ))}
              {claimButton}
            </div>}
          </section>
        </>
      )}
    </HudModal>
  );
}
