// Шахта на карте: чья она, сколько накопила добычи, кнопки «Собрать»/«Захватить».
//
// Пендинг-модель (без крона): захватил → пошёл секундомер, каждый целый час
// капает добыча. Владелец собирает в любой момент — секундомер НЕ сбрасывается,
// учитывается лишь уже собранное. Перехват другим стопает секундомер и досчитает
// прежнему его целые часы. Механика админ-онли. Всё тикает само — F5 не нужен.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pickaxe, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { captureMine } from "@/server/api/beta-raid/mine-capture";
import { claimMine } from "@/server/api/beta-raid/mine-claim";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY, useResources, type MineResources } from "@/lib/hooks/useResources";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { HARVEST_KEY } from "./hud/useHarvest";
import { livePendingAmount, elapsedClock } from "@/lib/minePending";
import type { MineResource } from "@/lib/buildingEffect";
import { MineGuardOwnerBlock } from "./mine/MineGuardOwnerBlock";
import { MineGuardFight } from "./mine/MineGuardFight";

/** Босс-охранник шахты, если жив (тип из mineExtra). */
type Guardian = {
  templateId: string;
  name: string;
  image: string | null;
  background: string | null;
  maxHp: number;
  currentHp: number;
  damage: string | null;
  abilities: Array<{
    kind: string;
    chance: number;
    value: string | number;
    duration: string | number;
  }>;
} | null;

const OWN_RESOURCES: MineResource[] = ["gold", "stone", "diamonds", "wood"];

/** Раз в секунду пересчитывает живой пендинг и часы секундомера. */
function useTick(active: boolean): number {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return 0;
}

export function MineAction({
  q,
  r,
  resource,
  token,
  yieldAmount,
  captureCost,
  mine,
  capturedAt,
  claimedHours,
  maxHours,
  pending,
  guardian,
  can,
  reasonKey,
  onDone,
}: {
  q: number;
  r: number;
  resource: MineResource;
  /** Символ токена, если добывается монета (resource='token'). */
  token: string | null;
  yieldAmount: number;
  captureCost: number;
  mine: "own" | "enemy" | "free";
  capturedAt: number | null;
  claimedHours: number;
  /** Предел часов добычи (лесопилка острова — неделя). */
  maxHours?: number | null;
  pending: number;
  guardian: Guardian;
  can: boolean;
  reasonKey: string | null;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  // Токен — не абстрактное «токен», а конкретный символ монеты, который админ
  // задал у шахты (DARAI, CHEP …). Иначе окно писало «1000000 токен в час», не
  // давая понять, что за токен и стоит ли его собирать.
  const resName = resource === "token" && token ? token : t(`mine.res.${resource}`);
  const showsOwnBalance = OWN_RESOURCES.includes(resource);
  const resourcesQ = useResources();
  const ownBalance = showsOwnBalance
    ? (resourcesQ.data?.[resource as keyof MineResources] ?? 0)
    : null;

  useTick(mine === "own" && !!capturedAt);
  // Живой пендинг: сервер дал снимок, но между запросами час может закрыться —
  // считаем сами от секундомера. Не ниже серверного снимка.
  const livePending =
    mine === "own"
      ? Math.max(
          pending,
          livePendingAmount(capturedAt, claimedHours, yieldAmount, Date.now(), maxHours),
        )
      : 0;
  const clock = mine === "own" ? elapsedClock(capturedAt) : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    qc.invalidateQueries({ queryKey: ENERGY_KEY });
    // Захват стоит герою сытости — шкала в состоянии карты.
    qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
    qc.invalidateQueries({ queryKey: RESOURCES_KEY });
    qc.invalidateQueries({ queryKey: MINE_PENDINGS_KEY });
    // Захват сменил владельца — флажок над шахтой перекрасить сразу, без F5.
    qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
    // Новая шахта захватчика и цифра на кружке «Добыча» — тоже сразу, а не
    // через 60–120 с опроса (окно и бейдж живут на HARVEST_KEY).
    qc.invalidateQueries({ queryKey: HARVEST_KEY });
    // Охранник мог смениться/погибнуть — оверлей босса над шахтой обновить.
    qc.invalidateQueries({ queryKey: ["beta-raid-mine-guards"] });
  };

  const capture = useMutation({
    mutationFn: () => captureMine({ data: { q, r } }),
    onSuccess: (res) => {
      toast.success(
        res.captureCost > 0
          ? t("mine.captured_toast_cost", { n: res.captureCost })
          : t("mine.captured_toast"),
      );
      invalidate();
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const claim = useMutation({
    mutationFn: () => claimMine({ data: { q, r } }),
    onSuccess: (res) => {
      toast.success(
        res.amount > 0
          ? t("mine.collected_toast", { n: res.amount, res: resName })
          : t("mine.nothing_yet"),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-1.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="text-center text-sm">
        <b className="text-amber-300">{t("mine.mines_res", { res: resName })}</b>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        {t("mine.yield_per_hour", { n: yieldAmount, res: resName })}
      </p>
      {ownBalance !== null && (
        <p className="text-center text-[11px] font-semibold tabular-nums text-amber-200/80">
          {t("mine.you_have", { n: ownBalance, res: resName })}
        </p>
      )}

      {mine === "own" ? (
        <>
          <p className="text-center text-sm font-semibold tabular-nums text-emerald-300">
            {t("mine.working")}
            {clock && <> · {clock}</>}
          </p>
          <button
            type="button"
            onClick={() => claim.mutate()}
            disabled={claim.isPending || livePending <= 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {claim.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HandCoins className="h-4 w-4" />
            )}
            {livePending > 0
              ? t("mine.collect_for", { n: livePending, res: resName })
              : t("mine.nothing_yet")}
          </button>

          {/* Охрана: поставить босса из рюкзака или показать поставленного. */}
          <MineGuardOwnerBlock q={q} r={r} guardian={guardian} onChanged={invalidate} />
        </>
      ) : (
        <>
          <p className="text-center text-[11px] text-muted-foreground">
            {mine === "enemy" ? t("mine.owner_enemy") : t("mine.owner_free")}
          </p>
          {/* Жив охранник — сначала бой; захват заблокирован (can=false). */}
          {guardian && <MineGuardFight q={q} r={r} guardian={guardian} onDefeated={invalidate} />}
          {reasonKey && <p className="text-center text-[11px] text-destructive">{t(reasonKey)}</p>}
          <button
            type="button"
            onClick={() => capture.mutate()}
            disabled={capture.isPending || !can}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {capture.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pickaxe className="h-4 w-4" />
            )}
            {captureCost > 0 ? t("mine.capture_for", { n: captureCost }) : t("mine.capture_free")}
          </button>
          {mine === "enemy" && (
            <p className="text-center text-[10px] leading-tight text-muted-foreground">
              {t("mine.reseize_hint")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
