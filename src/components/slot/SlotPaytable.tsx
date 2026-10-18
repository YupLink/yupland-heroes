// Инструкция картинками, 4 страницы как в оригинале: выплаты, бонус-игра,
// супер-бонус, риск-игра. Минимум текста — символы, цифры, арт.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { SUPER_ATTEMPTS, SUPER_PRIZE } from "@/lib/slot/bonus";
import { SYMBOLS } from "@/lib/slot/symbols";
import { TrapIcon } from "./SlotArt";
import { MAP_ART } from "@/lib/gameArt";

const PAGES = ["p1", "p2", "p3", "p4"] as const;

function PayPage({ bet }: { bet: number }) {
  const t = useT();
  return (
    <div className="grid grid-cols-3 gap-2">
      {[...SYMBOLS].reverse().map((s) => (
        <div
          key={s.id}
          className="flex flex-col items-center rounded-xl border border-border/60 bg-black/50 p-2"
        >
          <img src={s.img} alt="" className="h-14 w-14 object-contain" />
          {s.pays ? (
            <div className="mt-1 w-full space-y-0.5 font-display text-xs tabular-nums">
              {s.pays.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">{i + 3}×</span>
                  <span className="font-bold text-gold">{p * bet}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-center font-display text-xs font-bold text-gold">
              3+ → {t("slot.rules.p2")}
            </div>
          )}
        </div>
      ))}
      <div className="col-span-3 rounded-xl bg-secondary/30 p-2 text-[11px] text-muted-foreground">
        <div>⇄ {t("slot.rules.both")}</div>
        <div className="mt-0.5">{t("slot.rules.wild_short")}</div>
      </div>
    </div>
  );
}

function BonusPage({ stake }: { stake: number }) {
  const t = useT();
  const finds: Array<[React.ReactNode, string, string]> = [
    [
      <img key="b" src="/slot/pouch.webp" alt="" className="h-12 w-12 object-contain" />,
      t("slot.find.bag"),
      "×1 … ×10",
    ],
    [
      <img key="c" src="/slot/chest.webp" alt="" className="h-12 w-12 object-contain" />,
      t("slot.find.chest"),
      "×15 … ×50",
    ],
    [
      <img
        key="m"
        src="/slot/chest-magic.webp"
        alt=""
        className="h-12 w-12 object-contain drop-shadow-[0_0_8px_rgba(167,139,250,0.9)]"
      />,
      t("slot.find.magic"),
      "×75 … ×250",
    ],
    [<TrapIcon key="t" className="h-12 w-12" />, t("slot.find.trap"), t("slot.rules.trap_short")],
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl bg-black/50 p-2">
        <img src="/slot/bonus.webp" alt="" className="h-12 w-12 object-contain" />
        <span className="font-display text-lg font-bold text-gold">×3+</span>
        <span className="text-xs text-muted-foreground">→</span>
        <div className="grid flex-1 grid-cols-5 gap-0.5">
          {Array.from({ length: 20 }, (_, i) => (
            <img key={i} src={MAP_ART.lootMound} alt="" className="w-full object-contain" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {finds.map(([icon, name, range]) => (
          <div
            key={name}
            className="flex flex-col items-center rounded-xl border border-border/60 bg-black/50 p-1.5 text-center"
          >
            {icon}
            <div className="text-[10px] leading-tight text-muted-foreground">{name}</div>
            <div className="font-display text-xs font-bold text-gold">{range}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("slot.rules.bonus_short")}</p>
    </div>
  );
}

function SuperPage({ stake }: { stake: number }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 rounded-xl bg-[radial-gradient(ellipse_at_bottom,#141a2a,#05060a_70%)] p-3">
        <div className="flex flex-col items-center">
          <img src="/slot/chest-magic.webp" alt="" className="h-14 w-14 object-contain" />
          <span className="font-display text-sm font-bold text-gold">+{SUPER_PRIZE * stake}</span>
        </div>
        <img src="/slot/shovel.webp" alt="" className="h-12 w-12 object-contain" />
        <div className="flex flex-col items-center">
          <img src="/slot/boss.webp" alt="" className="h-14 w-14 object-contain" />
          <span className="font-display text-sm font-bold text-destructive">✕</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1">
        {Array.from({ length: SUPER_ATTEMPTS }, (_, i) => (
          <span key={i} className="h-1.5 w-4 rounded-full bg-gold" />
        ))}
        <span className="ml-2 font-display text-xs font-bold text-gold">
          = {SUPER_PRIZE * SUPER_ATTEMPTS * stake}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("slot.rules.super_short")}</p>
    </div>
  );
}

function Card({ label, red, hidden }: { label: string; red?: boolean; hidden?: boolean }) {
  return (
    <div
      className={cn(
        "flex aspect-[2/3] w-10 items-center justify-center rounded-md border font-display text-sm font-bold",
        hidden ? "border-border/60 bg-secondary/60 text-muted-foreground" : "bg-white",
        !hidden && (red ? "text-red-600" : "text-slate-900"),
      )}
    >
      {label}
    </div>
  );
}

function RiskPage() {
  const t = useT();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-3 rounded-xl bg-black/50 p-3">
        <Card label="9♦" red />
        <span className="text-muted-foreground">vs</span>
        <Card label="?" hidden />
        <Card label="?" hidden />
        <Card label="?" hidden />
        <Card label="?" hidden />
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center font-display text-xs font-bold">
        <div className="rounded-xl bg-black/50 p-2 text-gold">▲ ×2</div>
        <div className="rounded-xl bg-black/50 p-2 text-neon">= ↻</div>
        <div className="rounded-xl bg-black/50 p-2 text-destructive">▼ 0</div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("slot.rules.risk_short")}</p>
    </div>
  );
}

export function SlotPaytable({
  open,
  initialPage = 1,
  onClose,
  bet,
  stake,
}: {
  open: boolean;
  initialPage?: number;
  onClose: () => void;
  /** Ставка на линию — выплаты показываются в кредитах при ней. */
  bet: number;
  /** Ставка за спин — призы бонуса и супера в кредитах. */
  stake: number;
}) {
  const t = useT();
  const [page, setPage] = useState<(typeof PAGES)[number]>("p1");
  useEffect(() => {
    if (open) setPage(PAGES[Math.min(3, Math.max(0, initialPage - 1))]);
  }, [open, initialPage]);
  if (!open) return null;
  // Своё окно поверх оболочки слота (z 140): Radix-диалог рисовался под ней.
  return (
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="slot-panel max-h-[88vh] w-full max-w-md space-y-3 overflow-y-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg slot-gold">{t("slot.rules")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-1">
          {PAGES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              data-on={p === page}
              className="slot-key flex-1 px-1 py-1.5 text-[11px]"
            >
              {t(`slot.rules.${p}`)}
            </button>
          ))}
        </div>
        {page === "p1" && (
          <>
            <div className="text-[11px] slot-muted">{t("slot.rules.bet_now", { bet })}</div>
            <PayPage bet={bet} />
          </>
        )}
        {page === "p2" && (
          <>
            <div className="text-[11px] slot-muted">{t("slot.rules.stake_now", { stake })}</div>
            <BonusPage stake={stake} />
          </>
        )}
        {page === "p3" && (
          <>
            <div className="text-[11px] slot-muted">{t("slot.rules.stake_now", { stake })}</div>
            <SuperPage stake={stake} />
          </>
        )}
        {page === "p4" && <RiskPage />}
      </div>
    </div>
  );
}
