// Возможные мультиаккаунты (владелец, 06.11.2026: «отслеживание мультиков»): разные
// аккаунты Google и входа по кошельку с одного устройства, браузера+адреса или адреса.
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";

export type GoogleGroupView = { by: "device" | "fp" | "ip"; who: string[] };

export function GoogleGroups({ groups }: { groups: GoogleGroupView[] }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("google.groups")}</h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("google.no_groups")}</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g, i) => (
            <li key={`${g.by}-${i}`} className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                {t(`walletLogin.by_${g.by}`)} · {g.who.length}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{g.who.join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
