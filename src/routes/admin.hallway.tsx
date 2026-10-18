// Прихожа v2 · админ-конфиг. По просьбе владельца упрощён до УПРАВЛЕНИЯ
// КАРТИНКАМИ: картинки фишек по звёздам (только прихожа) + картинки уровней.
// Числовые настройки (тап/реген/сундук/марафон/выпуск/босс) убраны из UI —
// их значения остаются в БД (Save шлёт полный конфиг без изменений).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Upload,
  DoorOpen,
  Star,
  CalendarCheck,
  Sparkles,
  ChevronsUp,
  Box,
  Hand,
  Trophy,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adminGetHallwayConfig,
  adminUpdateHallwayConfig,
} from "@/server/api/hallwayConfig";

export const Route = createFileRoute("/admin/hallway")({
  component: AdminHallway,
});

type Cfg = Record<string, unknown>;
const STARS = ["1", "1.5", "2", "2.5", "3"] as const;

async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const j = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || j.error || !j.url) throw new Error(j.error ?? "upload failed");
  return j.url;
}

// deep get/set по пути "a.b.c"
function dget(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((c, k) => (c as Cfg)?.[k], o);
}
function dset(o: Cfg, path: string, v: unknown): Cfg {
  const c = JSON.parse(JSON.stringify(o)) as Cfg;
  const parts = path.split(".");
  let cur = c;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] == null)
      cur[parts[i]] = {};
    cur = cur[parts[i]] as Cfg;
  }
  cur[parts[parts.length - 1]] = v;
  return c;
}

