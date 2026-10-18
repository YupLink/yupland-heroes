import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  adminCreateChipCollection,
  adminUpdateChipCollection,
  adminCreateChipTemplate,
  adminUpdateChipTemplate,
  adminDeleteChipTemplate,
} from "@/server/api/chips-admin";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Layers,
  Upload,
  X,
  Pencil,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

type CollectionData = {
  id: string;
  name: string;
  coverImageUrl: string | null;
  initialSupply: number;
  expandable: boolean;
  status: "active" | "sealed" | "archived";
  isPremium: boolean;
  templates: TemplateData[];
  mintedCount: number;
  availableToDrop: number;
  inGameCount: number;
  burnedCount: number;
};

type TemplateData = {
  id: string;
  templateNo: number;
  name: string;
  imageUrl: string;
  rarityHint: string | null;
};

export function CollectionForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: CollectionData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl ?? "");
  const [initialSupply, setInitialSupply] = useState(String(initial?.initialSupply ?? 10000));
  const expandable = true;
  const [status, setStatus] = useState<CollectionData["status"]>(initial?.status ?? "active");
  const [isPremium, setIsPremium] = useState(initial?.isPremium ?? false);

  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => { const fd = new FormData(); fd.append("file", file); const res = await fetch("/api/upload", { method: "POST", body: fd }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return ((await res.json()) as { url: string }).url; },
    onSuccess: (url) => { setCoverImageUrl(url); toast.success("Обложка загружена"); },
    onError: (e: Error) => toast.error(`Upload: ${e.message}`),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), coverImageUrl: coverImageUrl.trim() || undefined, initialSupply: Math.max(0, Number(initialSupply) || 0), expandable };
      if (initial) return adminUpdateChipCollection({ data: { id: initial.id, ...payload, status, isPremium } });
      return adminCreateChipCollection({ data: payload });
    },
    onSuccess: () => { toast.success(initial ? "Обновлено" : "Коллекция создана"); onSaved(); },
    onError: (e: Error) => { let msg = e.message; try { const p = JSON.parse(msg) as Array<{ message?: string }>; if (Array.isArray(p)) msg = p.map((x) => x.message).filter(Boolean).join("; "); } catch {} toast.error(msg || "Ошибка"); },
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-base font-bold"><Layers className="h-4 w-4 text-gold" />{initial ? `Редактирование «${initial.name}»` : "Новая коллекция"}</h3>
        <button onClick={onClose} title="Закрыть" aria-label="Закрыть" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Архетипы / Реликвии / Шестерёнки..." className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Обложка коллекции</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
          <div className="flex items-center gap-3">
            {coverImageUrl ? (
              <div className="relative">
                <div className="aspect-square h-16 w-16 overflow-hidden rounded-xl border border-border bg-background"><img src={coverImageUrl} alt="" className="h-full w-full object-cover" /></div>
                <button onClick={() => setCoverImageUrl("")} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending} className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50">
                {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {upload.isPending ? "Загружаем…" : "Загрузить"}
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Тираж</label>
            <input type="number" min={0} value={initialSupply} onChange={(e) => setInitialSupply(e.target.value)} className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50" />
            <p className="mt-1 text-[10px] text-muted-foreground">Сколько фишек может быть в обороте</p>
          </div>
          {initial && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Статус</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as CollectionData["status"])} className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm outline-none focus:border-gold/50">
                <option value="active">Продаётся</option>
                <option value="sealed">Закрыта (только торг)</option>
                <option value="archived">Архив</option>
              </select>
            </div>
          )}
        </div>
        {initial && (
          <button type="button" onClick={() => setIsPremium((v) => !v)} className={cn("flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-sm transition", isPremium ? "border-gold bg-gold/10 text-gold" : "border-border bg-secondary/40 text-muted-foreground")}>
            <span className="text-left">Премиум-коллекция<span className="block text-[11px] font-normal text-muted-foreground">+100% HP / +100% ATK к бонусу «Единство: Тираж»</span></span>
            <span className="shrink-0 font-bold">{isPremium ? "ВКЛ" : "выкл"}</span>
          </button>
        )}
        <button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {initial ? "Сохранить" : "Создать коллекцию"}
        </button>
      </div>
    </div>
  );
}

