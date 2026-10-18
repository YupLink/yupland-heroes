import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { LikesDashboard } from "./admin/likes/LikesDashboard";
import { LikeEventsList } from "./admin/likes/LikeEventsList";

export const Route = createFileRoute("/admin/likes")({
  validateSearch: (search: Record<string, unknown>) => ({
    ready: (search.ready as string | undefined) ?? undefined,
  }),
  component: AdminLikes,
});

function AdminLikes() {
  const [stakingOpen, setStakingOpen] = useState(false);
  return (
    <div className="space-y-6">
      <LikesDashboard />
      <section className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-3">
        <button
          onClick={() => setStakingOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold leading-tight text-amber-200">
              Дополнительно
            </div>
            <div className="truncate text-[11px] text-amber-300/70">
              Стейкинг и mining — авто-лайки
            </div>
          </div>
          {stakingOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-amber-300/70" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-amber-300/70" />
          )}
        </button>
        {stakingOpen && <LikeEventsList />}
      </section>
    </div>
  );
}
