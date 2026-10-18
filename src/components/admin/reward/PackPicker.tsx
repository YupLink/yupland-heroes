// Дропдаун РЕАЛЬНЫХ паков (чип-паки + NFT-паки), по имени.
// chipPacksOnly — прятать NFT-паки (рейд: только паки изнутри игры, чтобы не ошибиться).
//
// Вынесен из RewardConfigEditor.tsx без изменений — тот перерос лимит файла.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminListChipPacks } from "@/server/api/chips-admin";
import { adminListPacks } from "@/server/api/packs";

export function PackPicker({
  packId,
  onPack,
  chipPacksOnly = false,
}: {
  packId: string | null;
  onPack: (id: string | null) => void;
  chipPacksOnly?: boolean;
}) {
  const nft = useQuery({
    queryKey: ["admin", "packs", "active-only"],
    queryFn: () => adminListPacks({ data: { activeOnly: true } }),
    enabled: !chipPacksOnly,
  });
  const chip = useQuery({
    queryKey: ["admin", "chip-packs", "all"],
    queryFn: () => adminListChipPacks(),
  });
  // Исчерпанный чип-пак (нечем открыть) как награду не даём — прячем, но уже
  // выбранный оставляем видимым (escape-hatch), как в эталонном пикере admin.drops.
  const chipList = (chip.data ?? []).filter((p) => p.active && (!p.exhausted || p.id === packId));
  const nftList = chipPacksOnly ? [] : (nft.data ?? []);
  const [open, setOpen] = useState(false);
  // КАСТОМНЫЙ дропдаун вместо нативного <select>: в Telegram-вебвью Xiaomi нативный
  // пикер не коммитил выбор. Кнопка + список из <button> работают на любом webview.
  const options: Array<{ id: string; label: string; group: string }> = [
    ...chipList.map((p) => ({
      id: p.id,
      label: p.exhausted ? `${p.name} (исчерпан)` : p.name,
      group: "Чип-паки",
    })),
    ...nftList.map((p) => ({ id: p.id, label: p.name, group: "NFT-паки" })),
  ];
  const current = options.find((o) => o.id === packId) ?? null;
  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-base"
      >
        <span className={cn("truncate", !current && "text-muted-foreground")}>
          {current ? current.label : "— выбери пак —"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onPack(null);
                setOpen(false);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary"
            >
              — выбери пак —
            </button>
            {["Чип-паки", "NFT-паки"].map((grp) => {
              const items = options.filter((o) => o.group === grp);
              if (items.length === 0) return null;
              return (
                <div key={grp}>
                  <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {grp}
                  </div>
                  {items.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        onPack(o.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-secondary",
                        o.id === packId ? "font-semibold text-gold" : "text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
