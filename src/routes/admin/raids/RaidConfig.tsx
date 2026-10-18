import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Map as MapIcon, Swords, Trash2, Plus, ImagePlus, Save,
  FolderOpen, Loader2, Gift, GitFork, Check, Package, Power,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { BossScene } from "@/components/game/BossScene";
import {
  adminUpsertRaidLocation, adminListLinkableLocations,
  adminListBossTemplates, adminSaveBossTemplate,
} from "@/server/api/raid-admin";
import { BossTemplateDeleteDialog } from "@/components/admin/BossTemplateDeleteDialog";
import { adminListRewardTokens } from "@/server/api/boss";
import {
  RewardConfigEditor, type RewardConfig, type DraftConfig,
  DEF_CFG, toDraftCfg, fromDraftCfg,
} from "@/components/admin/RewardConfigEditor";
import { Sheet } from "./RaidsDashboard";
import { humanError } from "@/lib/humanError";

export async function uploadImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error || "upload failed");
  return j.url;
}

export function ImagePicker({ url, onUrl }: { url: string | null; onUrl: (u: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50">
      {url ? <img src={thumb(url, 80)} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="text-muted-foreground">Картинка</span>}
      <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { onUrl(await uploadImageFile(f)); toast.success("Загружено"); } catch (err) { toast.error(err instanceof Error ? err.message : "Ошибка загрузки"); } }} />
    </label>
  );
}

