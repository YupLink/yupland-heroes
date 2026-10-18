import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function DropExpiryTimer({
  expiresAt,
  className,
}: {
  expiresAt?: string | null;
  className?: string;
}) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const urgent = ms < 86_400_000;
  const label = urgent
    ? `${String(Math.floor(ms / 3_600_000)).padStart(2, "0")}:${String(
        Math.floor((ms % 3_600_000) / 60_000)
      ).padStart(2, "0")}`
    : `${Math.floor(ms / 86_400_000)} ${t("mynfts.drop_days_short")}`;
  return (
    <span
      title={t("mynfts.drop_expires_in")}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        urgent
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-secondary/40 text-muted-foreground",
        className
      )}
    >
      <Timer className="h-2.5 w-2.5" /> {label}
    </span>
  );
}
