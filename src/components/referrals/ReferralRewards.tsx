// «Ждёт получения» в «Друзьях»: бонус-боксы за вехи и 10 % USDT с подписок
// друзей (владелец, 22.10.2026). Без срока, по кнопке «Забрать». Пусто — блока нет.
import { CircleDollarSign, Gift, Loader2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import type { MyRefReward } from "@/server/api/referral-rewards";
import { useClaimReferralReward, useReferralRewards } from "./useReferralRewards";

const usdtText = (v: number, ru: boolean) =>
  `${v.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 6 })} USDT`;

export function ReferralRewards() {
  const ru = useLang() === "ru";
  const q = useReferralRewards();
  const claim = useClaimReferralReward(ru);
  if (q.isError)
    return (
      <div
        role="alert"
        className="mt-4 rounded-[10px] border border-[#34363f] bg-[#14171c] p-4 text-sm"
      >
        <p>{ru ? "Не удалось загрузить награды за друзей." : "Could not load friend rewards."}</p>
        <button type="button" className="mt-2 min-h-11 underline" onClick={() => void q.refetch()}>
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  const list: MyRefReward[] = [...(q.data?.boxes ?? []), ...(q.data?.usdt ?? [])];
  if (list.length === 0) return null;
  const busyId = claim.isPending ? claim.variables : null;
  return (
    <section
      aria-labelledby="ref-rewards-title"
      className="mt-4 rounded-[10px] border border-gold/40 bg-[#14171c] px-3.5 py-4"
    >
      <h3 id="ref-rewards-title" className="font-display text-base">
        {ru ? "Награды за друзей" : "Friend rewards"} · {list.length}
      </h3>
      <ul className="mt-3 divide-y divide-[#34363f]">
        {list.map((r) => (
          <li key={r.id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#34363f] bg-background">
              {r.kind === "box" && r.packImage ? (
                <img src={thumb(r.packImage, 96)} alt="" className="h-full w-full object-cover" />
              ) : r.kind === "box" ? (
                <Gift aria-hidden="true" className="h-5 w-5 text-gold" />
              ) : (
                <CircleDollarSign aria-hidden="true" className="h-5 w-5 text-gold" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {r.kind === "box" ? r.packName || "Bonus Box" : usdtText(r.amount, ru)}
              </span>
              <span className="block text-xs text-muted-foreground">
                {r.kind === "box"
                  ? ru
                    ? `Этап: ${r.milestone} ${friendsRu(r.milestone ?? 0)}`
                    : `Milestone: ${r.milestone} ${r.milestone === 1 ? "friend" : "friends"}`
                  : ru
                    ? "10 % с подписки друга"
                    : "10% of a friend's subscription"}
              </span>
            </span>
            <button
              type="button"
              data-game-button="primary"
              disabled={claim.isPending}
              onClick={() => claim.mutate(r.id)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full gradient-gold px-4 text-sm font-bold text-gold-foreground shadow-gold disabled:opacity-60"
            >
              {busyId === r.id && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {ru ? "Забрать" : "Claim"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** «1 друг», «3 друга», «5 друзей». */
function friendsRu(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "друг";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "друга";
  return "друзей";
}
