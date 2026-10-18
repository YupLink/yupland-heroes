// Выключатель «Уведомления в игре»: глушит только информационные тосты игры
// (gameInfoToast — HP цели, побег беглеца, размер награды). Ошибки и ответы на
// действия игрока он не трогает. Вся строка — подпись выключателя, чтобы на
// телефоне не целиться пальцем в узкий бегунок.
import { Switch } from "@/components/ui/switch";
import { useGameNotify } from "@/lib/hooks/useGameNotify";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function GameNotifySwitch({ className }: { className?: string }) {
  const t = useT();
  const [on, setOn] = useGameNotify();
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-between gap-3 text-xs",
        className,
      )}
    >
      {t("header.game_notifs")}
      <Switch
        checked={on}
        onCheckedChange={setOn}
        className="data-[state=unchecked]:bg-muted-foreground/40"
      />
    </label>
  );
}
