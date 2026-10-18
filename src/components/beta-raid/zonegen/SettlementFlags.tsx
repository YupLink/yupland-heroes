// Ручка поселения, которую владелец 22.09.2026 попросил объяснить словами:
// «что означает ставить достроенными?».
//
// Ответ стоит под самой галочкой, а не в чьей-то голове: подпись из одной
// строки дешевле, чем переписка про каждую настройку.
import { useT } from "@/lib/i18n";

const HINT = "pl-4 text-[9px] leading-tight text-muted-foreground/80";

export function SettlementFlags({
  built,
  onBuilt,
}: {
  built: boolean;
  onBuilt: (v: boolean) => void;
}) {
  const t = useT();
  return (
    <div>
      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <input
          type="checkbox"
          checked={built}
          onChange={(e) => onBuilt(e.target.checked)}
          className="accent-gold"
        />
        {t("zonegen.set_built")}
      </label>
      <p className={HINT}>{t("zonegen.set_built_hint")}</p>
    </div>
  );
}
