// Своя кнопка «Войти через Google» на экране гостя (владелец, 09.11.2026: «кнопка
// Google дёргается — подойди основательно»). Кнопку Google Identity Services рисует сам
// Google: запасная HTML-кнопка, потом iframe под ней, потом подмена — и так при каждой
// смене языка. Эта — обычная кнопка страницы: видна сразу, язык меняет мгновенно,
// не перерисовывается. Нажатие открывает окно выбора аккаунта Google (token client);
// токен доступа сервер сверяет у Google (verifyGoogleAccess.ts).
import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n";
import { loadGsi, type GsiTokenClient, type GsiWindow } from "./GoogleSignInButton";
import "./login-buttons.css";

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleOwnButton({
  clientId,
  disabled,
  onToken,
  label,
}: {
  clientId: string;
  disabled: boolean;
  onToken: (accessToken: string) => void;
  /** Своя надпись (профиль: «Привязать Google»). */
  label?: string;
}) {
  const ru = useLang() === "ru";
  const client = useRef<GsiTokenClient | null>(null);
  const cb = useRef(onToken);
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);
  // Библиотеку Google и окно выбора аккаунта готовим заранее: само окно открывается
  // только прямо в нажатии, иначе браузер его заблокирует.
  useEffect(() => {
    let alive = true;
    loadGsi()
      .then(() => {
        const oauth2 = (window as GsiWindow).google?.accounts?.oauth2;
        if (!alive || !oauth2) return;
        client.current = oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email",
          callback: (r) => r.access_token && cb.current(r.access_token),
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [clientId]);
  return (
    <button
      type="button"
      className="google-own-btn"
      aria-busy={disabled}
      onClick={() => client.current?.requestAccessToken({ prompt: "select_account" })}
    >
      <GoogleG />
      {label ?? (ru ? "Войти через аккаунт Google" : "Sign in with Google")}
    </button>
  );
}
