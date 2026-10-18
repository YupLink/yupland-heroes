// Персист выбора языка «навсегда»:
//   • localStorage (быстрый локальный кэш, per-device) — в store.setLang.
//   • БД по TG-аккаунту (кросс-девайс) — setMyLang + чтение в getSession.
//   • Дефолт по языку устройства/Telegram — в store.initLang.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore, type Lang } from "./store";
import { getSession, setMyLang } from "@/server/api/user-auth";

/** Установить язык + сохранить навсегда в БД (fire-and-forget). */
export function useSetLang(): (l: Lang) => void {
  const setLang = useAppStore((s) => s.setLang);
  return (l: Lang) => {
    setLang(l);
    void setMyLang({ data: { lang: l } }).catch(() => {});
  };
}

// Один раз за загрузку страницы применяем сохранённый язык аккаунта из БД
// (источник правды для залогиненного юзера — следует за ним на др. устройства).
let langSynced = false;
/** Вызывать в общем layout (AppShell), чтобы язык аккаунта подхватывался. */
export function useLangSync(): void {
  const setLang = useAppStore((s) => s.setLang);
  const { data } = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  useEffect(() => {
    if (langSynced) return;
    const db = data?.lang;
    if (db === "ru" || db === "en") {
      langSynced = true;
      if (db !== useAppStore.getState().lang) setLang(db);
    }
  }, [data, setLang]);
}
