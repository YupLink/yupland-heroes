// Вход через Google на экране гостя (владелец, 06.11.2026: «откроем для новых игроков —
// попадут сразу на остров новичков»). Кнопка видна, только когда вход открыт всем и
// задан Client ID; внутри Telegram её нет — Google не пускает вход из его WebView.
// С 09.11.2026 кнопка своя (GoogleOwnButton): не перерисовывается и не «дёргается»;
// место под неё держим, пока читается настройка, — экран не сдвигается.
import { useQuery } from "@tanstack/react-query";
import { getGoogleLoginConfig } from "@/server/api/google-login";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { inTelegramMiniApp } from "@/lib/auth/telegramLogin";
import { GoogleOwnButton } from "./GoogleOwnButton";

export function GoogleLoginButton() {
  const cfg = useQuery({
    queryKey: ["google-login-config"],
    queryFn: () => getGoogleLoginConfig(),
    staleTime: 5 * 60_000,
  });
  const signIn = useGoogleSignIn();
  if (inTelegramMiniApp()) return null;
  if (cfg.isPending) return <div className="h-[46px] w-full" aria-hidden="true" />;
  if (!cfg.data?.open || !cfg.data.clientId) return null;
  return (
    <div className="flex h-[46px] w-full items-center justify-center">
      <GoogleOwnButton
        clientId={cfg.data.clientId}
        disabled={signIn.isPending}
        onToken={(accessToken) => signIn.mutate({ accessToken })}
      />
    </div>
  );
}
