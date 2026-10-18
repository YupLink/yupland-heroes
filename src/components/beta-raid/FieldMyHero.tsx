// Какой именно из МОИХ героев батрачит на этой грядке — портрет, имя, уровень.
//
// Одного имени мало: копий одного героя у игрока бывает несколько (две «Brim —
// Dented Shield» на двух грядках), и различает их уровень. Портрет и уровень
// берём из окна поля (там уже есть список героев), а издалека, когда окно поля
// молчит, — из общего списка «мои герои».
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { listMyHeroes } from "@/server/api/heroes-read";

type Pic = { id: string | null; imageUrl: string | null; rarity: string; level: number };

/** Рамка редкости — цвета те же, что у плиток героев (heroLabels.RARITY_COLOR). */
const RING: Record<string, string> = {
  common: "ring-[#9ca3af]",
  rare: "ring-[#5b9bff]",
  epic: "ring-[#b46bff]",
  legendary: "ring-[#f5c451]",
};

export function FieldMyHero({
  hero,
  known = [],
  action,
}: {
  hero: { id: string; name: string };
  /** Герои из окна поля: портрет и уровень уже в руках — лишний запрос не нужен. */
  known?: Pic[];
  action?: ReactNode;
}) {
  const t = useT();
  const local = known.find((h) => h.id === hero.id) ?? null;
  const mine = useQuery({
    queryKey: ["my-heroes"],
    queryFn: () => listMyHeroes(),
    enabled: !local && !!hero.id,
    staleTime: 30_000,
  });
  const list = Array.isArray(mine.data) ? mine.data : [];
  const pic: Pic | null = local ?? list.find((h) => h.id === hero.id) ?? null;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-secondary/40 ring-2",
          RING[pic?.rarity ?? ""] ?? "ring-[#9aa4bd]",
        )}
      >
        {pic?.imageUrl && (
          <img
            src={thumb(pic.imageUrl, 80, "black")}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs">{t("braid.field_my_hero", { hero: hero.name })}</div>
        {pic && (
          <div className="text-[10px] text-muted-foreground">
            {t("braid.field_lvl", { n: pic.level })}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
