// Роадмап проекта — баги, идеи и задачи в одном месте.
// Данные лежат в src/lib/roadmap.ts (не в БД), чтобы список не терялся
// между разговорами и редактировался прямо в коде.

import { createFileRoute } from "@tanstack/react-router";
import { Milestone, Bug, Lightbulb, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  roadmapItems,
  type RoadmapCategory,
  type RoadmapItem,
  type RoadmapStatus,
} from "@/lib/roadmap";

export const Route = createFileRoute("/admin/roadmap")({
  head: () => ({
    meta: [{ title: "Роадмап — YupLink" }, { name: "robots", content: "noindex" }],
  }),
  component: RoadmapPage,
});

const SECTIONS: { category: RoadmapCategory; title: string; icon: typeof Bug }[] = [
  { category: "bug", title: "Баги", icon: Bug },
  { category: "idea", title: "Идеи", icon: Lightbulb },
  { category: "task", title: "Задачи", icon: CheckSquare },
];

const STATUS_LABEL: Record<RoadmapStatus, string> = {
  planned: "Запланировано",
  in_progress: "В работе",
  done: "Готово",
};

const STATUS_CLASS: Record<RoadmapStatus, string> = {
  planned: "border-border/50 bg-secondary/40 text-muted-foreground",
  in_progress: "gradient-gold text-gold-foreground shadow-gold",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

function StatusPill({ status }: { status: RoadmapStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_CLASS[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function RoadmapCard({ item }: { item: RoadmapItem }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-card p-4 transition hover:border-border/80">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.note && (
          <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
        )}
      </div>
      <StatusPill status={item.status} />
    </div>
  );
}

function RoadmapPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
          <Milestone className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">Роадмап</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Баги, идеи и задачи проекта — в одном месте.
          </p>
        </div>
      </header>

      {SECTIONS.map(({ category, title, icon: Icon }) => {
        const items = roadmapItems.filter((i) => i.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Icon className="h-4 w-4" />
              {title}
              <span className="text-xs font-normal text-muted-foreground/60">
                ({items.length})
              </span>
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <RoadmapCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
