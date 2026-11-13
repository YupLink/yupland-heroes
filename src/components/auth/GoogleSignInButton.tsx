// Кнопка Google Identity Services: экран входа гостя (когда вход открыт всем) и
// /admin/google. Скрипт accounts.google.com/gsi/client грузится только вместе с ней.
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { swapWhenReady, type SwapLayer } from "@/lib/swapWhenReady";

const GSI_SRC = "https://accounts.google.com/gsi/client";

type GsiId = {
  initialize: (o: {
    client_id: string;
    callback: (r: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    el: HTMLElement,
    o: {
      theme?: string;
      size?: string;
      shape?: string;
      locale?: string;
      text?: string;
      width?: number;
    },
  ) => void;
};
/** Окно выбора аккаунта Google с токеном доступа (своя кнопка входа, GoogleOwnButton). */
export type GsiTokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
type GsiOauth2 = {
  initTokenClient: (o: {
    client_id: string;
    scope: string;
    callback: (r: { access_token?: string; error?: string }) => void;
    error_callback?: (e: { type?: string }) => void;
  }) => GsiTokenClient;
};
export type GsiWindow = Window & { google?: { accounts?: { id?: GsiId; oauth2?: GsiOauth2 } } };

let loading: Promise<GsiId> | null = null;

export function loadGsi(): Promise<GsiId> {
  const ready = (window as GsiWindow).google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<GsiId>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => {
      const id = (window as GsiWindow).google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("gsi"));
    };
    s.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(s);
  }).catch((e: unknown) => {
    loading = null; // следующая попытка — заново
    throw e;
  });
  return loading;
}

export function GoogleSignInButton({
  clientId,
  disabled,
  onCredential,
  width: fixed,
}: {
  clientId: string;
  disabled: boolean;
  onCredential: (credential: string) => void;
  /** Ширина кнопки в px; без неё — по месту. */
  width?: number;
}) {
  const t = useT();
  const lang = useLang();
  const host = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    cb.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let alive = true;
    let swap: SwapLayer | null = null;
    setFailed(false);
    loadGsi()
      .then((gsi) => {
        if (!alive || !host.current) return;
        gsi.initialize({
          client_id: clientId,
          callback: (r) => r.credential && cb.current(r.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        // Ширина — заданная или по месту (у Google 200…400 px).
        const width = Math.round(
          Math.min(400, Math.max(200, fixed ?? (host.current.clientWidth || 0))),
        );
        // Новая кнопка — в невидимом слое, старая видна, пока новая не готова.
        swap = swapWhenReady(host.current);
        gsi.renderButton(swap.layer, {
          theme: "outline",
          size: "large",
          shape: "pill",
          locale: lang,
          width,
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      swap?.dispose();
    };
  }, [clientId, lang, fixed]);

  if (failed) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("google.btn_failed")}
      </p>
    );
  }
  return (
    <div
      ref={host}
      aria-busy={disabled}
      className={`relative flex h-11 w-full items-center justify-center ${disabled ? "pointer-events-none opacity-60" : ""}`}
    />
  );
}
