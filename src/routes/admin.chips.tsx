// YUPLINK · игровая часть (фишки/коллекции/паки).
// Админ-раздел: создание коллекций и паков фишек. Склад NFT фишек и их минт
// убраны вместе с выводом фишки в NFT (слово владельца 17.10.2026).

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layers, Package, Coins, Sparkles, Gem, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipsCollectionsPanel } from "@/components/admin/ChipsCollectionsPanel";
import { ChipsPacksPanel } from "@/components/admin/ChipsPacksPanel";
import { MysticPacksAdminPanel } from "@/components/admin/MysticPacksAdminPanel";
import { ItemsAdminPanel } from "@/components/admin/ItemsAdminPanel";
import { HeroSourcesPanel } from "@/components/admin/HeroSourcesPanel";

export const Route = createFileRoute("/admin/chips")({
  component: AdminChips,
});

function AdminChips() {
  const [tab, setTab] = useState<
    "collections" | "packs" | "mystic" | "artifacts" | "heroes"
  >("collections");
  // Deep-link через ?tab=…. Старые ?tab=stock / ?tab=mint (склада больше нет)
  // открывают «Коллекции». ?tab=energy → «Паки» (энергия — под-вкладка паков).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("tab");
    if (p === "energy") {
      setTab("packs");
    } else if (
      p === "packs" ||
      p === "collections" ||
      p === "mystic" ||
      p === "artifacts" ||
      p === "heroes"
    ) {
      setTab(p);
    }
  }, []);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
          <Coins className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">Фишки</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Коллекции и паки.</p>
        </div>
      </header>

      {/* Tabs — горизонтальный скролл на узких экранах, читаемые подписи.
          Порядок по флоу: Коллекции → Паки. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex shrink-0 gap-1 rounded-full border border-border bg-secondary/40 p-1">
          {(
            [
              { id: "collections", label: "Коллекции", icon: Layers },
              { id: "packs", label: "Паки", icon: Package },
              { id: "mystic", label: "Мистик", icon: Sparkles },
              { id: "artifacts", label: "Артефакты", icon: Gem },
              { id: "heroes", label: "Герои", icon: Crown },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition sm:px-4",
                  active
                    ? "gradient-gold text-gold-foreground shadow-gold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "collections" && <ChipsCollectionsPanel />}
      {tab === "packs" && <ChipsPacksPanel />}
      {tab === "mystic" && <MysticPacksAdminPanel />}
      {tab === "artifacts" && <ItemsAdminPanel kind="artifact" />}
      {tab === "heroes" && (
        <div className="space-y-8">
          <ItemsAdminPanel kind="hero" />
          {/* Какая коллекция фишек даёт какую расу героя + шансы специализаций. */}
          <HeroSourcesPanel />
        </div>
      )}
    </div>
  );
}
