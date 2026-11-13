// Созданный артефакт: картинка, имя, что выпало. Пока рисуется — крутилка;
// «не вышло» — повтор (бросок прежний, рисуется заново).
import { ImageOff, Loader2, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { LabJob } from "@/server/api/craft/lab-sql";
import { useLabLabels } from "./labLabels";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function LabJobCard({
  job,
  onRetry,
  retrying,
}: {
  job: LabJob;
  onRetry: () => void;
  retrying: boolean;
}) {
  const t = useT();
  const L = useLabLabels();
  const r = job.roll;
  // Заказ в Horde рисуется — это «рисуется», а не «генератор занят».
  const waiting = job.status === "queued" && !job.ext && Date.parse(job.nextAt) > Date.now();
  const stats = [
    `${L.meta(r.statType)} +${r.statAmount}`,
    r.race && `${L.race(r.race)} +${r.raceAmount}`,
    r.spec && `${L.meta(r.spec)} +${r.specAmount}`,
    r.land && `${L.meta(r.land)} +${r.landAmount}`,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-3">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center">
        {job.status === "done" && job.imageUrl ? (
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
        <div className="truncate font-medium">{job.name}</div>
        <div className="text-xs text-muted-foreground">
          {L.meta(job.rarity)} · {stats.join(" · ")}
        </div>
        {job.status === "queued" && (
          <div className="text-xs text-gold">
            {waiting ? t("lab.busy", { time: hhmm(job.nextAt) }) : t("lab.drawing")}
          </div>
        )}
        {job.status === "failed" && (
          <button
            type="button"
            disabled={retrying}
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs text-gold disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("lab.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
