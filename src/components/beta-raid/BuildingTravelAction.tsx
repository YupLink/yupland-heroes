import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Castle, Footprints, Loader2 } from "lucide-react";

type Status = { here: { q: number; r: number } | null };
type Props = {
  q: number; r: number; ru: boolean; onClose: () => void;
  onGoTo?: (q: number, r: number) => void;
  enter?: (q: number, r: number) => Promise<boolean>;
  loadStatus: () => Promise<Status>;
};

/** The existing server status identifies this entrance. No distance rule is inferred here. */
export function BuildingTravelAction({ q, r, ru, onClose, onGoTo, enter, loadStatus }: Props) {
  const status = useQuery({
    queryKey: ["home-castle"], queryFn: loadStatus, enabled: !!enter,
    staleTime: 0, refetchOnMount: "always", retry: false,
  });
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!onGoTo && !enter) return null;
  const checking = pending || (!!enter && status.isFetching);
  const error = !!enter && status.isError;
  const here = status.data?.here;
  const canEnter = !!enter && status.isSuccess && here?.q === q && here?.r === r;
  const label = checking ? (ru ? "Проверяем…" : "Checking…")
    : error ? (ru ? "Повторить проверку" : "Retry check")
    : canEnter ? (ru ? "Войти в замок" : "Enter castle")
    : (ru ? "Идти сюда" : "Go here");
  return <div>
    {(error || failed) && <p role="alert" className="mb-2 text-center text-sm text-muted-foreground">
      {error ? (ru ? "Не удалось проверить положение героя." : "Could not check your hero's position.") : (ru ? "Не удалось войти. Проверь положение героя и попробуй ещё раз." : "Could not enter. Check your hero's position and try again.")}
    </p>}
    <button type="button" disabled={checking || (!canEnter && !onGoTo && !error)}
      data-enter-castle
      aria-busy={checking}
      onClick={async () => {
        if (lock.current) return;
        if (error) { void status.refetch(); return; }
        if (!canEnter) { onGoTo?.(q, r); onClose(); return; }
        lock.current = true; setPending(true); setFailed(false);
        try {
          if (await enter!(q, r)) onClose();
          else setFailed(true);
        } catch { setFailed(true); }
        finally { lock.current = false; setPending(false); }
      }}
      className={`flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${canEnter ? "gradient-gold text-gold-foreground" : "border border-border"}`}>
      {checking ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        : canEnter ? <Castle aria-hidden="true" className="h-4 w-4" /> : <Footprints aria-hidden="true" className="h-4 w-4" />}
      {label}
    </button>
  </div>;
}
