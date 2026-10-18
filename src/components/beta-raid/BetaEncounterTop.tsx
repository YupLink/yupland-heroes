// Кто сколько выбил из этой цели — таблица мест прямо в окне боя.
//
// Награда делится по местам, поэтому расклад нужен ДО того, как игрок
// потратит энергию: раньше строчка «по местам» стояла без единой цифры.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { prizeIcon, prizeImage } from "@/lib/prizeIcon";
import { prizeFallbackKey, rewardKindLabelKey } from "@/lib/rewardKinds";
import { shortAmount } from "@/lib/rewardByPlace";
import { getEncounterTop } from "@/server/api/beta-raid";

const shortWallet = (w: string): string => (w.length > 16 ? `${w.slice(0, 7)}…${w.slice(-4)}` : w);

function PrizeRow({ prize, t }: { prize: unknown; t: (key: string) => string }) {
  // Ответ сервера кэшируется у игрока на сутки (persistQueryClient). После
  // выката, где приз стал массивом вместо строки, в кэше лежал старый формат
  // — и `.map` на строке ронял весь экран («e.map is not a function»).
  // Поэтому здесь не доверяем форме данных, а проверяем её.
  const list = Array.isArray(prize)
    ? (prize as Array<{ kind: string; amount: number; name?: string }>)
    : [];
  if (list.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {list.map((p, i) => {
        const { Icon, color } = prizeIcon(p.kind);
        // У ресурса свой спрайт и своя подпись: «gold» игроку ничего не значит.
        const img = prizeImage(p.kind);
        const key = rewardKindLabelKey(p.kind);
        // Пак, предмет и свой товар подписываются ИМЕНЕМ. Справочник мог его не
        // дать (пак снят с тиража, товар удалён) — тогда берём вид словами из
        // своего словаря: раньше запас приезжал с сервера всегда по-русски.
        const fbKey = prizeFallbackKey(p.kind);
        const named = p.name ?? (fbKey ? t(fbKey) : null);
        return (
          <span
            key={`${p.kind}-${i}`}
            className="inline-flex items-center gap-0.5 text-[11px] tabular-nums"
            style={{ color }}
            title={named ?? (key ? t(key) : p.kind)}
          >
            {img ? (
              <img src={img} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
            ) : (
              <Icon className="h-3 w-3 shrink-0" />
            )}
            {named ? <span className="max-w-[7rem] truncate">{named}</span> : shortAmount(p.amount)}
          </span>
        );
      })}
    </span>
  );
}

export function BetaEncounterTop({ objectId, q, r }: { objectId: string; q: number; r: number }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const locale = useLang() === "en" ? "en-US" : "ru-RU";
  const topQ = useQuery({
    queryKey: ["beta-encounter-top", objectId, q, r],
    queryFn: () => getEncounterTop({ data: { objectId, q, r } }),
    refetchInterval: open ? 30_000 : false,
  });

  const rows = topQ.data?.rows ?? [];
  const myRank = topQ.data?.myRank ?? null;
  const total = topQ.data?.total ?? 0;
  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Trophy className="h-4 w-4 shrink-0 text-gold" />
        <span className="text-sm font-semibold">{t("braid.places_by_damage")}</span>
        <span className="text-xs text-muted-foreground">{total}</span>
        {myRank != null && (
          <span className="ml-auto inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-bold tabular-nums text-gold">
            {t("braid.you_rank", { n: myRank })}
          </span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="max-h-72 overflow-y-auto overscroll-contain border-t border-border px-3 py-1.5">
          {rows.map((p) => (
            <div
              key={p.place}
              className={cn(
                "flex items-baseline gap-2 py-1 text-xs",
                p.isMe && "font-bold text-gold",
              )}
            >
              <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{p.place}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {"name" in p && p.name ? p.name : shortWallet(p.wallet)}
                </span>
                {/* Что достанется этому месту — считает сервер по тем же долям. */}
                <PrizeRow prize={p.prize} t={t} />
              </span>
              <span className="shrink-0 tabular-nums">{p.damage.toLocaleString(locale)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
