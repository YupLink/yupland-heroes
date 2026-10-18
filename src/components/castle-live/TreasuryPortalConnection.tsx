import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { getYuplandProfile, getYuplandStatus } from "@/server/api/user-shop";
import portalVortex from "@/assets/castle/profile-portal-vortex.webp";

/** Yupland is an external account; its energy is never the castle's play energy. */
export function TreasuryPortalConnection({ walletConnected }: { walletConnected: boolean }) {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["yupland-status", walletConnected],
    queryFn: () => getYuplandStatus(),
    enabled: walletConnected,
    staleTime: 60_000,
  });
  const profile = useQuery({
    queryKey: ["yupland-profile", walletConnected],
    queryFn: () => getYuplandProfile(),
    enabled: walletConnected,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!walletConnected) return;
    const onReturn = () => {
      void qc.invalidateQueries({ queryKey: ["yupland-status", true] });
      void qc.invalidateQueries({ queryKey: ["yupland-profile", true] });
      void qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
    };
    window.addEventListener("focus", onReturn);
    return () => window.removeEventListener("focus", onReturn);
  }, [walletConnected, qc]);
  const pending =
    walletConnected &&
    (status.isPending || profile.isPending || status.isFetching || profile.isFetching);
  const error = walletConnected && (status.isError || profile.isError);
  const linked = walletConnected && !error && status.data?.linked === true && !!profile.data;
  const balance =
    linked && status.data && "energyBalance" in status.data ? status.data.energyBalance : null;
  const refresh = () => {
    void Promise.all([status.refetch(), profile.refetch()]);
    void qc.invalidateQueries({ queryKey: ["my-yupland-status"] });
  };

  return (
    <section
      className="castle-profile__portal"
      aria-label={ru ? "Портал Yupland" : "Yupland portal"}
    >
      <span className="castle-profile__portal-icon" aria-hidden="true">
        <img src={portalVortex} alt="" />
      </span>
      <div className="castle-profile__portal-copy">
        <h3>{ru ? "Портал Yupland" : "Yupland portal"}</h3>
        <p role="status" className={linked && !pending ? "is-connected" : ""}>
          {!walletConnected
            ? ru
              ? "Сначала подключи кошелёк"
              : "Connect a wallet first"
            : error
              ? ru
                ? "Не удалось проверить связь"
                : "Could not check connection"
              : pending
                ? ru
                  ? "Проверяем связь…"
                  : "Checking connection…"
                : linked
                  ? ru
                    ? "● Подключён"
                    : "● Connected"
                  : ru
                    ? "Связь не найдена"
                    : "Connection not found"}
        </p>
        {linked && !pending && balance != null && (
          <small>
            {ru ? "Энергия Yupland" : "Yupland energy"}:{" "}
            {Number(balance).toLocaleString(ru ? "ru-RU" : "en-US")}
          </small>
        )}
        {walletConnected && !linked && !pending && !error && (
          <small>{ru ? "Войди там с этим кошельком" : "Sign in there with this wallet"}</small>
        )}
      </div>
      {walletConnected &&
        (linked || pending || error ? (
          <button
            type="button"
            className="castle-profile__portal-check"
            disabled={pending}
            onClick={refresh}
          >
            {ru ? "Проверить связь" : "Check connection"}
          </button>
        ) : (
          <div className="castle-profile__portal-actions">
            <a
              href="https://yupland.io"
              target="_blank"
              rel="noopener noreferrer"
              className="castle-profile__portal-check"
            >
              {ru ? "Открыть Yupland" : "Open Yupland"}
            </a>
            <button type="button" className="castle-profile__portal-retry" onClick={refresh}>
              {ru ? "Проверить связь" : "Check connection"}
            </button>
          </div>
        ))}
    </section>
  );
}
