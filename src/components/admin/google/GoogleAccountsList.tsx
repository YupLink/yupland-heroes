// Список Google-аккаунтов в админке: почта, когда и кем создан, сколько разных
// устройств, слепков браузера и адресов сети, последний вход.
import { useLang, useT } from "@/lib/i18n";

export type GoogleAccountView = {
  email: string | null;
  createdAt: string;
  createdBy: string | null;
  devices: number;
  fps: number;
  ips: number;
  lastAt: string | null;
};

function when(iso: string | null, lang: "ru" | "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GoogleAccountsList({ accounts }: { accounts: GoogleAccountView[] }) {
  const t = useT();
  const lang = useLang();
  if (accounts.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("google.empty")}</p>;
  }
  const th = "px-2 py-1.5 text-left font-medium";
  const num = "px-2 py-1.5 text-right tabular-nums";
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className={th}>{t("google.col_email")}</th>
            <th className={th}>{t("google.col_created")}</th>
            <th className={th}>{t("google.col_by")}</th>
            <th className={`${th} text-right`}>{t("google.col_devices")}</th>
            <th className={`${th} text-right`}>{t("google.col_fps")}</th>
            <th className={`${th} text-right`}>{t("google.col_ips")}</th>
            <th className={th}>{t("google.col_last")}</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={`${a.email ?? ""}:${a.createdAt}`} className="border-b border-border/60">
              <td className="max-w-[220px] truncate px-2 py-1.5">{a.email ?? "—"}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{when(a.createdAt, lang)}</td>
              <td className="max-w-[160px] truncate px-2 py-1.5">{a.createdBy ?? "—"}</td>
              <td className={num}>{a.devices}</td>
              <td className={num}>{a.fps}</td>
              <td className={num}>{a.ips}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{when(a.lastAt, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