export function ForkLinkPicker({ forkNodeId, locationId, adding, onPick, onClose }: { forkNodeId: string; locationId: string; adding: boolean; onPick: (targetLocationId: string) => void; onClose: () => void }) {
  const q = useQuery({ queryKey: ["fork-linkable", forkNodeId], queryFn: () => adminListLinkableLocations({ data: { forkNodeId, locationId } }) });
  const list = q.data?.locations ?? [];
  return (
    <Sheet title="Привязать локацию-ветку" icon={<GitFork className="h-4 w-4 text-gold" />} onClose={onClose}>
      {q.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>}
      {!q.isLoading && list.length === 0 && <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Нет свободных локаций. Создай новую локацию кнопкой «Локация».</div>}
      <div className="space-y-2">
        {list.map((l) => (
          <button key={l.id} onClick={() => onPick(l.id)} disabled={adding} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-gold/40 disabled:opacity-50">
            {l.imageUrl ? <img src={thumb(l.imageUrl, 80)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><MapIcon className="h-5 w-5" /></span>}
            <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
            <Plus className="h-4 w-4 shrink-0 text-gold" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export type BossEd = {
  nodeId?: string; locationId: string; branch: string; isFinal: boolean;
  ordinal: number; name: string; imageUrl: string | null; backgroundUrl: string | null;
  removeWhite: boolean; badgeLabel: string | null; maxHp: number; rewardConfig: DraftConfig;
};
export type Difficulty = "newbie" | "medium" | "hard" | null;
export type LocEd = {
  id?: string; name: string; imageUrl: string | null; active: boolean;
  inHub: boolean; difficulty: Difficulty; rewardConfig: DraftConfig;
};

async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error || "upload failed");
  return j.url;
}

function ImageField({ url, onUrl }: { url: string | null; onUrl: (u: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50">
      {url ? <img src={thumb(url, 80)} alt="" className="h-9 w-9 rounded object-cover" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
      <span className="text-muted-foreground">{url ? "Сменить" : "Картинка"}</span>
      <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { onUrl(await uploadImage(f)); toast.success("Загружено"); } catch (err) { toast.error(err instanceof Error ? err.message : "Ошибка загрузки"); } }} />
    </label>
  );
}

export function BossEditor({ value, onChange, onSave, saving, onClose, locationBg }: { value: BossEd; onChange: (v: BossEd) => void; onSave: () => void; saving: boolean; onClose: () => void; locationBg: string | null }) {
  const qc = useQueryClient();
  const [showTpl, setShowTpl] = useState(false);
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });
  const tpls = useQuery({ queryKey: ["raid-boss-tpls"], queryFn: () => adminListBossTemplates() });
  const templates = tpls.data?.templates ?? [];

  const saveTpl = useMutation({
    mutationFn: () => {
      const nm = (value.name || "").trim();
      if (templates.some((t) => t.name.trim().toLowerCase() === nm.toLowerCase())) return Promise.reject(new Error("Шаблон с таким именем уже есть"));
      return adminSaveBossTemplate({ data: { name: nm || "Шаблон", imageUrl: value.imageUrl, maxHp: value.maxHp, rewardConfig: fromDraftCfg(value.rewardConfig), backgroundUrl: value.backgroundUrl, removeWhite: value.removeWhite, badgeLabel: value.badgeLabel } });
    },
    onSuccess: () => { toast.success("В шаблонах"); qc.invalidateQueries({ queryKey: ["raid-boss-tpls"] }); },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  // Шаблон и расставленные по карте боссы — разные вещи: корзина открывает
  // окно, где видно, сколько копий на картах, и можно выбрать, убирать их или
  // оставить. Раньше она удаляла шаблон молча, одним нажатием, — и копии
  // превращались в непроходимые чёрные точки.
  const [delTpl, setDelTpl] = useState<{ id: string; name: string } | null>(null);

  return (
    <Sheet title={value.nodeId ? "Правка босса" : "Новый босс"} icon={<Swords className="h-4 w-4 text-gold" />} onClose={onClose}>
      {delTpl && (
        <BossTemplateDeleteDialog
          template={delTpl}
          onClose={() => setDelTpl(null)}
          onDeleted={() => qc.invalidateQueries({ queryKey: ["raid-boss-tpls"] })}
        />
      )}
      <button onClick={() => setShowTpl((v) => !v)} className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 py-2.5 text-xs font-medium"><FolderOpen className="h-4 w-4" /> Загрузить шаблон ({templates.length})</button>
      {showTpl && (
        <div className="mb-3 space-y-1.5 rounded-lg border border-border bg-secondary/20 p-2">
          {templates.length === 0 && <div className="p-2 text-center text-xs text-muted-foreground">Пока пусто — сохрани текущего в шаблон.</div>}
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg bg-card p-2">
              {t.imageUrl ? <img src={thumb(t.imageUrl, 64)} className="h-8 w-8 rounded object-cover" alt="" /> : <span className="flex h-8 w-8 items-center justify-center rounded bg-secondary text-gold"><Swords className="h-4 w-4" /></span>}
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{t.name}</div><div className="text-[11px] text-muted-foreground">HP {t.maxHp.toLocaleString()}</div></div>
              <button onClick={() => { onChange({ ...value, name: t.name, imageUrl: t.imageUrl, maxHp: t.maxHp, rewardConfig: toDraftCfg(t.rewardConfig), backgroundUrl: (t as { backgroundUrl?: string | null }).backgroundUrl ?? null, removeWhite: (t as { removeWhite?: boolean }).removeWhite ?? false, badgeLabel: (t as { badgeLabel?: string | null }).badgeLabel ?? null }); setShowTpl(false); toast.success("Шаблон загружен"); }} className="rounded bg-gold/20 px-2.5 py-1.5 text-xs font-medium text-gold">Взять</button>
              <button onClick={() => setDelTpl({ id: t.id, name: t.name })} className="rounded p-1.5 text-red-400" title="Удалить шаблон"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Босс (PNG)</div>
            <ImageField url={value.imageUrl} onUrl={(u) => onChange({ ...value, imageUrl: u })} />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Фон · можно GIF</div>
            <ImageField url={value.backgroundUrl} onUrl={(u) => onChange({ ...value, backgroundUrl: u })} />
            {value.backgroundUrl ? <button type="button" onClick={() => onChange({ ...value, backgroundUrl: null })} className="mt-1 text-[10px] text-muted-foreground underline">убрать фон (будет фон локации)</button> : <div className="mt-1 text-[10px] text-muted-foreground">пусто → фон локации</div>}
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><input type="checkbox" checked={value.removeWhite} onChange={(e) => onChange({ ...value, removeWhite: e.target.checked })} className="h-4 w-4" /><span>Убрать белый фон у босса (для арта на белом)</span></label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"><input type="checkbox" checked={value.isFinal} onChange={(e) => onChange({ ...value, isFinal: e.target.checked })} className="h-4 w-4" /><span>Финальный босс локации</span></label>
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Превью (как увидит игрок)</div>
          <BossScene imageUrl={value.imageUrl} backgroundUrl={value.backgroundUrl} removeWhite={value.removeWhite} locationBg={locationBg} hpPct={100} isFinal={value.isFinal} anim="breathe" label={value.badgeLabel} />
        </div>
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Имя босса" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base" />
        <input value={value.badgeLabel ?? ""} onChange={(e) => onChange({ ...value, badgeLabel: e.target.value || null })} placeholder="Текст бейджа (пусто → «Босс»)" maxLength={40} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base" />
        <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5"><span className="text-xs text-muted-foreground">HP</span><input type="number" inputMode="numeric" value={value.maxHp} onChange={(e) => onChange({ ...value, maxHp: Number(e.target.value) || 1 })} className="min-w-0 flex-1 bg-transparent text-base outline-none" /></label>
        <RewardConfigEditor cfg={value.rewardConfig} onChange={(c) => onChange({ ...value, rewardConfig: c })} tokens={tokens.data ?? []} allowTickets={false} chipPacksOnly />
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => saveTpl.mutate()} disabled={!value.name || saveTpl.isPending} className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-medium disabled:opacity-50" title="Сохранить как шаблон"><FolderOpen className="h-4 w-4" /> В шаблон</button>
        <button onClick={onSave} disabled={!value.name || saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Сохраняю…" : "Сохранить"}</button>
      </div>
    </Sheet>
  );
}

export function ChestEditor({ value, onChange, onSave, saving, onClose }: { value: { nodeId?: string; locationId: string; branch: string; ordinal: number; rewardConfig: DraftConfig }; onChange: (v: typeof value) => void; onSave: () => void; saving: boolean; onClose: () => void }) {
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });
  return (
    <Sheet title={value.nodeId ? "Настройки сундука" : "Новый сундук"} icon={<Package className="h-4 w-4 text-amber-300" />} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">Настрой содержимое сундука — что получит игрок при открытии.</div>
        <RewardConfigEditor cfg={value.rewardConfig} onChange={(c) => onChange({ ...value, rewardConfig: c })} tokens={tokens.data ?? []} allowTickets chipPacksOnly={false} />
      </div>
      <div className="mt-4">
        <button onClick={onSave} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Сохраняю…" : "Сохранить"}</button>
      </div>
    </Sheet>
  );
}

export function LocationEditor({ value, onChange, onSave, saving, onClose }: { value: LocEd; onChange: (v: LocEd) => void; onSave: () => void; saving: boolean; onClose: () => void }) {
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });
  return (
    <Sheet title={value.id ? "Настройки локации" : "Новая локация"} icon={<MapIcon className="h-4 w-4 text-gold" />} onClose={onClose}>
      <div className="space-y-3">
        <button onClick={() => onChange({ ...value, inHub: !value.inHub })} className={cn("flex w-full items-center justify-between gap-2 rounded-lg border-2 px-3 py-2.5 text-left transition", value.inHub ? "border-gold/60 bg-gold/10 text-gold" : "border-border bg-secondary/30 text-muted-foreground")}>
          <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><GitFork className="h-4 w-4" /> Перекрёсток (начало)</span>
          <span className={cn("flex h-5 w-5 items-center justify-center rounded border-2", value.inHub ? "border-gold bg-gold text-gold-foreground" : "border-border")}>{value.inHub && <Check className="h-3.5 w-3.5" />}</span>
        </button>
        <ImageField url={value.imageUrl} onUrl={(u) => onChange({ ...value, imageUrl: u })} />
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Название (Лес / Болото / Горы)" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base" />
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Сложность (плашка у названия)</div>
          <div className="flex gap-1.5">
            {([{ v: null, label: "Нет", cls: "border-border text-muted-foreground" }, { v: "newbie", label: "Новичок", cls: "border-emerald-400/50 text-emerald-300" }, { v: "medium", label: "Средне", cls: "border-amber-400/50 text-amber-300" }, { v: "hard", label: "Сложно", cls: "border-rose-400/50 text-rose-300" }] as { v: Difficulty; label: string; cls: string }[]).map((d) => (
              <button key={String(d.v)} onClick={() => onChange({ ...value, difficulty: d.v })} className={cn("flex-1 rounded-lg border-2 py-2 text-xs font-bold transition", value.difficulty === d.v ? cn(d.cls, "bg-secondary/40") : "border-border/50 text-muted-foreground/60")}>{d.label}</button>
            ))}
          </div>
        </div>
        <button onClick={() => onChange({ ...value, active: !value.active })} className={cn("flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition", value.active ? "bg-neon/15 text-neon" : "bg-secondary text-muted-foreground")}><Power className="h-4 w-4" /> {value.active ? "Активна (в рейде)" : "Выключена"}</button>
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"><Gift className="h-3.5 w-3.5 text-gold" /> Пул наград турнира (по суммарному урону)</div>
        <RewardConfigEditor cfg={value.rewardConfig} onChange={(c) => onChange({ ...value, rewardConfig: c })} tokens={tokens.data ?? []} allowTickets={false} chipPacksOnly />
      </div>
      <button onClick={onSave} disabled={!value.name || saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 font-bold text-gold-foreground disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? "Сохраняю…" : "Сохранить"}</button>
    </Sheet>
  );
}
