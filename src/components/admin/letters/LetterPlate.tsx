// Плашка письма в админке: заголовок, кому, сколько прочитали, до какого
// момента показывается (по UTC, как расписание турниров), начало текста;
// «Изменить» и «Выключить»/«Включить».
import { Loader2, Mail, Pencil, Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { resolveImage, thumb } from "@/lib/image";
import { isOnlyMe, type LetterAdminRow } from "@/lib/letters";
import { fmtUtc } from "@/components/admin/tournaments/tourText";

const BTN =
  "inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-xs font-medium disabled:opacity-50";

export function LetterPlate({
  row,
  me,
  busy,
  onEdit,
  onToggle,
}: {
  row: LetterAdminRow;
  /** Аккаунт текущего админа — узнать «Только мне». */
  me: string;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const to = isOnlyMe(row, me)
    ? t("letter.adm.to_me")
    : row.audience === "all"
      ? t("letter.adm.to_all")
      : t("letter.adm.aud_list", { n: row.accounts.length });
  const date = row.createdAt
    ? new Date(row.createdAt).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const img = row.image ? thumb(resolveImage(row.image), 96) : "";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-border bg-card p-3",
        !row.active && "opacity-60",
      )}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <Mail className="h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <span className="min-w-0 flex-1 break-words font-semibold leading-snug">{row.title}</span>
          {!row.active && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {t("letter.adm.off")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="text-gold">{to}</span> · {t("letter.adm.seen", { n: row.seen })}
          {date && ` · ${date}`}
          {row.showUntil && ` · ${t("letter.adm.until", { d: fmtUtc(row.showUntil, lang) })}`}
        </p>
        <p className="line-clamp-2 whitespace-pre-line break-words text-xs text-foreground/80">
          {row.body}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button type="button" onClick={onEdit} disabled={busy} className={BTN}>
            <Pencil className="h-3.5 w-3.5" /> {t("letter.adm.edit")}
          </button>
          <button type="button" onClick={onToggle} disabled={busy} className={BTN}>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
            {row.active ? t("letter.adm.turn_off") : t("letter.adm.turn_on")}
          </button>
        </div>
      </div>
    </div>
  );
}
