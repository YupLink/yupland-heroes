import { create } from "zustand";

export type Lang = "ru" | "en";

// Язык устройства: сперва Telegram (language_code юзера мини-аппа), потом
// navigator.language. Русскоязычные локали → ru, ВСЁ остальное (включая
// непонятную или пустую локаль) → en: игра англоязычная по умолчанию, русский
// включается только там, где устройство прямо про это сказало.
function detectDeviceLang(): Lang {
  try {
    const w = window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
    };
    const tg = w.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const nav = typeof navigator !== "undefined" ? navigator.language : "";
    const code = String(tg || nav || "").toLowerCase();
    if (code.startsWith("ru")) return "ru";
  } catch {
    // ignore
  }
  return "en";
}

// РЕАЛЬНЫЙ язык клиента: явный выбор (localStorage) → иначе язык устройства.
// ВАЖНО: НЕ вызывать в initial state стора — начальный рендер должен совпадать с
// SSR (всегда "en"), иначе устройство ловит hydration mismatch (React #418):
// сервер рендерит одно, клиент сразу другое → все тексты не совпадают, в Safari
// это ломает интерактив (кнопки перестают реагировать). Применять ПОСЛЕ
// монтирования через applyClientLang() (useEffect) — тогда re-render вне гидрации.
export function resolveClientLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem("lang");
    if (stored === "ru" || stored === "en") return stored;
  } catch {
    // ignore
  }
  return detectDeviceLang();
}

// Явно ли пользователь выбирал язык на этом устройстве (есть в localStorage).
export function hasExplicitLang(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const s = localStorage.getItem("lang");
    return s === "ru" || s === "en";
  } catch {
    return false;
  }
}

interface AppState {
  walletAddress: string | null;
  walletConnected: boolean;
  // Если установлен — следующий wallet:signIn трактуется как «добавление
  // ещё одного кошелька к текущей TG-сессии». NearConnectorBridge передаст
  // это значение в connectWallet({additionalFor}). После — flag очищается.
  pendingAddForWallet: string | null;
  lang: Lang;
  setWallet: (w: string | null) => void;
  setPendingAddForWallet: (w: string | null) => void;
  setLang: (l: Lang) => void;
}

export const useAppStore = create<AppState>((set) => ({
  walletAddress: null,
  walletConnected: false,
  pendingAddForWallet: null,
  // ВСЕГДА "en" на старте — совпадает с SSR (см. resolveClientLang). Реальный
  // язык применяется после монтирования через applyClientLang() (вне гидрации).
  lang: "en",
  setWallet: (w) => set({ walletAddress: w, walletConnected: !!w }),
  setPendingAddForWallet: (w) => set({ pendingAddForWallet: w }),
  setLang: (l) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("lang", l);
      } catch {
        // ignore
      }
    }
    set({ lang: l });
  },
}));

// Применить РЕАЛЬНЫЙ язык клиента ПОСЛЕ монтирования (вне гидрации). Вызвать один
// раз из корневого компонента в useEffect: первый рендер = SSR ("en"), затем язык
// устройства/localStorage применяется отдельным client-only re-render — без #418.
//
// Заодно ЗАКРЕПЛЯЕМ вычисленный язык на устройстве, даже если он совпал с
// текущим. Раньше запись была только при смене, и у игрока с русским
// устройством в localStorage не лежало ничего: смена языка по умолчанию
// молча переобувала бы его на английский. Теперь то, на чём человек играет
// сегодня, остаётся за ним, что бы мы ни поменяли завтра.
export function applyClientLang(): void {
  useAppStore.getState().setLang(resolveClientLang());
}

// DEV-ONLY (локальное превью): доступ к стору из консоли, чтобы форсить
// кошелёк (walletConnected). НЕ КОММИТИТЬ — откатить перед пушем.
if (typeof window !== "undefined") {
  (window as unknown as { __appStore?: typeof useAppStore }).__appStore =
    useAppStore;
}
