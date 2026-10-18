// Письма на весь экран при входе в игру (владелец, 04.10.2026).
//
// Подключено в корне игры (ChipsPage) рядом с квитанцией ввода NFT. Читаем
// письма один раз на вход (и при возврате во вкладку — не чаще раза в минуту),
// показываем по одному; «Понятно» убирает письмо сразу и отмечает на сервере —
// больше оно не придёт.
//
// Не react-query намеренно: его кэш сохраняется в localStorage на сутки, и при
// следующем входе игрок увидел бы вчерашнее, уже прочитанное письмо, пока идёт
// перезапрос. Здесь — только свежий ответ сервера.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "@/lib/store";
import type { PlayerLetter } from "@/lib/letters";
import { getMyLetters, markLetterSeen } from "@/server/api/letters/letters-player";
import { LetterWindow } from "./LetterWindow";
import { letterQueue, nextLetters, withDone } from "./letterQueue";

/** Возврат во вкладку перечитывает письма не чаще раза в минуту. */
const REFRESH_MS = 60_000;

/** Пришедшие письма и убранные «Понятно» — одним стейтом: свежий ответ сверяется с убранными. */
type Box = { letters: PlayerLetter[]; done: ReadonlySet<string> };
const EMPTY: Box = { letters: [], done: new Set() };

/** Отметка «прочитано» с одним повтором: сеть икнула — письмо не должно вернуться. */
function markSeen(id: string): void {
  const send = () => markLetterSeen({ data: { id } });
  send().catch(() => setTimeout(() => void send().catch(() => {}), 3000));
}

export function PlayerLetters() {
  const connected = useAppStore((s) => s.walletConnected);
  const wallet = useAppStore((s) => s.walletAddress);
  const [box, setBox] = useState<Box>(EMPTY);
  const loadedAt = useRef(0);
  // Сменился кошелёк — ответ, начатый для прежнего, уже не наш.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const my = gen.current;
    loadedAt.current = Date.now();
    try {
      const fresh = await getMyLetters();
      if (my !== gen.current || !Array.isArray(fresh)) return;
      setBox((b) => ({ ...b, letters: nextLetters(b.letters, fresh, b.done) }));
    } catch {
      // Письмо — не повод для ошибки поверх игры: в следующий вход придёт снова.
    }
  }, []);

  useEffect(() => {
    gen.current += 1;
    setBox(EMPTY);
    if (!connected) return;
    void load();
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > REFRESH_MS)
        void load();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [connected, wallet, load]);

  const queue = letterQueue(box.letters, box.done);
  const current = queue.current;
  if (!current || typeof document === "undefined") return null;

  const ok = () => {
    setBox((b) => ({ ...b, done: withDone(b.done, current.id) }));
    markSeen(current.id);
  };

  return createPortal(
    <LetterWindow
      key={current.id}
      letter={current}
      position={queue.position}
      total={queue.total}
      onOk={ok}
    />,
    document.body,
  );
}
