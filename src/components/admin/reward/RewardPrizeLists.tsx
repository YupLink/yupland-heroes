// Штучные призы «до места N»: паки и артефакты/герои.
// Вынесено из RewardConfigEditor.tsx без изменений — тот перерос лимит файла.
import { Gem, Gift, Plus, Trash2 } from "lucide-react";
import { clampNum, type DraftConfig } from "./rewardDraft";
import { PackPicker } from "./PackPicker";
import { ItemPicker } from "./ItemPicker";

export function RewardPackList({
  cfg,
  setCfg,
  chipPacksOnly,
}: {
  cfg: DraftConfig;
  setCfg: (patch: Partial<DraftConfig>) => void;
  chipPacksOnly: boolean;
}) {
  const setPack = (i: number, patch: Partial<{ packId: string; toPlace: string }>) =>
    setCfg({ packs: cfg.packs.map((pk, j) => (j === i ? { ...pk, ...patch } : pk)) });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Паки победителям</span>
        <button
          type="button"
          onClick={() => setCfg({ packs: [...cfg.packs, { packId: "", toPlace: "1" }] })}
          className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-gold"
        >
          <Plus className="h-3.5 w-3.5" /> Пак
        </button>
      </div>
      {cfg.packs.map((pk, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-gold">
            <Gift className="h-4 w-4" />
          </span>
          <PackPicker
            packId={pk.packId || null}
            onPack={(id) => setPack(i, { packId: id ?? "" })}
            chipPacksOnly={chipPacksOnly}
          />
          <span className="shrink-0 text-xs text-muted-foreground">топ</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={pk.toPlace}
            onChange={(e) => setPack(i, { toPlace: e.target.value })}
            onBlur={() =>
              setPack(i, {
                toPlace: String(clampNum(pk.toPlace, 1, Number.MAX_SAFE_INTEGER, true)),
              })
            }
            className="w-14 shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-base"
          />
          <button
            type="button"
            onClick={() => setCfg({ packs: cfg.packs.filter((_, j) => j !== i) })}
            className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function RewardItemList({
  cfg,
  setCfg,
}: {
  cfg: DraftConfig;
  setCfg: (patch: Partial<DraftConfig>) => void;
}) {
  const setItem = (i: number, patch: Partial<{ itemTemplateId: string; toPlace: string }>) =>
    setCfg({
      items: (cfg.items ?? []).map((it, j) => (j === i ? { ...it, ...patch } : it)),
    });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Артефакты/герои победителям
        </span>
        <button
          type="button"
          onClick={() =>
            setCfg({ items: [...(cfg.items ?? []), { itemTemplateId: "", toPlace: "1" }] })
          }
          className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-gold"
        >
          <Plus className="h-3.5 w-3.5" /> Предмет
        </button>
      </div>
      {(cfg.items ?? []).map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-fuchsia-300">
            <Gem className="h-4 w-4" />
          </span>
          <ItemPicker
            value={it.itemTemplateId}
            onChange={(id) => setItem(i, { itemTemplateId: id })}
          />
          <span className="shrink-0 text-xs text-muted-foreground">топ</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={it.toPlace}
            onChange={(e) => setItem(i, { toPlace: e.target.value })}
            onBlur={() =>
              setItem(i, {
                toPlace: String(clampNum(it.toPlace, 1, Number.MAX_SAFE_INTEGER, true)),
              })
            }
            className="w-14 shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-base"
          />
          <button
            type="button"
            onClick={() => setCfg({ items: (cfg.items ?? []).filter((_, j) => j !== i) })}
            className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
