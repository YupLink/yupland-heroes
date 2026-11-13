// Очередь наград в окне «Добыча»: по ТИПАМ с кнопкой у каждой группы.
//
// Раньше список шёл по целям («Зимний Йети — лайки 25, Хлеб 2»), а кнопка
// была одна на всё: в полный рюкзак влезало «что попало», а нужный товар
// оставался лежать. Теперь наверху — группы «один и тот же предмет / ресурс
// / токен / пак» с суммой и числом наград, и у каждой своя «Забрать»; разбивка
// по целям осталась ниже, свёрнутой.
//
// 47 групп у одного аккаунта — просто прокрутка тела окна (HudModal): тело
// само `overflow-y-auto` с запасом под нижнюю панель телефона. У награды со
// сроком (добыча разграбленного сундука, 24 ч) виден остаток до сгорания.
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatQty } from "@/lib/formatQty";
import { thumb } from "@/lib/image";
import { prizeIcon, prizeImage } from "@/lib/prizeIcon";
import { rewardKindLabelKey, rewardShownAmount } from "@/lib/rewardKinds";
import { groupPendingRewards, isPieceKind, isTokenKind, rewardGroupKey } from "@/lib/rewardGroup";
import type { PendingSource, PendingReward } from "@/server/api/raid-rewards-pending";
import { HarvestSection } from "./HarvestSection";
import { RewardTimer } from "./RewardTimer";
import { useRewardClock } from "./useRewardClock";
import type { GroupClaimVars } from "./useRewardClaim";

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

/** Штучное — «×N», меру и дробный товар — суммой (formatQty: без 0.7899999). Билеты — золотом ×100. */
const qty = (r: PendingReward): string =>
  isPieceKind(r.kind) ? `×${r.count}` : formatQty(rewardShownAmount(r.kind, r.amount));

/**
 * Картинка справочника, спрайт ресурса или lucide-иконка вида — что есть.
 * Загруженные картинки идут через ресайз-прокси, как ячейки рюкзака: исходник
 * товара бывает PNG на мегабайты, а тут иконка в 36 px.
 */
function RewardIcon({ r }: { r: PendingReward }) {
  const img = r.image ? thumb(r.image, 72, "black") : prizeImage(r.kind, r.packId);
  if (img) return <img src={img} alt="" className="h-full w-full object-contain" />;
  const { Icon, color } = prizeIcon(r.kind);
  return <Icon className="h-4 w-4" style={{ color }} />;
}

export function HarvestRewards({
  sources,
  count,
  pending,
  busyKey,
  onClaimGroup,
}: {
  /** Очередь по целям — как отдаёт сервер; группы по типам считаем здесь. */
  sources: PendingSource[];
  count: number;
  /** Любой клейм в полёте: все кнопки заперты (двойной тап, гонка двух групп). */
  pending: boolean;
  /** Ключ группы, чья кнопка крутится. */
  busyKey: string | null;
  onClaimGroup: (v: GroupClaimVars) => void;
}) {
  const t = useT();
  const now = useRewardClock();
  /**
   * Подпись награды. Своему товару и артефакту имя даёт сервер («Пшеница»),
   * ресурсу — словарь по коду из pack_id, остальному — старая таблица ключей.
   * Без этого в списке стояло сырое «resource» и «custom».
   */
  const label = (r: PendingReward): string => {
    if (r.name) return r.name;
    const key = rewardKindLabelKey(r.kind, r.packId) ?? KIND_KEY[r.kind];
    return key ? t(key) : r.kind;
  };
  const byType = groupPendingRewards(sources);

  return (
    <>
      <HarvestSection title={t("harvest.rewards_n", { n: count })} count={count}>
        {byType.length === 0 ? (
          <p className="text-center text-[11px] text-muted-foreground">{t("harvest.no_rewards")}</p>
        ) : (
          <div className="space-y-1.5">
            {byType.map((r) => {
              const key = rewardGroupKey(r.kind, r.packId);
              return (
                <div
                  key={key}
                  className="flex items-center gap-2.5 rounded-xl border border-border p-2.5"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/40">
                    <RewardIcon r={r} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {label(r)} <span className="tabular-nums text-gold">{qty(r)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {t("harvest.group_rewards_n", { n: r.count })}
                        {isTokenKind(r.kind) && ` · ${t("harvest.token_to_payouts")}`}
                      </span>
                      <RewardTimer expiresAt={r.expiresAt} now={now} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onClaimGroup({ kind: r.kind, packId: r.packId, label: label(r) })
                    }
                    disabled={pending}
                    className="shrink-0 rounded-xl border border-gold/50 px-3 py-1.5 text-[11px] font-bold text-gold disabled:opacity-40"
                  >
                    {busyKey === key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      t("braid.claim")
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </HarvestSection>

      {/* За кого что — прежний вид, свёрнут: сюда заглядывают реже, чем жмут
          «Забрать» у группы. */}
      {sources.length > 0 && (
        <HarvestSection
          title={t("harvest.by_source_n", { n: sources.length })}
          count={sources.length}
          defaultOpen={false}
        >
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.source} className="rounded-xl border border-border">
                <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
                  <span className="truncate text-sm font-semibold">{s.source}</span>
                  {s.place != null && (
                    <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                      {t("braid.place_n", { n: s.place })}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {s.rewards.map((r) => (
                    <div
                      key={rewardGroupKey(r.kind, r.packId)}
                      className="flex items-center justify-between gap-2 p-2.5 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span className="grid h-4 w-4 shrink-0 place-items-center">
                          <RewardIcon r={r} />
                        </span>
                        <span className="truncate">{label(r)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                        <RewardTimer expiresAt={r.expiresAt} now={now} />
                        <b className="text-sm tabular-nums text-gold">{qty(r)}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </HarvestSection>
      )}
    </>
  );
}
