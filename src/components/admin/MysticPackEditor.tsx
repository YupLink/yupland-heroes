import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Loader2 } from "lucide-react";
import {
  adminCreateMysticPack,
  adminListMysticPacks,
  adminUpdateMysticPack,
} from "@/server/api/mystic";
import {
  adminListChipPacks,
} from "@/server/api/chips-admin";
import { adminListItems } from "@/server/api/items";
import { MysticItemPrizeSelect } from "./MysticItemPrizeSelect";
import { ImageUploader } from "@/components/ImageUploader";
import { humanError } from "@/lib/humanError";
import { KIND_META, type MysticTier } from "@/components/mysticShared";
import {
  AMOUNT_KINDS,
  MYSTIC_EDITOR_KINDS,
  MYSTIC_TOKENS,
  amountRangeText,
  isFractionalKind,
  parseAmountRange,
} from "@/lib/mysticKinds";
import { CustomItemGrid, RewardResourceSelect } from "./reward/RewardKindPickers";

type BoxDef = {
  id: string;
  name: string;
  coverImageUrl: string | null;
  active: boolean;
  pool: MysticTier[];
  weightSum: number;
  blankPct: number;
};

export function CreateForm({
  initial,
  onDone,
}: {
  initial: BoxDef | null;
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [cover, setCover] = useState<string | null>(initial?.coverImageUrl ?? null);
  const [pool, setPool] = useState<MysticTier[]>(
    initial && initial.pool.length > 0
      ? (initial.pool as MysticTier[])
      : [{ kind: "energy", weight: 30, amountMin: 10, amountMax: 30 }]
  );
  const sum = pool.reduce((s, t) => s + (Number(t.weight) || 0), 0);

  useQuery({ queryKey: ["admin-items", "artifact"], queryFn: () => adminListItems({ data: { kind: "artifact" } }) });
  useQuery({ queryKey: ["admin-items", "hero"], queryFn: () => adminListItems({ data: { kind: "hero" } }) });

  const normPool = () =>
    pool.map((t) => ({
      ...t,
      weight: Number(t.weight) || 0,
      amountMin: AMOUNT_KINDS.includes(t.kind) && t.amountMin != null ? Number(t.amountMin) : undefined,
      amountMax: AMOUNT_KINDS.includes(t.kind) && t.amountMax != null ? Number(t.amountMax) : undefined,
      heroMinLevel: t.heroMinLevel != null ? Number(t.heroMinLevel) : undefined,
    }));

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? adminUpdateMysticPack({ data: { id: initial!.id, name: name.trim(), coverImageUrl: cover ?? null, pool: normPool() } })
        : adminCreateMysticPack({ data: { name: name.trim(), coverImageUrl: cover || undefined, pool: normPool() } }),
    onSuccess: () => { toast.success(isEdit ? "Бокс сохранён" : "Мистический бокс создан"); onDone(); },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const setTier = (i: number, patch: Partial<MysticTier>) =>
    setPool((p) => p.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className="space-y-4 rounded-2xl border border-gold/30 bg-card/60 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название бокса (напр. Old magical house)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50" />
        <div className="w-full sm:w-40"><ImageUploader value={cover} onChange={setCover} placeholder="Обложка" /></div>
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Пул призов</div>
        {pool.map((t, i) => (
          <TierEditor key={i} t={t} onChange={(patch) => setTier(i, patch)} onRemove={() => setPool((p) => p.filter((_, j) => j !== i))} />
        ))}
      </div>
      <button onClick={() => setPool((p) => [...p, { kind: "tickets", weight: 15, amountMin: 5, amountMax: 20 }])} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> Добавить приз
      </button>
      <div className="flex items-center justify-between border-t border-border/60 pt-3">
        <div className="text-[11px] text-muted-foreground">Сумма шансов {Math.round(sum)}% · «пусто» {Math.max(0, Math.round(100 - sum))}%</div>
        <div className="flex gap-2">
          <button onClick={onDone} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">Отмена</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || pool.length === 0} className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-background transition active:scale-95 disabled:opacity-50">
            {save.isPending ? "Сохраняю…" : isEdit ? "Сохранить" : "Создать бокс"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TierEditor({
  t, onChange, onRemove,
}: {
  t: MysticTier;
  onChange: (patch: Partial<MysticTier>) => void;
  onRemove: () => void;
}) {
  const kinds = MYSTIC_EDITOR_KINDS.includes(t.kind) ? MYSTIC_EDITOR_KINDS : [...MYSTIC_EDITOR_KINDS, t.kind];
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="mb-2 flex items-start gap-2">
        <div className="flex flex-1 flex-wrap gap-1">
          {kinds.map((k) => {
            const km = KIND_META[k];
            const Icon = km.icon;
            const on = t.kind === k;
            return (
              <button key={k} onClick={() => onChange({ kind: k })} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition", on ? "text-background" : "text-muted-foreground")} style={on ? { background: km.color, borderColor: km.color } : { borderColor: km.color + "44" }}>
                <Icon className="h-3 w-3" /> {km.label}
              </button>
            );
          })}
        </div>
        <button onClick={onRemove} className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          шанс %
          <input type="number" value={t.weight} onChange={(e) => onChange({ weight: Number(e.target.value) || 0 })} className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs" />
        </label>
        {AMOUNT_KINDS.includes(t.kind) && (
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            кол-во
            <RangeField
              key={t.kind}
              value={amountRangeText(t.amountMin, t.amountMax)}
              fractional={isFractionalKind(t.kind)}
              onChange={(min, max) => onChange({ amountMin: min, amountMax: max })}
            />
          </label>
        )}
        {t.kind === "pack" && (
          <div className="min-w-[200px] flex-1"><ChipPackSelect value={t.packId ?? ""} onChange={(v) => onChange({ packId: v })} /></div>
        )}
        {(t.kind === "artifact" || t.kind === "hero") && (
          <div className="min-w-[200px] flex-1"><MysticItemPrizeSelect kind={t.kind} t={t} onChange={onChange} /></div>
        )}
        {t.kind === "resource" && (
          <RewardResourceSelect value={t.resource} onChange={(r) => onChange({ resource: r })} />
        )}
        {t.kind === "token" && (
          <div className="flex gap-1">
            {MYSTIC_TOKENS.map((tok) => (
              <button key={tok} type="button" onClick={() => onChange({ token: tok })} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", t.token === tok ? "border-gold bg-gold/15 text-gold" : "border-border text-muted-foreground")}>
                {tok === "Darai" ? "DARAI" : tok === "STARS" ? "Stars" : tok}
              </button>
            ))}
          </div>
        )}
      </div>
      {t.kind === "custom" && (
        <div className="mt-2 space-y-1.5">
          {/* «Любой товар» — какой именно, решается при открытии (04.11.2026) */}
          <button type="button" onClick={() => onChange(t.customAny ? { customAny: undefined } : { customAny: true, customId: undefined, customName: undefined })} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", t.customAny ? "border-gold bg-gold/15 text-gold" : "border-border text-muted-foreground")}>
            Любой товар
          </button>
          {!t.customAny && <CustomItemGrid itemId={t.customId} onPick={(id) => onChange({ customId: id, customName: undefined })} />}
        </div>
      )}
    </div>
  );
}

/** Количество одним полем: «10-30» или «7» (токены — с дробью: «0.5-2»). */
function RangeField({
  value, fractional, onChange,
}: {
  value: string;
  fractional: boolean;
  onChange: (min?: number, max?: number) => void;
}) {
  const [text, setText] = useState(value);
  return (
    <input
      value={text}
      placeholder="10-30"
      inputMode={fractional ? "decimal" : "numeric"}
      onChange={(e) => {
        setText(e.target.value);
        const r = parseAmountRange(e.target.value, fractional);
        onChange(r?.min, r?.max);
      }}
      className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs"
    />
  );
}

function ChipPackSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const packs = useQuery({ queryKey: ["admin", "chip-packs", "all"], queryFn: () => adminListChipPacks() });
  // Бокс тоже может выпасть из бокса.
  const boxes = useQuery({ queryKey: ["admin-mystic-packs"], queryFn: () => adminListMysticPacks(), staleTime: 60_000 });
  const list = (packs.data ?? []).filter((p) => p.active && (!p.exhausted || p.id === value));
  const boxList = (boxes.data ?? []).filter((b) => b.active || b.id === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold/50">
      <option value="">— выбери пак или бокс —</option>
      <optgroup label="Паки фишек">
        {list.map((p) => <option key={p.id} value={p.id}>{p.exhausted ? `${p.name} (исчерпан)` : p.name}</option>)}
      </optgroup>
      <optgroup label="Боксы">
        {boxList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </optgroup>
    </select>
  );
}
