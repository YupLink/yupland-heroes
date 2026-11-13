// Профиль: привязать Google к аккаунту Telegram или кошелька (владелец, 11.11.2026,
// §8.127). Потом вход этим Google на service.yupland.io открывает этот же аккаунт без
// Google-ограничений. Только в браузере: в Telegram окно Google не открывается.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { inTelegramMiniApp } from "@/lib/auth/telegramLogin";
import { getGoogleLink, linkGoogle } from "@/server/api/google-login";
import { GoogleOwnButton } from "@/components/auth/GoogleOwnButton";

export function GoogleLinkRow() {
  const t = useT();
  const qc = useQueryClient();
  const [inTelegram] = useState(inTelegramMiniApp);
  const q = useQuery({ queryKey: ["google-link"], queryFn: () => getGoogleLink() });
  const link = useMutation({
    mutationFn: (accessToken: string) => linkGoogle({ data: { accessToken } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["google-link"] }),
  });
  const d = q.data;
  if (!d) return null;
  if (d.linked)
    return (
      <p className="castle-profile__row text-sm">
        <span>{t("entry.google_linked", { email: d.email ?? "Google" })}</span>
      </p>
    );
  if (inTelegram || !d.clientId) return null;
  return (
    <section className="space-y-2 py-2">
      <div className="flex justify-center">
        <GoogleOwnButton
          clientId={d.clientId}
          disabled={link.isPending}
          label={t("entry.google_link")}
          onToken={(token) => link.mutate(token)}
        />
      </div>
      {link.isError && (
        <p role="alert" className="px-3 text-sm text-destructive">
          {humanError(link.error)}
        </p>
      )}
    </section>
  );
}
