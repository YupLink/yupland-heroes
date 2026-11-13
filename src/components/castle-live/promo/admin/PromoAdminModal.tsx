// Окно админа «Промокоды» (профиль → Инструменты): вкладки «Коды» и «Новый».
// Поверх окна профиля (слой 140) — порталом в body, слой 150. Грузится
// лениво: игроку код админки не нужен.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, TicketPercent, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { PromoCodeCard } from "./PromoCodeCard";
import { PromoCreateForm } from "./PromoCreateForm";
import { PromoSoftContext } from "./PromoKindMenu";
import { usePromoList } from "./usePromoAdmin";

type Tab = "list" | "new";

/** Шаг «Показать ещё»: старые коды тоже должны выключаться из окна. */
const PAGE = 50;

function CodeList() {
  const t = useT();
  const [limit, setLimit] = useState(PAGE);
  const list = usePromoList(limit);
  if (list.isPending)
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("promo.adm.loading")}
      </p>
    );
  if (list.isError)
    return (
      <div role="alert" className="space-y-3 py-6 text-center text-sm">
        <p>{humanError(list.error)}</p>
        <button
          type="button"
          onClick={() => void list.refetch()}
          className="min-h-11 rounded-xl border border-border px-4"
        >
          {t("promo.adm.retry")}
        </button>
      </div>
    );
  if (list.data.rows.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("promo.adm.empty")}</p>;
  return (
    <div className="space-y-2">
      {list.data.rows.map((p) => (
        <PromoCodeCard key={p.id} promo={p} />
      ))}
      {list.data.more && (
        <button
          type="button"
          disabled={list.isFetching}
          onClick={() => setLimit((n) => n + PAGE)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {list.isFetching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {t("promo.adm.more")}
        </button>
      )}
    </div>
  );
}

export function PromoAdminModal({
  onClose,
  canToken,
  soft = false,
}: {
  onClose: () => void;
  /** Владелец (isPayoutsAdmin): строка-токен доступна только ему. */
  canToken: boolean;
  /** Не админ (право promo_soft): только энергия и лайки, только свои коды. */
  soft?: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("list");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        "min-h-10 flex-1 rounded-lg text-sm font-semibold transition",
        tab === id ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  const modal = (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("promo.adm.title")}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-gold/25 bg-background text-foreground shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 pb-3 pt-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
            <TicketPercent className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold">
            {t("promo.adm.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("promo.adm.close")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div role="tablist" className="mx-4 mt-3 flex gap-1 rounded-xl border border-border bg-card p-1">
          {tabBtn("list", t("promo.adm.tab_list"))}
          {tabBtn("new", t("promo.adm.tab_new"))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {tab === "list" ? <CodeList /> : <PromoCreateForm canToken={canToken} onCreated={() => setTab("list")} />}
        </div>
      </section>
    </div>
  );
  const wrapped = <PromoSoftContext.Provider value={soft}>{modal}</PromoSoftContext.Provider>;
  return typeof document === "undefined" ? wrapped : createPortal(wrapped, document.body);
}
