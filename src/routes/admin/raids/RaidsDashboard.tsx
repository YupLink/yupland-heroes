import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Map as MapIcon, Trash2, Plus, Pencil, X,
  ChevronDown, ArrowUpDown, Power, Loader2, GitBranch, Package, GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import {
  adminListRaidLocations, adminUpsertRaidLocation, adminUpsertRaidBoss,
  adminUpsertRaidNode, adminReorderRaidNodes, adminDeleteRaidNode,
  adminAddForkLink, adminRemoveForkLink, adminSetForkImage,
} from "@/server/api/raid-admin";
import {
  type RewardConfig, type DraftConfig,
  DEF_CFG, toDraftCfg, fromDraftCfg,
} from "@/components/admin/RewardConfigEditor";
import { BossRow } from "./RaidNodes";
import { ChestRow } from "./RaidNodes";
import { ForkInlineRow } from "./RaidNodes";
import { BossEditor, ChestEditor, LocationEditor, ForkLinkPicker, ImagePicker } from "./RaidConfig";
import { humanError } from "@/lib/humanError";
export const Route = createFileRoute("/admin/raids/RaidsDashboard")({ component: AdminRaids });
type RewardCfg = RewardConfig;
type NodeT = {
  id: string; branch: string; ordinal: number; type: string; isFinal: boolean;
  bossId: string | null; imageUrl: string | null; forkLinks: ForkLinkT[];
  chestConfig: unknown | null;
  boss: { name: string; imageUrl: string | null; backgroundUrl: string | null; removeWhite: boolean; badgeLabel: string | null; maxHp: number; currentHp: number; rewardConfig: RewardCfg; } | null;
};
type ForkLinkT = { id: string; targetLocationId: string; name: string; imageUrl: string | null; ordinal: number; };
type LocT = {
  id: string; name: string; imageUrl: string | null; active: boolean; inHub: boolean;
  difficulty: string | null; cycleNo: number; rewardConfig: RewardCfg;
  forkNodeId: string | null; forkImageUrl: string | null; forkLinks: ForkLinkT[]; nodes: NodeT[];
};
const bossesIn = (loc: LocT, branch: string) =>
  loc.nodes.filter((n) => n.branch === branch && (n.type === "boss" || n.type === "final")).sort((a, b) => a.ordinal - b.ordinal);
const rootChain = (loc: LocT) =>
  loc.nodes.filter((n) => n.branch === "root").sort((a, b) => a.ordinal - b.ordinal);
