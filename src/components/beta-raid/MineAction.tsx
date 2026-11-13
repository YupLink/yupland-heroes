// Шахта на карте: чья она, сколько накопила добычи, кнопки «Собрать»/«Захватить».
//
// Пендинг-модель (без крона): захватил → пошёл секундомер, каждый целый час
// капает добыча. Владелец собирает в любой момент — секундомер НЕ сбрасывается,
// учитывается лишь уже собранное. Перехват другим стопает секундомер и досчитает
// прежнему его целые часы. Механика админ-онли. Всё тикает само — F5 не нужен.
//
// Шахты v2 (§8.59, поле v2): режим, запас службы, починка — блоки mine/MineV2*.
// Сломанную или ничью v2 боем и энергией не берут — только «Починить и забрать».
// Остров новичка (v2.island): без режимов, починки своей и охраны; алмаз — «1 в
// день»; выработанная (v2.spent) — «Шахта истощена» без кнопки.
// Гриб любого вида (lib/mushroomKinds): без охраны; вместо захвата — «Забрать в рюкзак»
// (хозяину кнопки нет); созревает (защита на час) — часики с отсчётом всем.
// «Забрать охрану» — цена по запасу службы шахты. Замок шахтёра (§8.123) — MineWardBlock.
import { useMutation } from "@tanstack/react-query";
import { Loader2, Pickaxe, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { captureMine } from "@/server/api/beta-raid/mine-capture";
import { claimMine } from "@/server/api/beta-raid/mine-claim";
import { useResources, type MineResources } from "@/lib/hooks/useResources";
import { livePendingAmount, elapsedClock } from "@/lib/minePending";
import type { MineExtra, MineResource, MineV2View } from "@/lib/mineExtra";
import { MineGuardOwnerBlock } from "./mine/MineGuardOwnerBlock";
import { MineGuardFight } from "./mine/MineGuardFight";
import { MineLifeBar } from "./mine/MineLifeBar";
import { MineBrokenBlock, MineSpentBlock, MineV2OwnerBlock } from "./mine/MineV2Blocks";
import { useMineInvalidate } from "./mine/useMineInvalidate";
import { useMineV2Clock, useSecondTick } from "./mine/useMineV2Clock";
import { DaraiMineTakeBlock } from "./dmine/DaraiMineTakeBlock";
import { MushroomRipeHint } from "./dmine/MushroomRipeHint";
import { isDaraiMineConfig } from "@/lib/daraiMine";
import type { MushroomKind } from "@/lib/mushroomKinds";
import { mineLifeNow, mineV2Of } from "@/lib/mineV2";
import { MineNatureLine } from "./mine/MineNatureLine";
import { MineYieldLine } from "./mine/MineYieldLine";
import { MineWardLocked, MineWardOwner } from "./mine/MineWardBlock";

const OWN_RESOURCES: MineResource[] = ["gold", "stone", "diamonds", "wood"];

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
  v2,
  mushroom = null,
  ripeAt = null,
  wardLeftMs = 0,
  wardEnergy = null,
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
  guardian: MineExtra["guardian"];
  /** Шахта v2 — режим, запас, починка; null — старого образца. */
  v2: MineV2View | null;
  /** Гриб (вид из окна постройки); прежние ответы без поля — по токену DARAI. */
  mushroom?: MushroomKind | null;
  /** Гриб созревает до этой минуты (защита на час, мс) — подпись всем; нет — null. */
  ripeAt?: number | null;
  wardLeftMs?: number;
  wardEnergy?: number | null;
  can: boolean;
  reasonKey: string | null;
  onDone: () => void;
}) {
  const t = useT();
  // Токен — не абстрактное «токен», а конкретный символ монеты, который админ
  // задал у шахты (DARAI, CHEP …). Иначе окно писало «1000000 токен в час», не
  // давая понять, что за токен и стоит ли его собирать.
  const resName = resource === "token" && token ? token : t(`mine.res.${resource}`);
  const showsOwnBalance = OWN_RESOURCES.includes(resource);
  const v2Kind = v2 ? mineV2Of({ resource }) : null;
  const resourcesQ = useResources();
  const ownBalance = showsOwnBalance
    ? (resourcesQ.data?.[resource as keyof MineResources] ?? 0)
    : null;

  // Раз в секунду: живой пендинг, секундомер, у v2 — запас и поломка.
  const v2Clock = useMineV2Clock(q, r, v2);
  const tickNow = useSecondTick(mine === "own" && !!capturedAt && !v2);
  const now = v2 ? v2Clock.now : tickNow;
  const broken = v2Clock.broken;
  // Живой пендинг: сервер дал снимок, но между запросами час может закрыться —
  // считаем сами от секундомера. Не ниже серверного снимка.
  const livePending =
    mine === "own" && !broken
      ? Math.max(
          pending,
          // prettier-ignore
          livePendingAmount(capturedAt, claimedHours, yieldAmount, now, maxHours, v2?.stepHours, v2?.weather),
        )
      : 0;
  const clock = mine === "own" ? elapsedClock(capturedAt) : null;
  const invalidate = useMineInvalidate(q, r);
  const darai = !v2 && (!!mushroom || isDaraiMineConfig({ resource, token }));

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
    // Отказ (замок шахтёра встал, охрана, поломка) — окно перечитать: кнопка сменится.
    onError: (e: Error) => {
      toast.error(humanError(e));
      invalidate();
    },
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
      <MineYieldLine v2={v2} yieldAmount={yieldAmount} resName={resName} />
      {v2Kind && <MineNatureLine kind={v2Kind} n={v2?.nature} />}
      {darai && ripeAt != null && <MushroomRipeHint ripeAt={ripeAt} />}
      {ownBalance !== null && (
        <p className="text-center text-[11px] font-semibold tabular-nums text-amber-200/80">
          {t("mine.you_have", { n: ownBalance, res: resName })}
        </p>
      )}

      {v2 && broken && v2.spent ? (
        <MineSpentBlock />
      ) : v2 && broken ? (
        <MineBrokenBlock q={q} r={r} v2={v2} onDone={onDone} />
      ) : mine === "own" ? (
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

          {v2 && <MineV2OwnerBlock q={q} r={r} v2={v2} now={now} kind={mineV2Of({ resource })} />}
          {!darai && <MineWardOwner q={q} r={r} leftMs={wardLeftMs} energy={wardEnergy} />}
          {/* Охрана: поставить босса или показать поставленного (не остров, не DARAI). */}
          {!v2?.island && !darai && (
            <MineGuardOwnerBlock
              q={q}
              r={r}
              guardian={guardian}
              life={v2 ? mineLifeNow(v2, now) : null}
              onChanged={invalidate}
            />
          )}
        </>
      ) : (
        <>
          <p className="text-center text-[11px] text-muted-foreground">
            {mine === "enemy" ? t("mine.owner_enemy") : t("mine.owner_free")}
          </p>
          {/* Чужая вдали — запас спрятан сервером (mine-life-see.ts). */}
          {v2 && !v2.far && <MineLifeBar v2={v2} now={now} />}
          {/* Жив охранник — сначала бой; захват заблокирован (can=false). */}
          {guardian && <MineGuardFight q={q} r={r} guardian={guardian} onDefeated={invalidate} />}
          {reasonKey && <p className="text-center text-[11px] text-destructive">{t(reasonKey)}</p>}
          {/* Гриб не захватывают — его забирают в рюкзак (lib/daraiMine). */}
          {darai ? (
            <DaraiMineTakeBlock q={q} r={r} cost={captureCost} can={can} onDone={onDone} />
          ) : (
            <MineWardLocked q={q} r={r} leftMs={wardLeftMs}>
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
                {captureCost > 0
                  ? t("mine.capture_for", { n: captureCost })
                  : t("mine.capture_free")}
              </button>
            </MineWardLocked>
          )}
          {mine === "enemy" && !darai && (
            <p className="text-center text-[10px] leading-tight text-muted-foreground">
              {t("mine.reseize_hint")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
