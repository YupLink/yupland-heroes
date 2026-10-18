import { useState } from "react";
import { cn } from "@/lib/utils";
import { BossAdminPanel } from "./BossAdminPanel";
import { MiniBossPanel } from "./MiniBossPanel";

export function BossAdminTabs({ onSaved }: { onSaved: () => void }) {
  const [tab, setTab] = useState<"queue" | "mini">("queue");
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button onClick={() => setTab("queue")}
          className={cn(
            "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
            tab === "queue" ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-muted-foreground hover:border-gold/30"
          )}>
          Очередь боссов
        </button>
        <button onClick={() => setTab("mini")}
          className={cn(
            "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition",
            tab === "mini" ? "border-success/50 bg-success/10 text-success" : "border-border text-muted-foreground hover:border-success/30"
          )}>
          🐣 Мини-босс
        </button>
      </div>
      {tab === "queue" ? <BossAdminPanel onSaved={onSaved} /> : <MiniBossPanel onSaved={onSaved} />}
    </div>
  );
}
