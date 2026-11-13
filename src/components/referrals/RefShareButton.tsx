// «Поделиться» приглашением (lib/referralShare.ts). В Телеграме — его окно выбора
// чата с готовым текстом и ссылкой бота. В браузере — системное «Поделиться»
// (телефон: мессенджеры, почта), а где его нет (компьютер) — текст со ссылкой сайта
// в буфер обмена.
import { Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { copyText } from "@/lib/copyText";
import { inTelegramMiniApp } from "@/lib/auth/telegramLogin";
import { shareLink, tgShareUrl } from "@/lib/referralShare";

type TgApp = { openTelegramLink?: (url: string) => void };

export function RefShareButton({ tgLink, webLink }: { tgLink: string | null; webLink: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const inTg = inTelegramMiniApp();
  const link = shareLink(inTg, tgLink, webLink);
  const share = async () => {
    const text = t("ref.share_text");
    const tg = (window as unknown as { Telegram?: { WebApp?: TgApp } }).Telegram?.WebApp;
    if (inTg && tg?.openTelegramLink) return tg.openTelegramLink(tgShareUrl(link, text));
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url: link });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    if (await copyText(`${text}\n${link}`)) toast.success(t("ref.share_copied"));
  };
  return (
    <button
      type="button"
      disabled={!link || busy}
      onClick={() => {
        setBusy(true);
        void share().finally(() => setBusy(false));
      }}
      className="flex w-full items-center justify-center gap-2.5 rounded-xl gradient-gold px-4 py-4 text-base font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02] disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
      {t("ref.share")}
    </button>
  );
}
