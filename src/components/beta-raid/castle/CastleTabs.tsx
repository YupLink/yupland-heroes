// Переключатель вкладок замка. Отдельным файлом, потому что модалка и без него
// упирается в лимит, а сам переключатель — вещь в себе.
//
// Вкладок две. «Отряд» отсюда убрана (владелец, 27.08): состав снова собирают
// в окне боя с боссом, и держать второе место для той же правки значило бы
// давать игроку два разных «сохранено».
import { Gem, User, Backpack, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// «potions» — раздел карманов алхимии в таверне замка; в рейде вкладки нет.
export type CastleTab = "hero" | "gear" | "backpack" | "potions" | "spells";

const TABS: Array<{ id: CastleTab; icon: typeof User; key: string }> = [
  { id: "hero", icon: User, key: "braid.castle_tab_hero" },
  { id: "gear", icon: Gem, key: "braid.castle_tab_gear" },
  { id: "backpack", icon: Backpack, key: "braid.castle_tab_backpack" },
  // Книга заклинаний принадлежит выбранному герою — поэтому стоит рядом с его
  // снаряжением и рюкзаком, а не отдельным экраном игрока.
  { id: "spells", icon: BookOpen, key: "braid.castle_tab_spells" },
];

export function CastleTabs({ tab, onTab }: { tab: CastleTab; onTab: (t: CastleTab) => void }) {
  const t = useT();
  return (
    <div className="flex shrink-0 gap-1 rounded-2xl border border-border bg-secondary/30 p-1">
      {TABS.map(({ id, icon: Icon, key }) => (
        <button
          key={id}
          onClick={() => onTab(id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-bold transition sm:gap-1.5 sm:px-2 sm:text-xs",
            tab === id ? "bg-gold/15 text-gold" : "text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t(key)}</span>
        </button>
      ))}
    </div>
  );
}
