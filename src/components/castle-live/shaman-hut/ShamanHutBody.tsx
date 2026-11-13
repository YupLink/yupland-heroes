import { useRef, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { useResources } from "@/lib/hooks/useResources";
import { RITUAL_PCT } from "@/lib/raid/weatherRitual";
import type { ShamanHutView } from "@/server/api/shaman-hut/shaman-hut";
import { RES_ICON } from "../architect/architectIcons";
import { useBuyShaman, useTakeShaman } from "./useShamanHut";

type Tab = "buy" | "owned";

export function ShamanHutBody({ view }: { view: ShamanHutView }) {
  const t = useT();
  const lang = useLang();
  const have = useResources().data;
  const buy = useBuyShaman();
  const take = useTakeShaman();
  const { shaman, price, count } = view;
  const [tab, setTab] = useState<Tab>("buy");
  const buyRef = useRef<HTMLButtonElement>(null);
  const ownedRef = useRef<HTMLButtonElement>(null);
  const takeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const fmt = (n: number) => n.toLocaleString(lang === "en" ? "en-US" : "ru-RU");
  const balancePending = have == null;
  const short = !!price && have != null && (Number(have[price.currency]) || 0) < price.amount;
  const name = localizeAssetName(shaman.name, lang);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: Tab = event.key === "Home" ? "buy" : event.key === "End" ? "owned" : tab === "buy" ? "owned" : "buy";
    setTab(next);
    (next === "buy" ? buyRef : ownedRef).current?.focus();
  };

  const details = (
    <div className="shaman-hut-live__card-main">
      <img className="shaman-hut-live__shaman" src={shaman.image} alt="" draggable={false} />
      <div className="shaman-hut-live__details">
        <h3 className="font-display">{name}</h3>
        <p>
          {t("shaman.guard_label")}{" "}
          <strong>{shaman.guard ? `${t("shaman.hp")} ${fmt(shaman.hp)} · ${t("shaman.attack")} ${shaman.attack}` : t("shaman.guard_unset")}</strong>
        </p>
        <p><strong>{t("shaman.ritual_bonus", { n: RITUAL_PCT })}</strong></p>
      </div>
    </div>
  );

  return (
    <div className="shaman-hut-live__body">
      <p className="shaman-hut-live__total">{t("shaman.in_hut_total")} <strong>{fmt(count)}</strong></p>
      <div className="shaman-hut-live__tabs" role="tablist" aria-label={t("shaman.hut")}>
        <button ref={buyRef} id="shaman-hut-buy-tab" type="button" role="tab" aria-selected={tab === "buy"} aria-controls="shaman-hut-buy-panel" tabIndex={tab === "buy" ? 0 : -1} onClick={() => setTab("buy")} onKeyDown={onTabKey}>{t("shaman.buy")}</button>
        <button ref={ownedRef} id="shaman-hut-owned-tab" type="button" role="tab" aria-selected={tab === "owned"} aria-controls="shaman-hut-owned-panel" tabIndex={tab === "owned" ? 0 : -1} onClick={() => setTab("owned")} onKeyDown={onTabKey}>{t("shaman.tab_owned")}</button>
      </div>
      {tab === "buy" ? (
        <div id="shaman-hut-buy-panel" role="tabpanel" aria-labelledby="shaman-hut-buy-tab">
          <article className="shaman-hut-live__card">
            {details}
            <div className="shaman-hut-live__actions">
              <span className="shaman-hut-live__price" aria-label={price ? `${fmt(price.amount)} ${t(`shaman.currency.${price.currency}`)}` : t("shaman.buy_unavailable")}>
                {price ? <><img src={RES_ICON[price.currency]} alt="" />{fmt(price.amount)}</> : "—"}
              </span>
              <button type="button" className="shaman-hut-live__action" disabled={!price || balancePending || short || buy.isPending} onClick={() => price && buy.mutate(price)}>
                {buy.isPending && <Loader2 size={16} className="shaman-hut-live__spinner" aria-hidden="true" />}
                {t("shaman.buy")}
              </button>
            </div>
            {!price && <p className="shaman-hut-live__hint">{t("shaman.buy_unavailable")}</p>}
            {price && balancePending && <p className="shaman-hut-live__hint">{t("shaman.balance_loading")}</p>}
            {short && <p className="shaman-hut-live__hint">{t("shaman.no_resources")}</p>}
          </article>
        </div>
      ) : (
        <div id="shaman-hut-owned-panel" role="tabpanel" aria-labelledby="shaman-hut-owned-tab">
          {count > 0 ? <>
            <article className="shaman-hut-live__card">
              <span className="shaman-hut-live__quantity">{fmt(count)} {t("shaman.unit")}</span>
              {details}
              <div className="shaman-hut-live__actions">
                <button ref={takeRef} type="button" className="shaman-hut-live__action shaman-hut-live__action--secondary" disabled={!shaman.guard || take.isPending} onClick={() => confirmRef.current?.showModal()}>{t("shaman.take_short")}</button>
                {!shaman.guard && <span className="shaman-hut-live__hint">{t("shaman.take_requires_guard")}</span>}
              </div>
            </article>
            <p className="shaman-hut-live__warning">{t("shaman.ritual_warning")}</p>
          </> : (
            <div className="shaman-hut-live__empty">
              <p>{t("shaman.none")}</p>
              <button type="button" onClick={() => { setTab("buy"); buyRef.current?.focus(); }}>{t("shaman.to_buy")}</button>
            </div>
          )}
        </div>
      )}
      <dialog ref={confirmRef} className="shaman-hut-live__confirm" aria-labelledby="shaman-hut-confirm-title" onClose={() => takeRef.current?.focus()}>
        <h3 id="shaman-hut-confirm-title">{t("shaman.confirm_title")}</h3>
        <p>{t("shaman.ritual_warning")}</p>
        <div>
          <button type="button" onClick={() => confirmRef.current?.close()}>{t("shaman.cancel")}</button>
          <button type="button" className="shaman-hut-live__action" onClick={() => { confirmRef.current?.close(); take.mutate(); }}>{t("shaman.confirm_take")}</button>
        </div>
      </dialog>
    </div>
  );
}
