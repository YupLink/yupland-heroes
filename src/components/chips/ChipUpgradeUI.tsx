import { ArrowRight, X } from "lucide-react";
import { ChipImage } from "@/components/ChipImage";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { fmtTickets } from "@/components/chips/collectionsHelpers";
import { useLang } from "@/lib/i18n";
import "./chip-upgrade.css";

export const starLevel = (level: number) => `${Number.isInteger(level) ? level : level.toFixed(1).replace(".", ",")}★`;
export const levelNumber = (level: number) => Number.isInteger(level) ? String(level) : level.toFixed(1).replace(".", ",");

export function UpgradeShell({ title, onClose, children, dialogRef, busy = false, inactive = false, topLayer = false, compact = false, autoPlan = false }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  busy?: boolean;
  inactive?: boolean;
  topLayer?: boolean;
  compact?: boolean;
  autoPlan?: boolean;
}) {
  const ru = useLang() === "ru";
  return <div className={`chip-upgrade-overlay${inactive ? " is-inactive" : ""}${topLayer ? " is-top-layer" : ""}`} aria-hidden={inactive} onClick={() => { if (!busy) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`chip-upgrade${compact ? " is-compact" : ""}${autoPlan ? " is-auto-plan" : ""}`} onClick={e => e.stopPropagation()}>
      <div className="chip-upgrade__heading"><h2>{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label={ru ? "Закрыть" : "Close"} className="chip-upgrade__close"><X aria-hidden="true" /></button></div>
      {children}
    </div>
  </div>;
}

export function UpgradeHero({ imageUrl, name, level, templateNo }: { imageUrl: string; name: string; level: number; templateNo: number | null }) {
  return <div className="chip-upgrade__hero">
    <ChipImage src={imageUrl} level={level} alt={name} className={`chip-upgrade__portrait${level >= 3 && level < 4 ? " is-mid-tier" : ""}`} />
    <span className="chip-upgrade__type-number">№{templateNo ?? "?"}</span>
    <div className="chip-upgrade__level" aria-label={`${starLevel(level)} → ${starLevel(level + .5)}`}><strong>{levelNumber(level)}<span>★</span></strong><ArrowRight aria-hidden="true" /><strong>{levelNumber(level + .5)}<span>★</span></strong></div>
  </div>;
}

export function UpgradeCurrency({ label, value }: { label: string; value: number }) {
  const ru = useLang() === "ru";
  return <span className="chip-upgrade__currency" aria-label={`${label}: ${fmtTickets(value)} ${ru ? "билетов" : "tickets"}`}><span>{label}</span><strong><ResourceGlyph kind="tickets" /> {fmtTickets(value)}</strong></span>;
}

export function UpgradeChip({ imageUrl, name, level, templateNo, selected = false, onClick, disabled = false }: {
  imageUrl: string;
  name: string;
  level: number;
  templateNo: number | null;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const ru = useLang() === "ru";
  const body = <><ChipImage src={imageUrl} level={level} alt={name} className={`chip-upgrade__tiny-portrait${level >= 3 && level < 4 ? " is-mid-tier" : ""}`} /><small>№{templateNo ?? "?"}</small></>;
  return onClick ? <button type="button" data-game-button="surface" className={`chip-upgrade__tiny ${selected ? "is-selected" : ""}`} onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={`${name}, ${ru ? "вид" : "type"} №${templateNo ?? "?"}, ${starLevel(level)}`}>{body}</button>
    : <span className="chip-upgrade__tiny">{body}</span>;
}
