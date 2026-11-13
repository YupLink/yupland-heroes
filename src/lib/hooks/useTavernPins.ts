// Закладки героев в таверне — с аккаунта, одни на телефоне и на ПК (жалоба
// игрока 04.11.2026). Щелчок срабатывает сразу (оптимистично), сервер
// догоняет; отказал — перечитываем список с сервера и говорим об ошибке.
// Правки уходят по очереди (scope): ответ первой не перебьёт вторую.
//
// Переезд: закладки, сделанные до него, лежат в localStorage устройства. Один
// раз на пару «устройство + аккаунт» они дописываются к списку аккаунта —
// никто не теряет закреплённого ни на одном из своих устройств.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTavernPins, saveTavernPins } from "@/server/api/tavern-pins";
import {
  applyPinsPatch,
  legacyPinsToImport,
  togglePinPatch,
  type TavernPinsPatch,
} from "@/lib/hero/tavernPins";

const LEGACY_KEY = "yuplink:tavern-hero-pins:v1";
const importedKey = (wallet: string) => `yuplink:tavern-hero-pins:imported:${wallet}`;
const SAVE_KEY = ["tavern-pins-save"] as const;
const EMPTY: string[] = [];

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Приватный режим: перенос повторится при следующем заходе — он идемпотентен. */
  }
}

export function useTavernPins(wallet: string | null) {
  const qc = useQueryClient();
  const key = ["tavern-pins", wallet ?? ""] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => getTavernPins(),
    enabled: !!wallet,
    // Каждое открытие таверны сверяется с сервером: закрепил на телефоне —
    // открыл на ПК — видно сразу.
    staleTime: 0,
  });
  const pins = query.data ?? EMPTY;
  const [saveError, setSaveError] = useState(false);
  const save = useMutation({
    mutationKey: SAVE_KEY,
    scope: { id: "tavern-pins" },
    mutationFn: (patch: TavernPinsPatch) => saveTavernPins({ data: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<string[]>(key, (before) => applyPinsPatch(before ?? [], patch));
    },
    onSuccess: (saved) => {
      if (qc.isMutating({ mutationKey: SAVE_KEY }) <= 1) qc.setQueryData(key, saved);
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const { mutateAsync } = save;
  const importedFor = useRef<string | null>(null);
  const loaded = query.isSuccess;
  useEffect(() => {
    if (!wallet || !loaded || importedFor.current === wallet) return;
    importedFor.current = wallet;
    if (readStorage(importedKey(wallet))) return;
    const server = qc.getQueryData<string[]>(["tavern-pins", wallet]) ?? [];
    const add = legacyPinsToImport(readStorage(LEGACY_KEY), server);
    const done = () => writeStorage(importedKey(wallet), "1");
    if (!add.length) return done();
    // Не вышло (сеть, база) — молча, повторим при следующем открытии.
    mutateAsync({ add, remove: [] }).then(done, () => {});
  }, [wallet, loaded, qc, mutateAsync]);

  const togglePin = (heroKey: string) => {
    mutateAsync(togglePinPatch(pins, heroKey)).then(
      () => setSaveError(false),
      () => setSaveError(true),
    );
  };
  return { pinnedKeys: new Set(pins), togglePin, saveError };
}
