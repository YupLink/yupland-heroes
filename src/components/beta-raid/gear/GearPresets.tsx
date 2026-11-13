// Полоса комплектов одежды: тап по чипу — надеть весь набор разом.
//
// Жалоба игрока (11.09): «постоянно менять комплекты вручную, очень много
// времени трачу». Один и тот же боевой набор собирался по слотам каждый раз.
//
// Компонент самодостаточный (свои запросы и свой инвалидатор), потому что
// стоит в ДВУХ местах — вкладке замка и окне героя с карты, как и кнопка
// «Надеть лучшее». Живи мутации снаружи, у каждого окна была бы своя копия
// правила «что перечитать после переодевания».
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import {
  applyGearPreset,
  deleteGearPreset,
  listGearPresets,
  renameGearPreset,
  saveGearPreset,
} from "@/server/api/heroes-gear-presets";
import { GearPresetEditModal } from "./GearPresetEditModal";

export const GEAR_PRESETS_KEY = ["my-gear-presets"] as const;

export function GearPresets({ disabled = false, inactiveHero = false, beforeAction, referenceLayout = false }: { disabled?: boolean; inactiveHero?: boolean; beforeAction?: () => Promise<void>; referenceLayout?: boolean }) {
  const t = useT();
  const lang = useLang();
  const wallet = useAppStore(s => s.walletAddress);
  const pinStorageKey = `yuplink-quick-gear-presets:${wallet ?? "local"}`;
  const qc = useQueryClient();
  // null — окно закрыто, "new" — создаём, иначе правим этот комплект.
  const [edit, setEdit] = useState<{ id: string; name: string } | null | "new">(null);
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(pinStorageKey) || "[]") as string[]; } catch { return []; }
  });

  useEffect(() => {
    try { setPinnedIds(JSON.parse(localStorage.getItem(pinStorageKey) || "[]") as string[]); } catch { setPinnedIds([]); }
  }, [pinStorageKey]);

  useEffect(() => { if (disabled) setEdit(null); }, [disabled]);

  const q = useQuery({ queryKey: GEAR_PRESETS_KEY, queryFn: () => listGearPresets() });
  const list = q.data ?? [];
  const pinned = pinnedIds.length ? list.filter(p => pinnedIds.includes(p.id)).slice(0, 3) : list.slice(0, 3);
  const others = list.filter(p => !pinned.some(quick => quick.id === p.id));
  const normalizedSearch = search.trim().toLocaleLowerCase(lang);
  const visibleOthers = normalizedSearch ? others.filter(p => p.name.toLocaleLowerCase(lang).includes(normalizedSearch)) : others;
  const togglePin = (id: string) => {
    const current = pinnedIds.length ? pinnedIds : list.slice(0, 3).map(p => p.id);
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current.slice(-2), id];
    setPinnedIds(next);
    try { localStorage.setItem(pinStorageKey, JSON.stringify(next)); } catch { /* Private browsing: keep this session's choice. */ }
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: GEAR_PRESETS_KEY, refetchType: "all" });
  };

  const apply = useMutation({
    mutationFn: async (id: string) => { await beforeAction?.(); return applyGearPreset({ data: { id } }); },
    onSuccess: (res) => {
      // Про пропавшее говорим честно: предмет могли продать или сжечь, и
      // молчаливо надетая половина комплекта читается как поломка.
      const lost = res.missing + res.skipped;
      toast.success(
        lost > 0
          ? t("braid.preset_applied_partial", { name: res.name, n: res.equipped, lost })
          : t("braid.preset_applied", { name: res.name, n: res.equipped }),
      );
      // Сломанные не надеваются (§8.63 п.3) — говорим, куда с ними идти.
      if (res.broken > 0) toast.warning(t("artbroken.preset_skipped", { n: res.broken }));
      // Свежие слоты+статы кладём в кэш СРАЗУ — числа героя меняются в тот же
      // кадр, не дожидаясь сетевого рефетча (жалоба: «хар-ки не меняются быстро
      // после смены комплекта»). Инвалидация ниже добьёт остальные ключи
      // (карта, карточка) и сверит сам gear с сервером.
      if (res.gear) qc.setQueryData(["my-hero-gear"], res.gear);
      // Расширенный invalidate: серверная сторона уже пересчитала heroPower
      // и энергию, теперь клиенту нужно перечитать и «my-energy» (max/regen
      // после смены интеллекта), и открытое окно боя (beta-encounter*), и
      // верхнюю плашку статуса (yupland-status). Без этого игрок ещё видит
      // прежний максимум энергии и лупит боссу по прежним статам.
      invalidateHeroQueries(qc, [
        "my-energy",
        "beta-encounter",
        "beta-encounter-top",
        "yupland-status",
      ]);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const save = useMutation({
    mutationFn: async (v: { name: string; id?: string }) => { await beforeAction?.(); return saveGearPreset({ data: v }); },
    onSuccess: (res) => {
      toast.success(t("braid.preset_saved", { name: res.name, n: res.total }));
      setEdit(null);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const rename = useMutation({
    mutationFn: (v: { id: string; name: string }) => renameGearPreset({ data: v }),
    onSuccess: () => {
      toast.success(t("braid.preset_renamed"));
      setEdit(null);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteGearPreset({ data: { id } }),
    onSuccess: () => {
      toast.success(t("braid.preset_deleted"));
      setEdit(null);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const busy = apply.isPending || save.isPending || rename.isPending || remove.isPending;
  const editing = edit === "new" ? null : edit;
  const renderPreset = (p: (typeof list)[number], inOtherList = false) => (
    <div key={p.id} data-preset-row data-preset-other={inOtherList || undefined} data-preset-pinned={pinned.some(quick => quick.id === p.id) || undefined} className="flex items-center gap-1 rounded-xl border border-border bg-card pl-1.5 pr-1">
      <button type="button" data-preset-pin onClick={() => togglePin(p.id)} aria-label={pinned.some(quick => quick.id === p.id) ? (lang === "ru" ? "Открепить комплект" : "Unpin set") : (lang === "ru" ? "Закрепить для быстрого доступа" : "Pin for quick access")} aria-pressed={pinned.some(quick => quick.id === p.id)}><Bookmark size={16} fill={pinned.some(quick => quick.id === p.id) ? "currentColor" : "none"} /></button>
      <button data-game-button="surface" type="button" onClick={() => apply.mutate(p.id)} disabled={disabled || busy} aria-label={`${p.name}. ${lang === "ru" ? `Предметов в комплекте: ${p.total}. Доступно: ${p.have}.` : `Items in set: ${p.total}. Available: ${p.have}.`}`} className="flex min-w-0 items-center gap-1.5 py-1.5 text-left disabled:opacity-40">
        <span data-preset-name className="min-w-0 truncate text-xs font-semibold">{p.name}</span>
        {p.have < p.total && <span data-preset-missing className="shrink-0 text-[10px] text-muted-foreground">{lang === "ru" ? "Не хватает вещей" : "Items missing"}</span>}
      </button>
      <button data-game-button="legacy" type="button" disabled={disabled || busy} onClick={() => setEdit({ id: p.id, name: p.name })} aria-label={t("braid.preset_edit")} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground disabled:opacity-40"><Pencil className="h-3 w-3" /></button>
    </div>
  );

  return (
    <div data-gear-presets data-reference-layout={referenceLayout} className="rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("braid.presets_title")}
        </span>
        <button data-game-button="legacy" data-save-gear-set
          type="button"
          onClick={() => setEdit("new")}
          disabled={disabled || busy}
          className="inline-flex items-center gap-1 rounded-lg border border-gold/50 px-2 py-1 text-[11px] font-semibold text-gold disabled:opacity-40"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          {lang === "ru" ? "Сохранить комплект" : "Save set"}
        </button>
      </div>

      {inactiveHero && <p role="note" className="mb-2 text-xs leading-relaxed text-muted-foreground">{lang === "ru" ? "Смена комплектов и экипировки доступна только у активного героя." : "Changing sets and equipment is available only for the active hero."}</p>}

      {q.isPending ? (
        <div className="grid place-items-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : q.isError ? (
        <div role="alert" className="text-xs"><p>{lang === "ru" ? "Не удалось загрузить комплекты." : "Unable to load sets."}</p><button data-game-button="secondary" type="button" className="min-h-11 text-gold" onClick={() => void q.refetch()}>{lang === "ru" ? "Повторить" : "Retry"}</button></div>
      ) : list.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("braid.presets_empty")}</p>
      ) : (
        <div data-preset-list>
          <div data-preset-quick className="flex flex-wrap gap-1.5">{pinned.map(p => renderPreset(p))}</div>
          {others.length > 0 && <button data-preset-others type="button" aria-expanded={expanded} onClick={() => { setExpanded(value => !value); setSearch(""); }}><span>{lang === "ru" ? "Другие комплекты" : "Other sets"} · {others.length}</span><ChevronDown size={18} aria-hidden="true" /></button>}
          {expanded && others.length > 0 && <div data-preset-others-panel>
            {others.length > 6 && <input data-preset-search type="search" value={search} onChange={event => setSearch(event.target.value)} aria-label={lang === "ru" ? "Найти комплект" : "Find set"} placeholder={lang === "ru" ? "Найти комплект" : "Find set"} />}
            <div data-preset-others-list>{visibleOthers.length ? visibleOthers.map(p => renderPreset(p, true)) : <p role="status" data-preset-no-results>{lang === "ru" ? "Комплекты не найдены" : "No sets found"}</p>}</div>
          </div>}
        </div>
      )}

      {edit !== null && !disabled && (
        <GearPresetEditModal
          preset={editing}
          busy={busy}
          onSave={(name) =>
            editing ? rename.mutate({ id: editing.id, name }) : save.mutate({ name })
          }
          onOverwrite={() => editing && save.mutate({ name: editing.name, id: editing.id })}
          onDelete={() => editing && remove.mutate(editing.id)}
          pinned={Boolean(editing && pinned.some(p => p.id === editing.id))}
          onTogglePin={() => { if (editing) togglePin(editing.id); setEdit(null); }}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}
