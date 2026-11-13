import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { getBetaRaidState } from "@/server/api/beta-raid/move";
import { getCastleTemple, prayCastleTemple, upgradeCastleTemple } from "@/server/api/castle-temple";
import {
  COOLDOWN_HOURS, EXTENDED_MINUTES, PRAYER_MINUTES, RESOURCES, TEMPLE_STATS,
  bonusValue, prayerPlan, slotsAt, type TempleStat,
} from "@/lib/castleTemple";
import { RES_ICON, RES_LABEL, StatGlyph, TEMPLE_KEY, statName } from "./templeUi";
import { TempleActivePrayer, type TemplePrayerCard } from "./TempleActivePrayer";
import { TempleNotOwned } from "./TempleNotOwned";
import { useEntryRules } from "@/hooks/useEntryRules";
import "./temple-live.css";

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const cooldownClock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${clock(seconds % 3600)}`;
};
const fmt = (n: number, ru: boolean) => n.toLocaleString(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 1 });
const columns = [TEMPLE_STATS.slice(0, 4), TEMPLE_STATS.slice(4)];
const prayerSnapshotKey = "castle-temple-last-prayer-view";
const dismissedPrayerKey = "castle-temple-dismissed-prayer";
type PrayerSnapshot = { startedAt: number; seconds: number; bonuses: TemplePrayerCard["bonuses"] };
const readSnapshot = (): PrayerSnapshot | null => {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(prayerSnapshotKey) ?? "null") as PrayerSnapshot | null;
    return value && Number.isFinite(value.startedAt) && Number.isFinite(value.seconds) && Array.isArray(value.bonuses) ? value : null;
  } catch { return null; }
};

export function TempleLiveWindow({ ru, onBack }: { ru: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: TEMPLE_KEY, queryFn: () => getCastleTemple(), staleTime: 15_000 });
  const effects = useQuery({ queryKey: ["beta-raid-state"], queryFn: () => getBetaRaidState(), enabled: Boolean(q.data?.prayAt), staleTime: 0 });
  const stars = useEntryRules().stars; // §8.127: продление за звёзды — только с Telegram
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<TempleStat[]>([]);
  const [extend, setExtend] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PrayerSnapshot | null>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setDismissedId(window.localStorage.getItem(dismissedPrayerKey));
    setSnapshot(readSnapshot());
  }, []);
  useEffect(() => { if (picked.length < 2 && extend) setExtend(false); }, [picked.length, extend]);
  useEffect(() => { if (!hint) return; const timer = window.setTimeout(() => setHint(false), 1600); return () => window.clearTimeout(timer); }, [hint]);

  const t = q.data;
  const wait = Math.max(0, (t?.prayAt ?? 0) - now);
  const points = t?.points ?? ({} as Record<TempleStat, number>);
  const plan = prayerPlan(picked, points, extend);
  const currentPrayerId = t?.prayAt ? String(t.prayAt) : null;
  const startedAt = t?.prayAt ? t.prayAt - COOLDOWN_HOURS * 3600_000 : 0;
  const saved = snapshot && Math.abs(snapshot.startedAt - startedAt) < 60_000 ? snapshot : null;
  // getBetaRaidState already returns live effects with their source and expiry.
  // The current server permits one prayer; keep the card list shape for a later parallel API.
  const buffs = (effects.data?.effects?.buff ?? []).filter(effect =>
    effect.source === "castle_temple" && effect.kind.startsWith("buff_") &&
    TEMPLE_STATS.includes(effect.kind.slice(5) as TempleStat));
  const prayerCards: TemplePrayerCard[] = t?.prayAt && currentPrayerId !== dismissedId && (buffs.length > 0 ||
    (effects.isSuccess && now >= startedAt + (saved?.seconds ?? EXTENDED_MINUTES * 60) * 1000)) ? [{
    id: currentPrayerId!,
    startedAt,
    endsAt: buffs.length ? Math.max(...buffs.map(effect => Date.parse(effect.expiresAt))) : startedAt + (saved?.seconds ?? EXTENDED_MINUTES * 60) * 1000,
    bonuses: buffs.length ? buffs.map(effect => ({ stat: effect.kind.slice(5) as TempleStat, value: effect.value })) : saved?.bonuses ?? [],
  }] : [];
  const dismissPrayer = (id: string) => { window.localStorage.setItem(dismissedPrayerKey, id); setDismissedId(id); };

  const pray = useMutation({
    mutationFn: () => prayCastleTemple({ data: { stats: picked, extend: plan.extended, opId: newOpId() } }),
    onSuccess: result => {
      const view: PrayerSnapshot = { startedAt: Date.now(), seconds: result.plan.secondsEach, bonuses: result.plan.bonuses.map(bonus => ({ stat: bonus.stat, value: bonus.value })) };
      window.localStorage.setItem(prayerSnapshotKey, JSON.stringify(view));
      setSnapshot(view);
      toast.success(ru ? "Храм услышал молитву" : "The temple heard your prayer");
      setConfirming(false);
      setPicked([]);
      window.localStorage.removeItem(dismissedPrayerKey);
      setDismissedId(null);
      void qc.invalidateQueries({ queryKey: TEMPLE_KEY });
      void qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      if (plan.extended) void qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    },
    onError: (error: Error) => toast.error(humanError(error)),
  });
  const upgrade = useMutation({
    mutationFn: () => upgradeCastleTemple({ data: { fromLevel: t!.level, opId: newOpId() } }),
    onSuccess: result => {
      toast.success(ru ? `Храм — уровень ${result.level}` : `Temple — level ${result.level}`);
      void qc.invalidateQueries({ queryKey: TEMPLE_KEY });
      void qc.invalidateQueries({ queryKey: ["my-resources"] });
    },
    onError: (error: Error) => toast.error(humanError(error)),
  });

  if (q.isPending) return <p role="status" className="p-8 text-center">{ru ? "Загрузка…" : "Loading…"}</p>;
  if (q.isError || !t) return <div className="p-8 text-center"><p role="alert">{ru ? "Не удалось открыть храм." : "Unable to open the temple."}</p><button type="button" className="mt-3 min-h-11 rounded-xl border px-4" onClick={() => void q.refetch()}>{ru ? "Повторить" : "Retry"}</button></div>;
  // Храм покупается в Ратуше (§8.64): нет храма — карточка покупки.
  if (!t.owned) return <TempleNotOwned ru={ru} onBack={onBack} />;
  const cost = t.cost;
  const need = cost ? RESOURCES.filter(resource => cost[resource] > 0) : [];
  const short = !!cost && need.some(resource => (t.resources[resource] ?? 0) < cost[resource]);
  const toggle = (stat: TempleStat) => setPicked(current => current.includes(stat)
    ? current.filter(item => item !== stat)
    : current.length < t.slots ? [...current, stat] : current);
  return <main className="temple-live" style={{ backgroundImage: 'linear-gradient(180deg,rgba(4,6,13,.07),rgba(4,6,13,.25)),url("/temple/prayer-interior.webp")' }}>
    <div className="temple-live-content">
      <header className="temple-live-head">
        <button type="button" className="temple-live-back" onClick={onBack}>{ru ? "← Замок" : "← Castle"}</button>
        <div className="temple-live-title"><h1>{ru ? "Храм" : "Temple"}</h1><span>{t.level}/{t.maxLevel}</span></div>
      </header>
      <section className="temple-live-panel" aria-label={ru ? "Храм" : "Temple"}>
        <div className="temple-live-section-head"><h2>{ru ? "Молитва" : "Prayer"}</h2>{wait === 0 && <span>{picked.length}/{t.slots} <Clock3 size={19} aria-hidden="true" /> {plan.totalMinutes} {ru ? "мин" : "min"}</span>}</div>
        {prayerCards.length > 0 && <TempleActivePrayer prayers={prayerCards} ru={ru} onDismiss={dismissPrayer} />}
        {effects.isError && wait > 0 && <p role="alert" className="temple-live-notice">{ru ? "Не удалось обновить бонус." : "Could not load the bonus."} <button type="button" onClick={() => void effects.refetch()}>{ru ? "Повторить" : "Retry"}</button></p>}
        <div className="temple-live-options" aria-label={ru ? "Выбрать бонус молитвы" : "Choose prayer bonus"}>
          {columns.map((column, index) => <div className="temple-live-column" key={index}>{column.map(stat => {
            const value = bonusValue(stat, points[stat] ?? 0);
            const chosen = picked.includes(stat) || (wait > 0 && buffs.some(buff => buff.kind === `buff_${stat}`));
            return <button key={stat} type="button" className={`temple-live-option${chosen ? " is-selected" : ""}`}
              aria-label={`${statName(stat, ru)} +${value}`} aria-pressed={chosen} title={statName(stat, ru)}
              disabled={wait > 0 || !t.atCastle || confirming || value <= 0 || (!chosen && picked.length >= t.slots)}
              onClick={() => toggle(stat)}>
              <StatGlyph stat={stat} className="h-7 w-7" /><span className="temple-live-option-name">{statName(stat, ru)}</span><strong>+{value}</strong>{chosen && <Check className="temple-live-check" size={18} aria-hidden="true" />}
            </button>;
          })}</div>)}
        </div>
        {stars && picked.length >= 2 && wait === 0 && <button type="button" className={cn("temple-live-extend", extend && "is-selected")} aria-pressed={extend} onClick={() => setExtend(!extend)}><Clock3 size={17} aria-hidden="true" />+{EXTENDED_MINUTES - PRAYER_MINUTES} {ru ? "мин" : "min"} · {t.extendStars} ★</button>}
        {picked.length > 0 && !confirming && wait === 0 && <div className="temple-live-result">{plan.bonuses.map(bonus => <span className="temple-live-result-stat" key={bonus.stat}><StatGlyph stat={bonus.stat} className="h-5 w-5" />{statName(bonus.stat, ru)} <b>+{bonus.value}</b></span>)}<span className="temple-live-result-time"><Clock3 size={19} aria-hidden="true" />{clock(plan.secondsEach)}</span></div>}
        {confirming ? <div className="temple-live-confirm" role="group" aria-label={ru ? "Подтверждение молитвы" : "Confirm prayer"}>
          <h3>{ru ? "Подтвердить молитву?" : "Confirm prayer?"}</h3>
          <div className="temple-live-confirm-actions"><button type="button" className="temple-live-secondary" onClick={() => setConfirming(false)}>{ru ? "Отмена" : "Cancel"}</button><button type="button" className="temple-live-gold" disabled={pray.isPending} onClick={() => pray.mutate()}>{pray.isPending ? "…" : ru ? "Подтвердить" : "Confirm"}</button></div>
        </div> : <button type="button" className="temple-live-gold temple-live-main-action" disabled={wait > 0 || !t.atCastle || pray.isPending}
          onClick={() => { if (plan.bonuses.length) setConfirming(true); else { setHint(true); toast.info(ru ? `Выберите бонус — до ${t.slots}` : `Pick a bonus — up to ${t.slots}`); } }}>
          {wait > 0 ? `${ru ? "Помолиться" : "Pray"} · ${cooldownClock(wait)}` : !t.atCastle ? (ru ? "Герой не в замке" : "Hero is away") : ru ? "Помолиться" : "Pray"}
        </button>}
        {hint && <p className="temple-live-notice" role="status">{ru ? "Выбери бонус молитвы" : "Choose a prayer bonus"}</p>}
        <div className="temple-live-divider" aria-hidden="true"><span>✦</span></div>
        {cost ? <>
          <button className="temple-live-upgrade-toggle" type="button" aria-expanded={upgradeOpen} onClick={() => setUpgradeOpen(!upgradeOpen)}><span>{ru ? "Улучшить храм" : "Upgrade temple"}</span><span>{t.level} → {t.level + 1} <ChevronDown size={18} aria-hidden="true" /></span></button>
          {upgradeOpen && <div className="temple-live-upgrade-details">
            <p className="temple-live-upgrade-caption">{ru ? `Уровень ${t.level + 1} даст:` : `Level ${t.level + 1} gives:`}</p>
            <div className="temple-live-gains">{TEMPLE_STATS.map(stat => <span key={stat} className="temple-live-gain" title={statName(stat, ru)}><StatGlyph stat={stat} className="h-5 w-5" /><b>+{bonusValue(stat, t.level + 1) - bonusValue(stat, t.level)}</b></span>)}</div>
            <p className="temple-live-upgrade-rule">{ru ? "Бонусов в одной молитве" : "Bonuses per prayer"}: {slotsAt(t.level)} → {slotsAt(t.level + 1)}</p>
            <p className="temple-live-upgrade-rule">{ru ? "Молитв одновременно: 1" : "Simultaneous prayers: 1"}</p>
            <div className="temple-live-costs">{need.map(resource => <span key={resource} className="temple-live-cost"><img src={RES_ICON[resource]} alt={RES_LABEL[resource][ru ? 0 : 1]} /><strong>{fmt(cost[resource], ru)}</strong><span>/ {fmt(t.resources[resource] ?? 0, ru)}</span></span>)}</div>
            <button type="button" className="temple-live-gold temple-live-main-action" disabled={short || upgrade.isPending} onClick={() => upgrade.mutate()}>{upgrade.isPending ? "…" : ru ? "Улучшить" : "Upgrade"}</button>
            {short && <p className="temple-live-notice">{ru ? "Не хватает ресурсов" : "Not enough resources"}</p>}
          </div>}
        </> : <div className="temple-live-max-level" role="status">{ru ? "Максимальный уровень" : "Maximum level"}</div>}
      </section>
    </div>
  </main>;
}