export function TemplateForm({
  collectionId,
  nextNo,
  initial,
  onClose,
  onSaved,
}: {
  collectionId: string;
  nextNo: number;
  initial?: TemplateData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templateNo, setTemplateNo] = useState(String(initial?.templateNo ?? nextNo));
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");

  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => { const fd = new FormData(); fd.append("file", file); const res = await fetch("/api/upload", { method: "POST", body: fd }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return ((await res.json()) as { url: string }).url; },
    onSuccess: (url) => { setImageUrl(url); toast.success("Арт загружен"); },
    onError: (e: Error) => toast.error(`Upload: ${e.message}`),
  });

  const save = useMutation({
    mutationFn: () => {
      if (initial) return adminUpdateChipTemplate({ data: { id: initial.id, imageUrl } });
      return adminCreateChipTemplate({ data: { collectionId, templateNo: Math.max(1, Number(templateNo) || nextNo), imageUrl: imageUrl || undefined } });
    },
    onSuccess: () => { toast.success(initial ? "Обновлено" : "Фишка создана"); onSaved(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const canSave = Number(templateNo) > 0;

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-border/50 bg-secondary/20 p-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold"><ImageIcon className="h-3.5 w-3.5 text-gold" />{initial ? `Фишка #${initial.templateNo}` : `Новая фишка #${templateNo}`}</h4>
        <button onClick={onClose} title="Закрыть" aria-label="Закрыть" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <div className="aspect-square h-16 w-16 overflow-hidden rounded-lg border border-border bg-background">
            {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="h-5 w-5" /></div>}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending} className="mt-1 inline-flex w-16 items-center justify-center gap-1 rounded-md border border-border bg-secondary/40 px-1 py-1 text-[10px] hover:bg-secondary disabled:opacity-50">
            {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}{upload.isPending ? "" : "Арт"}
          </button>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">#</span>
          <input type="number" min={1} value={templateNo} onChange={(e) => setTemplateNo(e.target.value)} placeholder="#" disabled={!!initial} className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-gold/50 disabled:opacity-50" />
        </div>
      </div>
      <button onClick={() => save.mutate()} disabled={!canSave || save.isPending} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md gradient-gold px-3 py-1.5 text-[11px] font-bold text-gold-foreground shadow-gold disabled:opacity-50">
        {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}{initial ? "Сохранить" : "Создать фишку"}
      </button>
    </div>
  );
}

export function TemplateCard({ template, onChanged }: { template: TemplateData; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const del = useMutation({
    mutationFn: () => adminDeleteChipTemplate({ data: { id: template.id } }),
    onSuccess: () => { toast.success("Удалён"); onChanged(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (editing) return <div className="col-span-2 sm:col-span-4"><TemplateForm collectionId="" nextNo={0} initial={template} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} /></div>;

  return (
    <div className="rounded-xl border border-border/50 bg-background p-2 transition hover:border-border/80">
      <div className="aspect-square w-full overflow-hidden rounded-lg border border-border bg-secondary/40">
        <img src={template.imageUrl} alt={template.name} className="h-full w-full object-cover" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] text-muted-foreground">#{template.templateNo}</span>
        {template.rarityHint && <span className="truncate text-[9px] text-muted-foreground" title={template.rarityHint}>{template.rarityHint}</span>}
      </div>
      {template.name && <div className="truncate text-[11px] font-medium">{template.name}</div>}
      <div className="mt-1.5 flex items-center gap-1">
        <button onClick={() => setEditing(true)} title="Редактировать" aria-label="Редактировать" className="inline-flex h-7 flex-1 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"><Pencil className="h-3 w-3" /></button>
        <button onClick={() => { if (confirm(`Удалить «${template.name}»?`)) del.mutate(); }} disabled={del.isPending} title="Удалить" aria-label="Удалить" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"><Trash2 className="h-3 w-3" /></button>
      </div>
    </div>
  );
}
