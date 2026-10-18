// Настройки в меню шапки: язык и «Уведомления в игре». Вынесено из AppHeader —
// тот давно за лимитом §13.1, и новый выключатель в нём только нарастил бы его.
import { DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LangSwitch } from "@/components/LangSwitch";
import { GameNotifySwitch } from "@/components/GameNotifySwitch";
import { useT } from "@/lib/i18n";

export function HeaderPrefs() {
  const t = useT();
  return (
    <>
      <DropdownMenuLabel className="px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("header.language")}
      </DropdownMenuLabel>
      <LangSwitch className="px-3 pb-2" />
      <DropdownMenuSeparator />
      <GameNotifySwitch className="px-3" />
    </>
  );
}
