// Ратуша в окне постройки (владелец, 03.10.2026): игрок видит только справку —
// жителей и что они едят за сутки; настройки ратуши — админу, кнопкой отсюда же.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Home, Loader2, Settings2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { getHomeCastle } from "@/server/api/beta-raid/home-castle";
import { useCastleMode } from "../castleMode";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import type { TownEatLine, TownHallExtra } from "@/lib/townHallView";
import { numText } from "../market/num";
import { TownAdminPanel } from "./TownAdminPanel";

export function TownExtra({ q, r, extra }: { q: number; r: number; extra: TownHallExtra }) {
  return <TownHallInfo q={q} r={r} extra={extra} />;
}

function TownHallInfo({ q, r, extra }: { q: number; r: number; extra: TownHallExtra }) {
  const t = useT();
  const ru = useLang() === "ru";
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const castleMode = useCastleMode();
  const offerMainAt = castleMode?.offerMainAt;
  const home = useQuery({ queryKey: ["home-castle"], queryFn: () => getHomeCastle(), staleTime: 0, refetchOnMount: "always", retry: false });
  const [checkingMain, setCheckingMain] = useState(false);
  const [settings, setSettings] = useState(false);
  const [foodOpen, setFoodOpen] = useState(false);
  // A cached response predating the food list may omit it.
  const eats = Array.isArray(extra.eats) ? extra.eats : [];
  const name = typeof extra.name === "string" ? extra.name.trim() : "";
  const place = home.data;
  const main = !place?.island && !place?.away && place?.home.kind === "town" && place.home.q === q && place.home.r === r;
  const here = !place?.island && !place?.away && place?.here?.kind === "town" && place.here.q === q && place.here.r === r;
  const showMainPlace = !home.isFetching && home.isSuccess && !place?.island && !place?.away;
  return (
    <section className="raid-townhall-city" aria-label={ru ? "Сведения о городе" : "City information"}>
      <div className="raid-townhall-city__head">
        <div className="min-w-0">
          <span className="raid-townhall-city__eyebrow">{ru ? "ГОРОД" : "CITY"}</span>
          <h4 className="raid-townhall-city__name">{name || (ru ? "Город" : "City")}</h4>
          {showMainPlace && main && <div className="raid-townhall-city__main-status"><span className="raid-townhall-city__main-dot" aria-hidden="true" />{ru ? "Твой основной замок" : "Your main castle"}</div>}
        </div>
        <div className="raid-townhall-city__population">
          <strong>{numText(Number(extra.residents) || 0)}</strong>
          <span>{ru ? "жителей" : "residents"}</span>
        </div>
      </div>
      {extra.starving && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-xs font-bold text-destructive">
          {t("town.starving_badge")}
        </div>
      )}
      <button type="button" className="raid-townhall-city__toggle" aria-expanded={foodOpen}
        onClick={() => setFoodOpen(open => !open)}>
        <span>{t("town.eats_title")}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {foodOpen && (
        eats.length === 0
          ? <p className="raid-townhall-city__empty">{t("town.eats_none")}</p>
          : <ul className="raid-townhall-city__food">
              {eats.map((e, i) => <EatRow key={`${e.kind}:${e.refId ?? ""}:${i}`} e={e} />)}
            </ul>
      )}
      {extra.starving && (
        <p className="raid-townhall-city__hint">{t("town.starving_hint")}</p>
      )}
      {home.isFetching && <p className="raid-townhall-city__main-feedback" role="status">{ru ? "Проверяем основной замок…" : "Checking main castle…"}</p>}
      {!home.isFetching && home.isError && <div className="raid-townhall-city__main-feedback" role="alert">
        <span>{ru ? "Не удалось проверить основной замок." : "Could not check the main castle."}</span>
        <button type="button" onClick={() => void home.refetch()}>{ru ? "Повторить" : "Retry"}</button>
      </div>}
      {showMainPlace && !main && offerMainAt && <div className="raid-townhall-city__main-action">
        <button type="button" className="raid-townhall-city__main-button" disabled={!here || checkingMain}
          onClick={() => {
            setCheckingMain(true);
            void offerMainAt(q, r).finally(() => setCheckingMain(false));
          }}>
          {checkingMain ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Home aria-hidden="true" />}
          <span>{ru ? "Сделать основным замком" : "Make main castle"}</span>
        </button>
        {!here && <p className="raid-townhall-city__main-hint">{ru ? "Доступно, когда герой находится у этой ратуши." : "Available when your hero is at this town hall."}</p>}
      </div>}
      {session.data?.isAdmin && (
        <button type="button" onClick={() => setSettings(true)}
          className="raid-townhall-city__settings">
          <Settings2 aria-hidden="true" />
          {t("town.settings")}
        </button>
      )}
      {settings && <TownAdminPanel q={q} r={r} onClose={() => setSettings(false)} />}
    </section>
  );
}

function EatRow({ e }: { e: TownEatLine }) {
  const t = useT();
  const resIcon = e.kind === "resource" ? marketResourceIconSrc(e.refId) : null;
  const icon = e.image ?? resIcon;
  const label =
    e.name ??
    (e.kind === "resource"
      ? e.refId === "token"
        ? (e.token ?? "token")
        : t(`market.res.${e.refId ?? "gold"}`)
      : (e.refId ?? e.kind));
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/40 px-2 py-1.5">
      {icon ? (
        <img
          src={icon}
          alt=""
          className={`h-7 w-7 shrink-0 object-contain ${!e.image && resIcon ? "[image-rendering:pixelated]" : ""}`}
        />
      ) : (
        <div className="h-7 w-7 shrink-0 rounded-lg bg-secondary" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span
        className={`shrink-0 text-xs tabular-nums ${e.short ? "font-bold text-destructive" : "text-muted-foreground"}`}
      >
        {t("town.per_day", { n: numText(e.perDay) })}
        {e.short ? ` · ${t("town.short")}` : ""}
      </span>
    </li>
  );
}
