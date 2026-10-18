// PWA: регистрация service worker + запрос долговечного хранилища + установка
// «на Домой». Цель — чтобы установленное приложение получило persistent storage
// и ключ кошелька в IndexedDB перестал вытесняться (главная причина потери коша).

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

// beforeinstallprompt ловим на уровне модуля (он срабатывает один раз и рано) —
// иначе поздно смонтированная кнопка его пропустит.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new Event("yl-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event("yl-installed"));
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setCanInstall(!!deferredPrompt);
    setInstalled(isStandalone());
    const onAvail = () => setCanInstall(!!deferredPrompt);
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener("yl-installable", onAvail);
    window.addEventListener("yl-installed", onInstalled);
    return () => {
      window.removeEventListener("yl-installable", onAvail);
      window.removeEventListener("yl-installed", onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    setCanInstall(false);
    return choice?.outcome === "accepted";
  };

  return { canInstall, installed, promptInstall, ios: isIOS() };
}

/** Регистрирует SW + просит persistent storage. Монтируется один раз в root. */
export function PwaSetup() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // SW регистрируем ТОЛЬКО в проде. В dev он не нужен (установки PWA там нет),
    // а его вмешательство в навигации мешает vite-HMR/гидрации.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* SW не критичен для работы — только для установки */
      });
    }
    // Запрашиваем долговечное хранилище заранее (надёжно срабатывает уже
    // установленным PWA; в обычной вкладке/вебвью часто отказ — это норм).
    navigator.storage?.persist?.().catch(() => {});
  }, []);
  return null;
}

/**
 * Баннер «Установить приложение». Прячется, если уже установлено. На iOS
 * (нет beforeinstallprompt) показывает инструкцию «Поделиться → На экран Домой».
 */
export function InstallAppBanner({ compact = false }: { compact?: boolean }) {
  const { canInstall, installed, promptInstall, ios } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  if (installed || dismissed) return null;
  // Показываем, если можем установить (Chrome/Android) ИЛИ это iOS (инструкция).
  if (!canInstall && !ios) return null;

  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/5 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
          <Download className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Установи приложение</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            На «Домой» — отдельная иконка и надёжное хранилище: ключ кошелька
            больше не пропадёт.
          </div>
          <div className="mt-2">
            {ios ? (
              <button
                onClick={() => setIosHint((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-gold-foreground"
              >
                <Share className="h-3 w-3" /> Как установить на iPhone
              </button>
            ) : (
              <button
                onClick={() => promptInstall()}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-gold-foreground"
              >
                <Download className="h-3 w-3" /> Установить
              </button>
            )}
          </div>
          {ios && iosHint && (
            <div className="mt-2 rounded-lg border border-border bg-card/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
              1. Нажми <Share className="inline h-3 w-3" /> «Поделиться» внизу
              Safari.
              <br />
              2. Выбери «На экран Домой».
              <br />
              3. Открывай YupLink уже с иконки — хранилище станет надёжным.
            </div>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Скрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