// Топ-левел, чтобы инпут не ремаунтился на каждый ввод (иначе теряется фокус).
function NumField({
  label,
  value,
  onChange,
  step,
  w = "w-24",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  w?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          w,
          "rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm outline-none focus:border-gold/50"
        )}
      />
    </label>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <span className="text-gold">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ImageUpload({ onDone }: { onDone: (url: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Upload className="h-3 w-3" />
        )}
        Загрузить
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            onDone(await uploadFile(f));
            toast.success("Загружено");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function AdminHallway() {
  const qc = useQueryClient();
  const cfgQ = useQuery({
    queryKey: ["admin-hallway-config"],
    queryFn: () => adminGetHallwayConfig(),
  });

  const [cfg, setCfg] = useState<Cfg | null>(null);
  useEffect(() => {
    if (cfgQ.data) setCfg(cfgQ.data as Cfg);
  }, [cfgQ.data]);

  const save = useMutation({
    mutationFn: (c: Cfg) => adminUpdateHallwayConfig({ data: c }),
    onSuccess: () => {
      toast.success("Конфиг сохранён");
      qc.invalidateQueries({ queryKey: ["admin-hallway-config"] });
    },
    onError: (e: Error) => toast.error(`Не сохранено: ${e.message}`),
  });

  if (!cfg) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const set = (path: string, v: unknown) => setCfg((c) => dset(c ?? {}, path, v));

  // ВАЖНО: ключи звёзд ("1.5"/"2.5") содержат точку — dget/dset бьют путь по
  // точкам и ломают такие ключи. Поэтому картинки фишек читаем/пишем НАПРЯМУЮ
  // по литеральному ключу, минуя dot-path.
  const chipImg = (star: string): string | undefined => {
    const images = (cfg.images ?? {}) as Record<string, unknown>;
    const map = (images.chipByStar ?? {}) as Record<string, string>;
    return map[star];
  };
  // Картинки фишек СОХРАНЯЮТСЯ СРАЗУ (как уровни) — иначе терялись при перезагрузке,
  // если забыть верхний «Сохранить». Обновляем стейт + тут же персистим весь конфиг.
  const setChipImg = (star: string, url: string) =>
    setCfg((c) => {
      const base = (c ?? {}) as Record<string, unknown>;
      const images = { ...((base.images ?? {}) as Record<string, unknown>) };
      const map = { ...((images.chipByStar ?? {}) as Record<string, string>) };
      if (url) map[star] = url;
      else delete map[star];
      images.chipByStar = map;
      const next = { ...base, images } as Cfg;
      // Персист вне фазы setState-updater'а (микротаск), с актуальным next.
      Promise.resolve().then(() => save.mutate(next));
      return next;
    });

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
          <DoorOpen className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">
            Прихожая · конфиг
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Изменения сохраняются сразу; где нужно утверждение — кнопка под блоком.
          </p>
        </div>
      </header>

      {/* Картинки фишек по звёздам (только прихожа) */}
      <Section title="Картинки фишек (звёзды)" icon={<Star className="h-4 w-4" />}>
        <p className="text-[11px] text-muted-foreground">
          Своя картинка для каждой фишки по звёздности. Показывается в инвентаре
          прихожи вместо иконки-звезды. Сохраняется сразу при загрузке.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STARS.map((s) => {
            const url = chipImg(s);
            return (
              <div
                key={s}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary/20 p-2.5"
              >
                <div className="text-xs font-bold">{s}★</div>
                {url ? (
                  <img src={url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-secondary/50">
                    <Star className="h-6 w-6 fill-gold text-gold" />
                  </div>
                )}
                <ImageUpload onDone={(u) => setChipImg(s, u)} />
                {url && (
                  <button
                    type="button"
                    onClick={() => setChipImg(s, "")}
                    className="text-[10px] text-muted-foreground hover:text-rose-400"
                  >
                    убрать
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Марафон 30 дней — как видят игроки, клик по дню = правка награды */}
      <MarathonBlock
        cfg={cfg}
        set={set}
        onSave={() => save.mutate(cfg)}
        saving={save.isPending}
      />

      {/* Остальная механика — кратко, справочно */}
      <MechanicSummary cfg={cfg} />
    </div>
  );
}

// ── Марафон: сетка 30 дней в стиле игрока (иконка типа + значение), клик по дню
// открывает компактную правку награды этого дня. ──
const MKIND: Record<string, { icon: () => React.ReactNode; label: string }> = {
  awareness: { icon: () => <Sparkles className="h-4 w-4 text-gold" />, label: "осознанность" },
  exp: { icon: () => <ChevronsUp className="h-4 w-4 text-neon" />, label: "опыт" },
  chest: { icon: () => <Box className="h-4 w-4 text-gold" />, label: "сундук" },
  chip: { icon: () => <Star className="h-4 w-4 fill-gold text-gold" />, label: "фишка" },
};

function MarathonBlock({
  cfg,
  set,
  onSave,
  saving,
}: {
  cfg: Cfg;
  set: (path: string, v: unknown) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const schedule = (((cfg.marathon as Cfg)?.schedule as Array<Cfg>) ?? []).slice();
  const [sel, setSel] = useState<number | null>(null);
  const selIdx = sel == null ? -1 : schedule.findIndex((d) => Number(d.day) === sel);
  const selDay = selIdx >= 0 ? schedule[selIdx] : null;

  const valueOf = (d: Cfg) =>
    d.kind === "awareness" || d.kind === "exp"
      ? `+${Number(d.amount ?? 0)}`
      : d.kind === "chest"
        ? Number(d.count ?? 1) > 1
          ? `×${Number(d.count)}`
          : "1"
        : `${Number(d.star ?? 0)}★`;

  return (
    <Section title="Марафон 30 дней" icon={<CalendarCheck className="h-4 w-4" />}>
      <p className="text-[11px] text-muted-foreground">
        Так видят игроки. Нажми день, чтобы изменить его награду. Потом — «Сохранить» вверху.
      </p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {schedule.map((d) => {
          const day = Number(d.day);
          const isChip = d.kind === "chip";
          const active = sel === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSel(active ? null : day)}
              title={`День ${day}`}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border transition",
                active
                  ? "border-gold bg-gold/15 ring-1 ring-gold/40"
                  : isChip
                    ? "border-gold/40 bg-gold/10 hover:border-gold/60"
                    : "border-border bg-secondary/40 hover:border-gold/40"
              )}
            >
              <span className="absolute left-1 top-0.5 text-[8px] leading-none text-muted-foreground">
                {day}
              </span>
              {(MKIND[String(d.kind)] ?? MKIND.awareness).icon()}
              <span
                className={cn(
                  "text-[10px] font-bold leading-none",
                  d.kind === "exp" ? "text-neon" : "text-gold"
                )}
              >
                {valueOf(d)}
              </span>
            </button>
          );
        })}
      </div>
      {/* Легенда — как у игроков */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {Object.values(MKIND).map((m) => (
          <span key={m.label} className="flex items-center gap-1">
            {m.icon()} {m.label}
          </span>
        ))}
      </div>
      {/* Правка выбранного дня */}
      {selDay && (
        <div className="space-y-2 rounded-xl border border-gold/30 bg-card p-3">
          <div className="text-xs font-bold">День {sel}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={String(selDay.kind)}
              onChange={(e) => set(`marathon.schedule.${selIdx}.kind`, e.target.value)}
              className="rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm"
            >
              <option value="awareness">осознанность</option>
              <option value="exp">опыт</option>
              <option value="chip">фишка</option>
              <option value="chest">сундук</option>
            </select>
            {selDay.kind === "chip" ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                звёзды
                <input
                  type="number"
                  step={0.5}
                  value={Number(selDay.star ?? 0)}
                  onChange={(e) => set(`marathon.schedule.${selIdx}.star`, Number(e.target.value))}
                  className="w-20 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm"
                />
              </label>
            ) : selDay.kind === "chest" ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                сундуков
                <input
                  type="number"
                  value={Number(selDay.count ?? 1)}
                  onChange={(e) => set(`marathon.schedule.${selIdx}.count`, Number(e.target.value))}
                  className="w-20 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm"
                />
              </label>
            ) : (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                сумма
                <input
                  type="number"
                  value={Number(selDay.amount ?? 0)}
                  onChange={(e) => set(`marathon.schedule.${selIdx}.amount`, Number(e.target.value))}
                  className="w-20 rounded-lg border border-border bg-secondary/40 px-2 py-1.5 text-sm"
                />
              </label>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="mt-1 inline-flex items-center gap-1.5 self-start rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground shadow-gold disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Сохранить марафон
      </button>
    </Section>
  );
}

// ── Остальная механика: только упоминание + ключевые значения (справочно). ──
function MechanicSummary({ cfg }: { cfg: Cfg }) {
  const tap = (cfg.tap ?? {}) as Record<string, unknown>;
  const regen = (cfg.regen ?? {}) as Record<string, unknown>;
  const chest = (cfg.chest ?? {}) as Record<string, unknown>;
  const chip = (chest.chip ?? {}) as Record<string, unknown>;
  const release = (cfg.release ?? {}) as Record<string, unknown>;
  const boss = (cfg.boss ?? {}) as Record<string, unknown>;
  const n = (v: unknown, d = 0) => Number(v ?? d);
  const rows: Array<{ icon: React.ReactNode; title: string; text: string }> = [
    {
      icon: <Hand className="h-4 w-4 text-gold" />,
      title: "Тап и реген",
      text: `${n(tap.baseAwareness, 1)} осознанности за тап × множитель звёзд · реген +${n(regen.perStarPerMin, 1)}/мин за звезду · работает топ-${n(regen.topN, 10)} фишек`,
    },
    {
      icon: <Box className="h-4 w-4 text-gold" />,
      title: "Сундук (гача)",
      text: `старт ${n(chest.basePrice)}, +${n(chest.priceGrowthPct)}%/ролл · с L${n(chip.unlockLevel, 5)} выпадают фишки (${n(chip.totalChancePct)}%)`,
    },
    {
      icon: <Trophy className="h-4 w-4 text-gold" />,
      title: "Выпуск и босс",
      text: `${n(release.requiredTopChips, 10)} фишек в топ → выпуск · триал-статы ×${n(boss.trialStatScale, 0.5)} · «Тираж»: ${boss.tirageBonusEnabled ? "ВКЛ" : "выкл"}`,
    },
  ];
  return (
    <Section title="Остальная механика" icon={<Info className="h-4 w-4" />}>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.title}
            className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/20 p-3"
          >
            <span className="mt-0.5 shrink-0">{r.icon}</span>
            <div>
              <div className="text-xs font-bold">{r.title}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {r.text}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Значения справочно. Тонкая настройка этих чисел — по запросу.
      </p>
    </Section>
  );
}
