// «Вход через Google» в админке (владелец, 29.10.2026; 06.11.2026 — открыть всем):
// Client ID, вход для всех, тестовый вход, одно устройство — один аккаунт, список
// Google-аккаунтов и возможные мультиаккаунты.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { adminGoogleOverview, adminSetGoogleClientId } from "@/server/api/google-login";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { GoogleAccountsList } from "./GoogleAccountsList";
import { GoogleDeviceLimit } from "./GoogleDeviceLimit";
import { GoogleOpenSwitch } from "./GoogleOpenSwitch";
import { GoogleGroups } from "./GoogleGroups";

const queryKey = ["admin-google"];

export function GoogleLoginCard() {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const q = useQuery({ queryKey, queryFn: () => adminGoogleOverview(), staleTime: 0 });
  const save = useMutation({
    mutationFn: (clientId: string) => adminSetGoogleClientId({ data: { clientId } }),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey, refetchType: "all" });
      toast.success(t("google.saved"));
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const signIn = useGoogleSignIn();

  const saved = q.data?.clientId ?? "";
  const value = draft ?? saved;
  const changed = draft !== null && draft.trim() !== saved;
  const busy = save.isPending || signIn.isPending;

  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-card p-4"
      aria-labelledby="google-login-title"
    >
      <h2
        id="google-login-title"
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <KeyRound className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("google.title")}
      </h2>
      {q.isPending ? (
        <p role="status" className="text-sm">
          {t("google.loading")}
        </p>
      ) : q.isError || !q.data ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{humanError(q.error)}</p>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="min-h-11 rounded-lg border border-border px-3 py-2"
          >
            {t("google.retry")}
          </button>
        </div>
      ) : (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (changed) save.mutate(value.trim());
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              {t("google.client_id")}
              <input
                type="text"
                value={value}
                disabled={busy}
                spellCheck={false}
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 font-mono text-xs"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !changed}
              className="flex min-h-11 items-center gap-2 rounded-xl gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("google.save")}
            </button>
          </form>
          {q.data.clientId && (
            <GoogleSignInButton
              clientId={q.data.clientId}
              disabled={busy}
              onCredential={(credential) => signIn.mutate(credential)}
            />
          )}
          <GoogleOpenSwitch on={q.data.open} queryKey={queryKey} />
          <GoogleDeviceLimit on={q.data.deviceLimit} queryKey={queryKey} />
          <GoogleGroups groups={q.data.groups} />
          <GoogleAccountsList accounts={q.data.accounts} />
        </>
      )}
    </section>
  );
}
