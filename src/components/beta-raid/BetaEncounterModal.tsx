import { useRememberedLineup } from "./useRememberedLineup";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sword, Swords, X, Zap } from "lucide-react";
import { getBetaRaidEncounter } from "@/server/api/beta-raid/encounter-peek";
import { BossVault } from "@/components/raid/BossVault";
import { BossRewardPool } from "@/components/raid/RaidRewards";
import { ChipSquadPicker, type LineChip } from "@/components/game/ChipSquadPicker";
import { BetaAbilityBadges } from "./BetaAbilityBadges";
import { BetaEncounterTop } from "./BetaEncounterTop";
import { serverBadgeLabel } from "./objectKind";
import { useLang, useT } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import type { RewardCfg } from "@/components/raid/raid-screen-types";

/**
 * Окно энкаунтера бета-рейда — то же, что у босса в обычном рейде.
 * Босс, сундук и шахта проходят здесь одинаково: меняются подпись на бейдже,
 * название и картинка, всё остальное (HP, отряд, пул наград) — общее.
 *
 * Состав на КАЖДЫЙ бой собирается здесь же, героем это не отменяется: замок
 * помнит отряд, но не запирает выбор. Занятые фишки (оглушение босса, отдых
 * после передачи) пикер по-прежнему держит серыми и в бой не пускает.
 */
export function BetaEncounterModal({
  objectId,
  q,
  r,
  energy,
  fighting,
  onAttack,
  onClose,
}: {
  objectId: string;
  q: number;
  r: number;
  energy: number;
  fighting: boolean;
  onAttack: (lineup: LineChip[]) => void;
  onClose: () => void;
}) {
  const [lineup, setLineup] = useRememberedLineup();
  const canFight = lineup.length > 0;
  const t = useT();
  const lang = useLang();
  const locale = lang === "en" ? "en-US" : "ru-RU";

  const enc = useQuery({
    queryKey: ["beta-encounter", objectId, q, r],
    queryFn: () => getBetaRaidEncounter({ data: { objectId, q, r } }),
    staleTime: 5_000,
    // Закрытую карточку сутки не держим, ушедшую цель не переспрашиваем.
    gcTime: 60_000,
    retry: (n, e) => n < 1 && !/Объект не найден/.test(e instanceof Error ? e.message : ""),
  });

  const data = enc.data;
  const cost = data?.interactionCost ?? 10;
  const alive = !!data && !data.killed && data.currentHp > 0;
  const notEnoughEnergy = energy < cost;

  // Подпись типа: дефолтную («Босс») переводим, авторскую из meta оставляем.
  const badge = data ? serverBadgeLabel(data.kind, data.badgeLabel, t) : t("braid.object");

  const actionLabel = (() => {
    if (fighting) return t("braid.fighting");
    if (!alive) return t("braid.already_looted");
    if (notEnoughEnergy) return t("braid.need_energy", { n: cost });
    if (!canFight) return t("braid.build_squad");
    return data?.kind === "boss" ? t("braid.attack") : t("braid.act_crack");
  })();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[92vh] sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {badge}
            </div>
            <h3 className="truncate font-display text-lg font-bold">
              {data?.name ? localizeAssetName(data.name, lang) : t("braid.loading")}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {enc.isLoading || !data ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-3">
            <BossVault
              boss={{
                name: localizeAssetName(data.name, lang),
                imageUrl: data.imageUrl,
                backgroundUrl: data.backgroundUrl,
                badgeLabel: badge,
                maxHp: data.maxHp,
                currentHp: data.currentHp,
              }}
              isFinal={false}
              alive={alive}
              locationBg={data.backgroundUrl}
              badgeTone={data.kind === "boss" ? "boss" : "loot"}
            />

            {/* Урон босса за удар — отдельной заметной строкой, значком меча
                (канон урона). Фикс — одним числом, иначе диапазон. */}
            {data.damage && (
              <div className="flex items-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-2.5">
                <Sword className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-sm font-semibold text-muted-foreground">
                  {t("braid.damage_per_hit")}
                </span>
                <span className="ml-auto font-display text-base font-bold tabular-nums text-destructive">
                  {data.damage.min === data.damage.max
                    ? data.damage.min.toLocaleString(locale)
                    : `${data.damage.min.toLocaleString(locale)}–${data.damage.max.toLocaleString(locale)}`}
                </span>
              </div>
            )}

            <BetaAbilityBadges abilities={data.abilities ?? []} />

            {data.rewardConfig && (
              <BossRewardPool
                cfg={data.rewardConfig as unknown as RewardCfg}
                title={t("braid.rewards_for", { kind: badge.toLowerCase() })}
              />
            )}

            {/* Награда делится по местам — сразу показываем, кто где. */}
            <BetaEncounterTop objectId={objectId} q={q} r={r} />

            {alive && (
              <>
                <ChipSquadPicker lineup={lineup} setLineup={setLineup} allowTraining />
                <button
                  onClick={() => onAttack(lineup)}
                  disabled={fighting || notEnoughEnergy || !canFight}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3.5 font-bold text-gold-foreground shadow-gold transition enabled:hover:scale-[1.01] enabled:active:scale-[0.99] disabled:opacity-50"
                >
                  {fighting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Swords className="h-5 w-5" />
                  )}
                  {actionLabel}
                  {alive && !fighting && !notEnoughEnergy && canFight && (
                    <span className="inline-flex items-center gap-0.5 text-sm font-semibold opacity-80">
                      <Zap className="h-3.5 w-3.5" />
                      {cost}
                    </span>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
