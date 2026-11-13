import { lazy, Suspense, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { ShamanHutBody } from "./ShamanHutBody";
import { useShamanHutView } from "./useShamanHut";
import "./shaman-hut.css";

const ShamanAdminCard = lazy(() =>
  import("@/components/admin/shaman/ShamanAdminCard").then((m) => ({ default: m.ShamanAdminCard })),
);

export function ShamanHutModal({ onClose }: { onClose: () => void; icon: string }) {
  const t = useT();
  const q = useShamanHutView();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const admin = session.data?.isAdmin === true;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    closeRef.current?.focus();
    return () => {
      if (dialogRef.current?.open) dialogRef.current.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="shaman-hut-live"
      aria-labelledby="shaman-hut-live-title"
      onCancel={(event) => { event.preventDefault(); if (!dialogRef.current?.querySelector(".shaman-hut-live__admin-editor")) onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
    >
      <section
        className="shaman-hut-live__window"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shaman-hut-live__scene" aria-hidden="true" />
        <header className="shaman-hut-live__header">
          <h2 id="shaman-hut-live-title" className="font-display">{t("shaman.hut")}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("common.close")}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="shaman-hut-live__scroll">
          {q.isPending ? (
            <p role="status" className="shaman-hut-live__message">{t("shaman.loading")}</p>
          ) : q.isError && !q.data ? (
            <div className="shaman-hut-live__message">
              <p role="alert">{t("shaman.load_error")}</p>
              <button type="button" onClick={() => void q.refetch()}>{t("shaman.retry")}</button>
            </div>
          ) : q.data ? (
            <ShamanHutBody view={q.data} />
          ) : null}
          {admin && (
            <div className="shaman-hut-live__admin">
              <Suspense fallback={null}><ShamanAdminCard portalContainer={() => dialogRef.current} /></Suspense>
            </div>
          )}
        </div>
      </section>
    </dialog>
  );
}
