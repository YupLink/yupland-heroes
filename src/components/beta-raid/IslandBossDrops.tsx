// Награды босса острова обучения — только канон (владелец, 20.10 и 13.11.2026:
// «обновляй все награды боссов на острове обучения в канон оговоренных»): каждому,
// кто бил, — лайки, шанс тренировочного пака, обычного артефакта и золота. Мировые
// награды шаблона (токены, паки, артефакты мест) на острове не выдаются и не видны.
import { Gift } from "lucide-react";
import { ISLAND_DROP } from "@/lib/raid/island/drops";

export function IslandBossDrops({ ru }: { ru: boolean }) {
  const [lo, hi] = ISLAND_DROP.likes;
  const items = ru
    ? [`${lo}–${hi} лайков`, `тренировочный пак — ${ISLAND_DROP.packPct} %`, `обычный артефакт — ${ISLAND_DROP.artPct} %`, `1 золото — ${ISLAND_DROP.goldPct} %`]
    : [`${lo}–${hi} likes`, `training pack — ${ISLAND_DROP.packPct}%`, `common artifact — ${ISLAND_DROP.artPct}%`, `1 gold — ${ISLAND_DROP.goldPct}%`];
  return (
    <div className="rounded-2xl border border-gold/20 bg-card p-4 shadow-card">
      <div className="flex items-center gap-1.5">
        <Gift className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        <span className="text-sm font-semibold">{ru ? "Награда каждому, кто бил" : "Reward for everyone who hit"}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{items.join(" · ")}</p>
    </div>
  );
}
