import { Bell, Globe, Castle, LogOut, ChevronRight, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { getConnector } from "@/lib/near-connector";
import { humanError } from "@/lib/humanError";
import { disconnectWallet, getSession, setMyLang, setNotificationsEnabled } from "@/server/api/user-auth";
import { ProfileViewToggles } from "./ProfileViewToggles";
import { ProfileNameRow } from "./ProfileNameRow";
import { TgFrameToggle } from "./TgFrameToggle";
import { PromoSection } from "./promo/PromoSection";
import { PromoAdminRow } from "./promo/PromoAdminRow";
import { DesignerGoldRow } from "./DesignerGoldRow";
import { DemoIslandRow } from "./DemoIslandRow";
import { CreatorRow } from "./creator/CreatorRow";
import { LinkTelegramRow } from "./LinkTelegramRow";
import { isGoogleOnlyTg, isWalletTg } from "@/lib/auth/googleTg";
import { GoogleLinkRow } from "./GoogleLinkRow";

/** Castle Profile settings; external connections live in Treasury. */
export function CastleAccount({ onSignedOut, onEdit }: { onSignedOut?: () => void; onEdit?: () => void; walletStatus?: "connected" | "disconnected"; onPreviewWalletChange?: (connected: boolean) => void }) {
  const t = useT();
  const lang = useAppStore((s) => s.lang);
  const setWallet = useAppStore((s) => s.setWallet);
  const setLang = useAppStore((s) => s.setLang);
  const ru = lang === "ru";
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [showLanguages, setShowLanguages] = useState(false);
  const [languagePending, setLanguagePending] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const changeLanguage = (next: "ru" | "en") => {
    if (languagePending) return;
    setLanguageError(null);
    setLang(next);
    setShowLanguages(false);
    if (!session.data?.wallet) return;
    setLanguagePending(true);
    void setMyLang({ data: { lang: next } }).then((result) => {
      if (!result.ok) throw new Error("Language was not saved to the account");
      void qc.invalidateQueries({ queryKey: ["session"] });
    }).catch(() => setLanguageError(next === "ru"
      ? "Язык изменён на этом устройстве, но не сохранился в аккаунте. Попробуй ещё раз."
      : "Language changed on this device but was not saved to your account. Try again.")).finally(() => setLanguagePending(false));
  };
  const notifications = useMutation({
    mutationFn: (enabled: boolean) => setNotificationsEnabled({ data: { enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
    onError: (e: Error) => setNotificationsError(humanError(e)),
  });
  const logout = useMutation({
    mutationFn: async () => {
      await disconnectWallet();
      try { await (await getConnector())?.disconnect(); }
      catch { /* Server sign-out succeeded; local connector cleanup is best-effort. */ }
    },
    onSuccess: () => {
      setWallet(null);
      qc.clear();
      onSignedOut?.();
    },
    onError: (e: Error) => setLogoutError(humanError(e)),
  });
  const button = "min-h-11 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40";
  if (session.isPending) return <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>;
  if (session.isError)
    return (
      <div role="alert" className="space-y-3">
        <p>{humanError(session.error)}</p>
        <button data-game-button="secondary" className={button} onClick={() => void session.refetch()}>
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  const user = session.data;
  // «Только Google» (§8.127): в профиле ни слова о Telegram — без уведомлений бота и рамок.
  const googleOnly = isGoogleOnlyTg(user.telegramId);
  return (
    <div className="castle-profile__settings">
      <section className="castle-profile__language">
        <button data-game-button="row" className="castle-profile__row" aria-expanded={showLanguages} onClick={() => setShowLanguages(!showLanguages)}><Globe aria-hidden="true" /><span>{t("header.language")}</span><span className="text-muted-foreground">{ru ? "Русский" : "English"}</span><ChevronRight className="castle-profile__chevron" aria-hidden="true" /></button>
        {showLanguages && <fieldset className="space-y-2 py-3">
          <legend className="sr-only">{t("header.language")}</legend>
          <div className="flex gap-2">{(["ru", "en"] as const).map(l => <button data-game-button="tab" key={l} className={button} disabled={languagePending} aria-pressed={lang === l} onClick={() => changeLanguage(l)}>{l === "ru" ? "Русский" : "English"}{lang === l ? " ✓" : ""}</button>)}</div>
        </fieldset>}
        {languageError && <p role="alert" className="px-3 pb-3 text-sm text-destructive">{languageError}</p>}
      </section>
      {user.telegramLinked && !googleOnly && (
        <button data-game-button="row"
          className="castle-profile__row"
          role="switch"
          aria-checked={!!user.notificationsEnabled}
          disabled={notifications.isPending || logout.isPending}
          onClick={() => {setNotificationsError(null); notifications.mutate(!user.notificationsEnabled);}}
        >
          <Bell aria-hidden="true" /><span>{t("header.notifications")}</span><span className={`castle-profile__switch ${user.notificationsEnabled ? "is-on" : ""}`} aria-hidden="true" />
        </button>
      )}
      {notificationsError && <p role="alert" className="px-3 text-sm text-destructive">{notificationsError}</p>}
      {isWalletTg(user.telegramId) && <LinkTelegramRow />}
      {user.wallet && !googleOnly && <GoogleLinkRow />}
      {user.wallet && <ProfileNameRow fallback={user.telegramUsername ? `@${user.telegramUsername}` : null} />}
      {user.wallet && <ProfileViewToggles ru={ru} />}
      {!googleOnly && <TgFrameToggle ru={ru} />}
      {/* Промокод: новые коды на что угодно, не нашёлся — код на лайки. */}
      <PromoSection wallet={!!user.wallet} telegramLinked={!!user.telegramLinked} />
      {user.wallet && (
        <>
          {/* Золото по кнопке — только Ангелине (сервер решает); у прочих запроса нет. */}
          {user.isCastleEditor && <DesignerGoldRow ru={ru} />}
          {/* Демо-остров — по праву demo_island или «уйти», если стоит на нём (сервер решает). */}
          <DemoIslandRow ru={ru} />
          {/* Шаблоны поселений — право creator и админ, или «выйти» из работы (сервер решает). */}
          <CreatorRow />
          {((onEdit && user.isCastleEditor) || user.isAdmin || user.canPromoSoft) && <section className="castle-profile__tools"><h3 className="text-sm text-muted-foreground">{ru ? "Инструменты" : "Tools"}</h3>
            {/* Админка — только админам (дизайнер видит лишь редактор замка). */}
            {user.isAdmin && <Link to="/admin" data-game-button="row" className="castle-profile__row"><ShieldCheck aria-hidden="true" /><span>{ru ? "Админка" : "Admin panel"}</span><ChevronRight className="castle-profile__chevron" aria-hidden="true" /></Link>}
            {user.isAdmin && <PromoAdminRow canToken={!!user.isPayoutsAdmin} />}
            {!user.isAdmin && user.canPromoSoft && <PromoAdminRow canToken={false} soft />}
            {onEdit && user.isCastleEditor && <button data-game-button="row" className="castle-profile__row" onClick={onEdit}><Castle aria-hidden="true" /><span>{ru ? "Редактор замка" : "Castle editor"}</span><ChevronRight className="castle-profile__chevron" aria-hidden="true" /></button>}</section>}
          <button data-game-button="row"
            className="castle-profile__row castle-profile__logout"
            disabled={logout.isPending}
            onClick={() => setConfirmLogout(true)}
          >
            <LogOut aria-hidden="true" /><span>{ru ? "Выйти из аккаунта" : "Sign out"}</span>
          </button>
          {confirmLogout && <section className="space-y-3 rounded-xl border border-border p-3" aria-label={ru ? "Подтверждение выхода" : "Confirm sign out"}>
            <p className="text-sm">{ru ? "Выйти из аккаунта на этом устройстве? Подключение кошелька также будет завершено." : "Sign out on this device? The wallet connection will also end."}</p>
            <div className="flex flex-wrap gap-2">
              <button data-game-button="secondary" className={button} onClick={() => setConfirmLogout(false)}>{ru ? "Остаться" : "Stay"}</button>
              <button data-game-button="secondary" className={button} disabled={logout.isPending} onClick={() => {setLogoutError(null); logout.mutate();}}>{ru ? "Выйти" : "Sign out"}</button>
            </div>
            {logoutError && <p role="alert" className="text-sm text-destructive">{logoutError}</p>}
          </section>}
        </>
      )}
    </div>
  );
}
