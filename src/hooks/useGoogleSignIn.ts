// Вход Google-игроком (экран входа гостя и тест из /admin/google): ID-токен →
// loginWithGoogle → смена аккаунта в этой же вкладке (как вход по Telegram, без
// обновления страницы) → /chips: новичок выбирает расу и попадает на остров.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useAppStore } from "@/lib/store";
import { getDeviceId } from "@/lib/auth/deviceId";
import { deviceFingerprint } from "@/lib/auth/deviceFingerprint";
import { resetAccountQueries } from "@/lib/auth/resetAccountQueries";
import { loginWithGoogle } from "@/server/api/google-login";

export function useGoogleSignIn() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const setWallet = useAppStore((s) => s.setWallet);
  return useMutation({
    // credential — ID-токен кнопки Google (админка); { accessToken } — своя кнопка входа.
    mutationFn: async (token: string | { accessToken: string }) => {
      const auth = typeof token === "string" ? { credential: token } : token;
      const fp = await deviceFingerprint();
      // Реф-ссылка сайта (?ref=…) — новый игрок станет другом пригласившего.
      const ref = new URL(window.location.href).searchParams.get("ref")?.trim().slice(0, 120);
      return loginWithGoogle({
        data: { ...auth, device: getDeviceId(), ...(fp ? { fp } : {}), ...(ref ? { ref } : {}) },
      });
    },
    onSuccess: async (res) => {
      // Сессия уже чужая для кэша: сброс аккаунтных ключей и перечитать остальное.
      await resetAccountQueries(qc);
      setWallet(res.wallet);
      void qc.invalidateQueries({ refetchType: "all" });
      void navigate({ to: "/chips" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
}
