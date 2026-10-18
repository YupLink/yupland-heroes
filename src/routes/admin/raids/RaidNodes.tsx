import { useState } from "react";
import {
  Swords, Trash2, ArrowUp, ArrowDown, GripVertical,
  Check, Package, GitFork, Map as MapIcon, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import type { RewardConfig } from "@/components/admin/RewardConfigEditor";
import { ImagePicker } from "./RaidConfig";

type ForkLinkT = { id: string; targetLocationId: string; name: string; imageUrl: string | null; ordinal: number; };

type NodeT = {
  id: string; branch: string; ordinal: number; type: string; isFinal: boolean;
  bossId: string | null; imageUrl: string | null; forkLinks: unknown[];
  chestConfig: unknown | null;
  boss: { name: string; imageUrl: string | null; backgroundUrl: string | null; removeWhite: boolean; badgeLabel: string | null; maxHp: number; currentHp: number; rewardConfig: RewardConfig; } | null;
};

export function ForkInlineRow({
  node, index, reorder, canUp, canDown, forkLinks,
  onUp, onDown, onDropOn, onDelete,
  onImageChange, onImageRemove, onRemoveLink, onOpenLinkPicker,
}: {
  node: NodeT; index: number; reorder: boolean; canUp: boolean; canDown: boolean;
  forkLinks: ForkLinkT[];
  onUp: () => void; onDown: () => void; onDropOn: (dragId: string) => void; onDelete: () => void;
  onImageChange: (url: string) => void; onImageRemove: () => void;
  onRemoveLink: (linkId: string) => void; onOpenLinkPicker: () => void;
}) {
  const [over, setOver] = useState(false);
  const links = [...forkLinks].sort((a, b) => a.ordinal - b.ordinal);
  if (reorder) {
    return (
      <div key={node.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", node.id)} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const d = e.dataTransfer.getData("text/plain"); if (d) onDropOn(d); }} className={cn("flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/5 p-2 cursor-grab active:cursor-grabbing", over && "ring-2 ring-gold")}>
        <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-gold"><GitFork className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><div className="truncate font-medium text-gold">Развилка</div><div className="text-[11px] text-muted-foreground">{links.length} веток</div></div>
        <div className="flex shrink-0 items-center gap-1"><GripVertical className="h-4 w-4 text-muted-foreground" /><button onClick={onUp} disabled={!canUp} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button onClick={onDown} disabled={!canDown} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button></div>
      </div>
    );
  }
  return (
    <div key={node.id} className="space-y-2.5 rounded-xl border border-gold/25 bg-gold/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gold"><span className="w-5 text-center text-muted-foreground">{index + 1}</span><GitFork className="h-4 w-4" /> Развилка → выбор локации</div>
        <button onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-red-400"><Trash2 className="h-3.5 w-3.5" /> Убрать</button>
      </div>
      <div className="flex items-center gap-2">
        <ImagePicker url={node.imageUrl} onUrl={onImageChange} />
        {node.imageUrl && <button onClick={onImageRemove} className="rounded-lg px-2 py-1 text-[11px] text-red-400">Убрать фото</button>}
        <span className="text-[11px] text-muted-foreground">картинка развилки</span>
      </div>
      {links.length === 0 && <div className="rounded-lg border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">Веток нет — привяжи локации ниже.</div>}
      {links.map((lk) => (
        <div key={lk.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2">
          {lk.imageUrl ? <img src={thumb(lk.imageUrl, 72)} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground"><MapIcon className="h-4 w-4" /></span>}
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{lk.name}</div><div className="text-[11px] text-muted-foreground">вход в локацию</div></div>
          <button onClick={() => onRemoveLink(lk.id)} title="Отвязать" className="shrink-0 rounded-lg p-1.5 text-red-400 transition hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button onClick={onOpenLinkPicker} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/40 py-2.5 text-sm font-medium text-gold"><Plus className="h-4 w-4" /> Привязать локацию-ветку</button>
    </div>
  );
}

export function BossRow({
  node, index, reorder, canUp, canDown,
  onEdit, onDelete, onUp, onDown, onDropOn,
}: {
  node: NodeT; index: number; reorder: boolean; canUp: boolean; canDown: boolean;
  onEdit: () => void; onDelete: () => void; onUp: () => void; onDown: () => void; onDropOn: (dragId: string) => void;
}) {
  const name = node.boss?.name?.trim() || `Босс ${index + 1}`;
  const defeated = !!node.boss && node.boss.currentHp <= 0;
  const [over, setOver] = useState(false);
  return (
    <div
      draggable={reorder}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", node.id)}
      onDragOver={(e) => { if (!reorder) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!reorder) return; e.preventDefault(); setOver(false); const dragId = e.dataTransfer.getData("text/plain"); if (dragId) onDropOn(dragId); }}
      className={cn("flex items-center gap-2 rounded-xl bg-card p-2 transition", reorder && "cursor-grab active:cursor-grabbing", over && "ring-2 ring-gold")}
    >
      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
      <div className="relative shrink-0">
        {node.boss?.imageUrl ? (
          <img src={thumb(node.boss.imageUrl, 96)} alt="" className={cn("h-10 w-10 rounded-lg object-cover", defeated && "opacity-40 grayscale")} />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-gold"><Swords className="h-5 w-5" /></span>
        )}
        {defeated && <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon text-black ring-2 ring-card"><Check className="h-2.5 w-2.5" /></span>}
      </div>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left" disabled={reorder}>
        <div className="flex items-center gap-1.5">
          <span className={cn("truncate font-medium", defeated && "text-muted-foreground line-through")}>{name}</span>
          {defeated && <span className="shrink-0 rounded bg-neon/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neon">повержен</span>}
        </div>
        <div className="text-[11px] text-muted-foreground">HP {node.boss?.maxHp.toLocaleString() ?? "—"}</div>
      </button>
      {reorder ? (
        <div className="flex shrink-0 items-center gap-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <button onClick={onUp} disabled={!canUp} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button onClick={onDown} disabled={!canDown} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        </div>
      ) : (
        <button onClick={onDelete} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400"><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  );
}

export function ChestRow({
  node, index, reorder, canUp, canDown,
  onEdit, onDelete, onUp, onDown, onDropOn,
}: {
  node: NodeT; index: number; reorder: boolean; canUp: boolean; canDown: boolean;
  onEdit: () => void; onDelete: () => void; onUp: () => void; onDown: () => void; onDropOn: (dragId: string) => void;
}) {
  const [over, setOver] = useState(false);
  const cfg = (node.chestConfig ?? {}) as RewardConfig;
  const fillers = cfg.fillers ?? [];
  const rewardCount = fillers.length + (cfg.packs?.length ?? 0) + (cfg.items?.length ?? 0);
  return (
    <div
      draggable={reorder}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", node.id)}
      onDragOver={(e) => { if (!reorder) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (!reorder) return; e.preventDefault(); setOver(false); const dragId = e.dataTransfer.getData("text/plain"); if (dragId) onDropOn(dragId); }}
      className={cn("flex items-center gap-2 rounded-xl bg-card p-2 transition", reorder && "cursor-grab active:cursor-grabbing", over && "ring-2 ring-gold")}
    >
      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{index + 1}</span>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300"><Package className="h-5 w-5" /></span>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left" disabled={reorder}>
        <div className="truncate font-medium">Сундук</div>
        <div className="text-[11px] text-muted-foreground">{node.type === "chest_op" ? "Особый" : "Обычный"} · {rewardCount} {rewardCount === 1 ? "награда" : "наград"}</div>
      </button>
      {reorder ? (
        <div className="flex shrink-0 items-center gap-1">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <button onClick={onUp} disabled={!canUp} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button onClick={onDown} disabled={!canDown} className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/60 text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        </div>
      ) : (
        <button onClick={onDelete} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-400"><Trash2 className="h-4 w-4" /></button>
      )}
    </div>
  );
}
