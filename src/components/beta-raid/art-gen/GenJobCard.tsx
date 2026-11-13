// Мой заказ генератора (§8.122): картинка, имя, что выпало, статус. Готовый —
// «Уникальный» или кнопка «Сделать уникальным» (пока копия никому не выпала).
import { BadgeCheck, ImageOff, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PortalPrice } from "@/lib/portal";
import type { GenJobView } from "@/server/api/art-gen/art-gen-view";
import { useLabLabels } from "@/components/admin/lab/labLabels";
import { priceText } from "@/components/beta-raid/portalPriceText";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function GenJobCard({
  job,
  uniquePrice,
  busy,
  onUnique,
}: {
  job: GenJobView;
  uniquePrice: PortalPrice[];
  busy: boolean;
  onUnique: () => void;
}) {
  const t = useT();
  const L = useLabLabels();
  const r = job.roll;
  const stats = [
    `${L.meta(r.statType)} +${r.statAmount}`,
    r.race && `${L.race(r.race)} +${r.raceAmount}`,
    r.spec && `${L.meta(r.spec)} +${r.specAmount}`,
    r.land && `${L.meta(r.land)} +${r.landAmount}`,
  ].filter(Boolean);
  const waiting = job.status === "queued" && Date.parse(job.nextAt) > Date.now();
  const done = job.status === "done";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center">
        {done && job.imageUrl ? (
          <img
            src={job.imageUrl}
            alt={job.name}
            className="h-full w-full object-contain [image-rendering:pixelated]"
          />
        ) : job.status === "failed" ? (
          <ImageOff className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1 truncate font-medium">
          <span className="truncate">{job.name}</span>
          {job.unique && (
            <BadgeCheck className="h-4 w-4 shrink-0 text-gold" aria-label={t("artgen.unique")} />
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {L.meta(job.rarity)} · {stats.join(" · ")}
        </div>
        {job.status === "paying" && <div className="text-xs text-gold">{t("artgen.paying")}</div>}
        {job.status === "queued" && (
          <div className="text-xs text-gold">
            {waiting ? t("lab.busy", { time: hhmm(job.nextAt) }) : t("lab.drawing")}
          </div>
        )}
        {job.status === "failed" && (
          <div className="text-xs text-muted-foreground">{t("artgen.failed")}</div>
        )}
        {done && job.unique && (
          <div className="text-xs font-bold text-gold">{t("artgen.unique")}</div>
        )}
        {done && !job.unique && job.copied && (
          <div className="text-xs text-muted-foreground">{t("artgen.copied")}</div>
        )}
        {done && !job.unique && !job.copied && job.owned && uniquePrice.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={onUnique}
            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-gold/50 px-2 py-1 text-xs font-semibold text-gold disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BadgeCheck className="h-3.5 w-3.5" />
            )}
            {t("artgen.make_unique", { price: priceText(uniquePrice, t) })}
          </button>
        )}
      </div>
    </div>
  );
}