export type { NodeT, ForkLinkT, LocT, RewardCfg };
export function AdminRaids() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-raids"], queryFn: () => adminListRaidLocations() });
  const locations = (q.data?.locations ?? []) as LocT[];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-raids"] });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reorderKey, setReorderKey] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
  const [editor, setEditor] = useState<import("./RaidConfig").BossEd | null>(null);
  const [locSheet, setLocSheet] = useState<import("./RaidConfig").LocEd | null>(null);
  const [linkPickerFork, setLinkPickerFork] = useState<{ nodeId: string; locationId: string } | null>(null);
  const [chestEditor, setChestEditor] = useState<{ nodeId?: string; locationId: string; branch: string; ordinal: number; rewardConfig: DraftConfig } | null>(null);
  const saveChest = useMutation({
    mutationFn: (e: NonNullable<typeof chestEditor>) =>
      adminUpsertRaidNode({ data: { nodeId: e.nodeId, locationId: e.locationId, branch: e.branch, ordinal: e.ordinal, type: "chest_normal", chestConfig: fromDraftCfg(e.rewardConfig) } }),
    onSuccess: () => { toast.success("Сундук сохранён"); setChestEditor(null); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const addChest = useMutation({
    mutationFn: (v: { loc: LocT; branch: string }) => {
      const ord = (rootChain(v.loc).at(-1)?.ordinal ?? -1) + 1;
      return adminUpsertRaidNode({ data: { locationId: v.loc.id, branch: v.branch, ordinal: ord, type: "chest_normal", chestConfig: fromDraftCfg(DEF_CFG) } });
    },
    onSuccess: () => { toast.success("Сундук добавлен"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const saveBoss = useMutation({
    mutationFn: (e: import("./RaidConfig").BossEd) =>
      adminUpsertRaidBoss({ data: { nodeId: e.nodeId, locationId: e.locationId, branch: e.branch, ordinal: e.ordinal, isFinal: e.isFinal, name: e.name, imageUrl: e.imageUrl, backgroundUrl: e.backgroundUrl, removeWhite: e.removeWhite, badgeLabel: e.badgeLabel, maxHp: e.maxHp, rewardConfig: fromDraftCfg(e.rewardConfig) } }),
    onSuccess: () => { toast.success("Босс сохранён"); setEditor(null); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const delBoss = useMutation({
    mutationFn: (nodeId: string) => adminDeleteRaidNode({ data: { nodeId } }),
    onSuccess: () => { toast.success("Удалён"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const addBoss = useMutation({
    mutationFn: (v: { loc: LocT; branch: string }) => {
      const ord = (rootChain(v.loc).at(-1)?.ordinal ?? -1) + 1;
      return adminUpsertRaidBoss({ data: { locationId: v.loc.id, branch: v.branch, ordinal: ord, isFinal: false, name: `Босс ${bossesIn(v.loc, v.branch).length + 1}`, imageUrl: null, backgroundUrl: null, removeWhite: false, badgeLabel: null, maxHp: 100000, rewardConfig: fromDraftCfg(DEF_CFG) } });
    },
    onSuccess: () => { toast.success("Босс добавлен"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const addFork = useMutation({
    mutationFn: (loc: LocT) => {
      const ord = (rootChain(loc).at(-1)?.ordinal ?? -1) + 1;
      return adminUpsertRaidNode({ data: { locationId: loc.id, branch: "root", ordinal: ord, type: "fork" } });
    },
    onSuccess: () => { toast.success("Развилка добавлена — привяжи локации-ветки"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const reorder = useMutation({
    mutationFn: (v: { locationId: string; branch: string; orderedIds: string[] }) =>
      adminReorderRaidNodes({ data: { locationId: v.locationId, branch: v.branch, orderedIds: v.orderedIds } }),
    onError: (e: Error) => { toast.error(humanError(e)); refresh(); },
  });
  const saveLoc = useMutation({
    mutationFn: (e: import("./RaidConfig").LocEd) =>
      adminUpsertRaidLocation({ data: { id: e.id, name: e.name, imageUrl: e.imageUrl, active: e.active, inHub: e.inHub, difficulty: e.difficulty, rewardConfig: fromDraftCfg(e.rewardConfig) } }),
    onSuccess: () => { toast.success("Локация сохранена"); setLocSheet(null); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const addLink = useMutation({
    mutationFn: (v: { forkNodeId: string; locationId: string; targetLocationId: string }) => adminAddForkLink({ data: v }),
    onSuccess: () => { toast.success("Локация привязана к развилке"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const removeLink = useMutation({
    mutationFn: (linkId: string) => adminRemoveForkLink({ data: { linkId } }),
    onSuccess: () => { toast.success("Ветка отвязана"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const setForkImage = useMutation({
    mutationFn: (v: { nodeId: string; imageUrl: string | null }) => adminSetForkImage({ data: v }),
    onSuccess: () => { toast.success("Картинка развилки сохранена"); refresh(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const toggleActive = useMutation({
    mutationFn: (l: LocT) => adminUpsertRaidLocation({ data: { id: l.id, name: l.name, imageUrl: l.imageUrl, active: !l.active, rewardConfig: l.rewardConfig } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const enterReorder = (loc: LocT, branch: string) => { setOrderDraft(rootChain(loc).map((n) => n.id)); setReorderKey(`${loc.id}:${branch}`); };
  const moveLocal = (nodeId: string, dir: "up" | "down") => { setOrderDraft((cur) => { const i = cur.indexOf(nodeId); const j = dir === "up" ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= cur.length) return cur; const arr = [...cur]; [arr[i], arr[j]] = [arr[j], arr[i]]; return arr; }); };
  const dropLocal = (dragId: string, overId: string) => { setOrderDraft((cur) => { if (dragId === overId) return cur; const from = cur.indexOf(dragId); const to = cur.indexOf(overId); if (from < 0 || to < 0) return cur; const arr = [...cur]; arr.splice(from, 1); arr.splice(to, 0, dragId); return arr; }); };
  const commitOrder = (loc: LocT, branch: string) => {
    const orig = rootChain(loc).map((n) => n.id);
    const changed = orderDraft.length === orig.length && orderDraft.some((id, i) => id !== orig[i]);
    setReorderKey(null);
    if (!changed) return;
    const pos = new Map(orderDraft.map((id, i) => [id, i]));
    qc.setQueryData(["admin-raids"], (old: { locations: LocT[] } | undefined) => old ? { ...old, locations: old.locations.map((l) => l.id === loc.id ? { ...l, nodes: l.nodes.map((n) => pos.has(n.id) ? { ...n, ordinal: pos.get(n.id)! } : n) } : l) } : old);
    reorder.mutate({ locationId: loc.id, branch, orderedIds: orderDraft });
  };
  const renderForkInline = (loc: LocT, node: NodeT, index: number, inReorder: boolean, canUp: boolean, canDown: boolean) => (
    <ForkInlineRow key={node.id} node={node} index={index} reorder={inReorder} canUp={canUp} canDown={canDown}
      forkLinks={((node.forkLinks ?? []) as ForkLinkT[]).map((l) => ({ ...l }))}
      onUp={() => moveLocal(node.id, "up")} onDown={() => moveLocal(node.id, "down")}
      onDropOn={(dragId) => dropLocal(dragId, node.id)}
      onDelete={() => { if (confirm("Убрать эту развилку? Привязанные локации останутся.")) delBoss.mutate(node.id); }}
      onImageChange={(u) => setForkImage.mutate({ nodeId: node.id, imageUrl: u })}
      onImageRemove={() => setForkImage.mutate({ nodeId: node.id, imageUrl: null })}
      onRemoveLink={(linkId) => removeLink.mutate(linkId)}
      onOpenLinkPicker={() => setLinkPickerFork({ nodeId: node.id, locationId: loc.id })}
    />
  );
  const renderBranch = (loc: LocT, branch: string, label: string | null) => {
    const list = branch === "root" ? rootChain(loc) : bossesIn(loc, branch);
    const rk = `${loc.id}:${branch}`;
    const inReorder = reorderKey === rk;
    const shown = inReorder && orderDraft.length ? (orderDraft.map((id) => list.find((b) => b.id === id)).filter(Boolean) as NodeT[]) : list;
    return (
      <div className="space-y-1.5">
        {label && <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gold"><GitBranch className="h-3.5 w-3.5" /> {label}</div>}
        {list.length > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => (inReorder ? commitOrder(loc, branch) : enterReorder(loc, branch))} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition", inReorder ? "bg-gold/15 text-gold" : "bg-secondary/60 text-muted-foreground")}><ArrowUpDown className="h-3.5 w-3.5" /> {inReorder ? "Готово" : "Порядок"}</button>
            {inReorder && <span className="text-[11px] text-muted-foreground">Тяни или ↑↓ · сохранится по «Готово»</span>}
          </div>
        )}
        {list.length === 0 && <div className="rounded-lg border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">Боссов нет — добавь первого.</div>}
        {shown.map((n, i) =>
          n.type === "fork" ? renderForkInline(loc, n, i, inReorder, i > 0, i < shown.length - 1)
          : n.type === "chest_normal" || n.type === "chest_op" ? (
            <ChestRow key={n.id} node={n} index={i} reorder={inReorder} canUp={i > 0} canDown={i < shown.length - 1}
              onEdit={() => setChestEditor({ nodeId: n.id, locationId: loc.id, branch: n.branch, ordinal: n.ordinal, rewardConfig: toDraftCfg((n.chestConfig ?? {}) as RewardConfig) })}
              onDelete={() => delBoss.mutate(n.id)} onUp={() => moveLocal(n.id, "up")} onDown={() => moveLocal(n.id, "down")} onDropOn={(dragId) => dropLocal(dragId, n.id)} />
          ) : (
            <BossRow key={n.id} node={n} index={i} reorder={inReorder} canUp={i > 0} canDown={i < shown.length - 1}
              onEdit={() => setEditor({ nodeId: n.id, locationId: loc.id, branch: n.branch, isFinal: n.isFinal, ordinal: n.ordinal, name: n.boss?.name ?? "", imageUrl: n.boss?.imageUrl ?? null, backgroundUrl: n.boss?.backgroundUrl ?? null, removeWhite: n.boss?.removeWhite ?? false, badgeLabel: n.boss?.badgeLabel ?? null, maxHp: n.boss?.maxHp ?? 100000, rewardConfig: n.boss ? toDraftCfg(n.boss.rewardConfig) : DEF_CFG })}
              onDelete={() => delBoss.mutate(n.id)} onUp={() => moveLocal(n.id, "up")} onDown={() => moveLocal(n.id, "down")} onDropOn={(dragId) => dropLocal(dragId, n.id)} />
          )
        )}
        {!inReorder && (
          <div className="flex flex-col gap-1.5 sm:flex-row">
            <button onClick={() => addBoss.mutate({ loc, branch })} disabled={addBoss.isPending} className="mt-1 flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-gold/40 py-2.5 text-sm font-medium text-gold disabled:opacity-50"><Plus className="h-4 w-4" /> Босс</button>
            {branch === "root" && <button onClick={() => addFork.mutate(loc)} disabled={addFork.isPending} className="mt-1 flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-neon/40 py-2.5 text-sm font-medium text-neon disabled:opacity-50"><GitFork className="h-4 w-4" /> Развилка</button>}
            <button onClick={() => addChest.mutate({ loc, branch })} disabled={addChest.isPending} className="mt-1 flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-400/40 py-2.5 text-sm font-medium text-amber-300 disabled:opacity-50"><Package className="h-4 w-4" /> Сундук</button>
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground"><MapIcon className="h-5 w-5" /></span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Рейд-локации</h1>
          <p className="text-xs text-muted-foreground">Тапни локацию → её боссы. Тапни босса → настройка.</p>
        </div>
        <button onClick={() => setLocSheet({ name: "", imageUrl: null, active: true, inHub: true, difficulty: null, rewardConfig: DEF_CFG })} className="inline-flex items-center gap-1.5 rounded-full gradient-gold px-3.5 py-2 text-sm font-bold text-gold-foreground shadow-gold"><Plus className="h-4 w-4" /> Локация</button>
      </header>
      {q.isLoading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>}
      {!q.isLoading && locations.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Пусто. Добавь локацию кнопкой сверху.</div>}
      {locations.map((loc) => {
        const bossCount = loc.nodes.filter((n) => n.type === "boss" || n.type === "final").length;
        const open = expanded === loc.id;
        return (
          <div key={loc.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 p-3">
              <button onClick={() => setExpanded(open ? null : loc.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                {loc.imageUrl ? <img src={thumb(loc.imageUrl, 96)} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><MapIcon className="h-5 w-5" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display text-lg font-bold">{loc.name}</span>
                    {loc.difficulty && <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", loc.difficulty === "newbie" ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" : loc.difficulty === "medium" ? "border-amber-400/40 bg-amber-400/15 text-amber-300" : "border-rose-400/40 bg-rose-400/15 text-rose-300")}>{loc.difficulty === "newbie" ? "Новичок" : loc.difficulty === "medium" ? "Средне" : "Сложно"}</span>}
                    {loc.inHub && <span className="shrink-0 rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold">перекрёсток</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{bossCount} {bossCount === 1 ? "босс" : "боссов"}{(() => { const f = loc.nodes.filter((n) => n.type === "fork").length; return f > 0 ? ` · развилок: ${f}` : ""; })()}</div>
                </div>
                <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition", open && "rotate-180 text-gold")} />
              </button>
              <button onClick={() => toggleActive.mutate(loc)} title={loc.active ? "Активна" : "Выключена"} className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition", loc.active ? "bg-neon/15 text-neon" : "bg-secondary text-muted-foreground")}><Power className="h-4 w-4" /></button>
              <button onClick={() => setLocSheet({ id: loc.id, name: loc.name, imageUrl: loc.imageUrl, active: loc.active, inHub: loc.inHub ?? true, difficulty: (loc.difficulty as import("./RaidConfig").Difficulty) ?? null, rewardConfig: toDraftCfg(loc.rewardConfig) })} title="Настройки локации" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition hover:text-foreground"><Pencil className="h-4 w-4" /></button>
            </div>
            {open && <div className="space-y-3 border-t border-border/60 bg-background/30 p-3">{renderBranch(loc, "root", null)}</div>}
          </div>
        );
      })}
      {editor && <BossEditor value={editor} onChange={setEditor} onSave={() => saveBoss.mutate(editor)} saving={saveBoss.isPending} onClose={() => setEditor(null)} locationBg={locations.find((l) => l.id === editor.locationId)?.imageUrl ?? null} />}
      {chestEditor && <ChestEditor value={chestEditor} onChange={setChestEditor} onSave={() => saveChest.mutate(chestEditor)} saving={saveChest.isPending} onClose={() => setChestEditor(null)} />}
      {locSheet && <LocationEditor value={locSheet} onChange={setLocSheet} onSave={() => saveLoc.mutate(locSheet)} saving={saveLoc.isPending} onClose={() => setLocSheet(null)} />}
      {linkPickerFork && <ForkLinkPicker forkNodeId={linkPickerFork.nodeId} locationId={linkPickerFork.locationId} adding={addLink.isPending} onPick={(targetLocationId) => { addLink.mutate({ forkNodeId: linkPickerFork.nodeId, locationId: linkPickerFork.locationId, targetLocationId }, { onSuccess: () => setLinkPickerFork(null) }); }} onClose={() => setLinkPickerFork(null)} />}
    </div>
  );
}
export function Sheet({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-bold">{icon} {title}</div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
