import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";

export function Header({
  title,
  subtitle,
  badge,
  onBack,
  onClose,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const back = onBack ?? onClose;
  return (
    <div className="space-y-1">
      {back && (
        <button
          onClick={back}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("raid.back")}
        </button>
      )}
      <div className="flex items-center gap-2">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {badge}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center py-16">{children}</div>;
}
