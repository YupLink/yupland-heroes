import { useCallback, useEffect, useRef, useState } from "react";
import { humanError } from "@/lib/humanError";
import { decodeModularLayout, serializeModularLayout, type SceneBuilding } from "./modularCastleLayout";
import { castleLayoutTransport } from "./castleLayoutTransport";
import { loadAccountLayout, saveAccountLayout, type LocalCandidate } from "./castleLayoutClient";
import type { ModularLayoutItem } from "@/server/api/castle-layout/layout-schema";

type SyncState = "loading" | "ready" | "error" | "saving";
const accountKey = (telegramId: number) => `telegram:${telegramId}`;
const LOAD_RETRY_MS = [1000, 3000] as const;
const baseLayout = () => decodeModularLayout([]);
const sameScene = (a: SceneBuilding[], b: SceneBuilding[]) =>
  JSON.stringify(serializeModularLayout(a)) === JSON.stringify(serializeModularLayout(b));

/** The server is authoritative; the legacy device key is never uploaded on load. */
export function useCastleLayoutSync(
  telegramId: number | null | undefined,
  ru: boolean,
  onLoad: (buildings: SceneBuilding[], local?: boolean) => void,
) {
  const [state, setState] = useState<SyncState>("loading");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [candidate, setCandidate] = useState<LocalCandidate<ModularLayoutItem> | null>(null);
  const [conflict, setConflict] = useState<{ revision: number; layout: ModularLayoutItem[] | null } | null>(null);
  const [loadedOwner, setLoadedOwner] = useState<number | null>(null);
  const ownerRef = useRef(telegramId), ticketRef = useRef(0), revisionRef = useRef(0), savingRef = useRef(false);
  const onLoadRef = useRef(onLoad);
  ownerRef.current = telegramId;
  onLoadRef.current = onLoad;

  const reload = useCallback(async () => {
    const ticket = ++ticketRef.current, owner = telegramId;
    setState("loading"); setError(""); setConflict(null); setCandidate(null); setLoadedOwner(null);
    onLoadRef.current(baseLayout());
    if (owner === undefined) return;
    if (owner === null) {
      setError(ru ? "Войди в аккаунт, чтобы загрузить замок" : "Sign in to load your castle");
      setState("error");
      return;
    }
    try {
      // Сбой сети на входе в замок — ещё две попытки до экрана ошибки (04.11.2026).
      let loaded: Awaited<ReturnType<typeof loadAccountLayout<ModularLayoutItem>>> | null = null;
      for (let n = 0; !loaded; n++) {
        try {
          loaded = await loadAccountLayout(castleLayoutTransport, localStorage, accountKey(owner));
        } catch (e) {
          if (n >= LOAD_RETRY_MS.length) throw e;
          await new Promise(done => window.setTimeout(done, LOAD_RETRY_MS[n]));
          if (ticket !== ticketRef.current || ownerRef.current !== owner) return;
        }
      }
      if (ticket !== ticketRef.current || ownerRef.current !== owner) return;
      const scene = decodeModularLayout(loaded.remote.layout);
      revisionRef.current = loaded.remote.revision;
      setRevision(loaded.remote.revision);
      // A default PC scene does not count as a phone layout to import.
      const local = loaded.candidate;
      setCandidate(local && !sameScene(decodeModularLayout(local.layout), baseLayout()) ? local : null);
      onLoadRef.current(scene);
      setLoadedOwner(owner);
      setState("ready");
    } catch (e) {
      if (ticket !== ticketRef.current || ownerRef.current !== owner) return;
      setError(ru ? "Не удалось загрузить замок. Повтори попытку." : "Could not load your castle. Retry.");
      setState("error");
    }
  }, [telegramId, ru]);

  useEffect(() => { void reload(); return () => { ticketRef.current++; }; }, [reload]);

  const showDeviceLayout = useCallback(() => {
    if (state !== "ready" || loadedOwner !== telegramId || !candidate) return false;
    onLoadRef.current(decodeModularLayout(candidate.layout), true);
    setCandidate(null);
    return true;
  }, [state, loadedOwner, telegramId, candidate]);

  const save = useCallback(async (buildings: SceneBuilding[]) => {
    const owner = telegramId, ticket = ticketRef.current;
    if (owner == null || loadedOwner !== owner || state !== "ready" || savingRef.current || conflict) return false;
    savingRef.current = true; setState("saving"); setError("");
    const layout = serializeModularLayout(buildings) as ModularLayoutItem[];
    try {
      const result = await saveAccountLayout(castleLayoutTransport, localStorage, accountKey(owner), revisionRef.current, layout);
      if (ticket !== ticketRef.current || ownerRef.current !== owner) return false;
      if (!result.ok) {
        setConflict({ revision: result.revision, layout: result.layout });
        setCandidate({ source: "draft", layout });
        setError(ru ? "Замок изменён на другом устройстве. Твои правки сохранены здесь. Загрузи актуальную сцену перед продолжением." : "Your castle changed on another device. Your edits remain on this device. Load the latest scene before continuing.");
        return false;
      }
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setCandidate(null);
      return true;
    } catch (e) {
      if (ticket === ticketRef.current && ownerRef.current === owner) setError(humanError(e));
      return false;
    } finally {
      savingRef.current = false;
      if (ticket === ticketRef.current && ownerRef.current === owner) setState("ready");
    }
  }, [telegramId, loadedOwner, state, conflict, ru]);

  const showConflictScene = useCallback(() => {
    if (!conflict || loadedOwner !== telegramId) return false;
    revisionRef.current = conflict.revision;
    setRevision(conflict.revision);
    onLoadRef.current(decodeModularLayout(conflict.layout));
    setConflict(null); setError("");
    return true;
  }, [conflict, loadedOwner, telegramId]);

  return {
    state: state === "error" || (loadedOwner === telegramId && telegramId != null) ? state : "loading" as SyncState,
    error, revision, candidate, conflict,
    reload, showDeviceLayout, showConflictScene, save,
  };
}
