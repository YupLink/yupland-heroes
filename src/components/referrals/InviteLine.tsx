// «🎁 Тебя пригласил @nick — подарок ждёт: свой герой на выбор» (lib/referralShare.ts).
//   • InviteLine — гость открыл ссылку сайта (?ref=tg<id>) в браузере: экран входа;
//   • InviteText — уже известно, кто позвал (меню входа новичка).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { inviteWhoText, type InviteWho } from "@/lib/referralShare";
import { getRefInvite } from "@/server/api/ref-invite";

const refOfUrl = (): string | null => {
  if (typeof window === "undefined") return null;
  const ref = new URL(window.location.href).searchParams.get("ref")?.trim() ?? "";
  return /^tg\d{1,15}$/i.test(ref) ? ref : null;
};

export function InviteText({ who, className }: { who: InviteWho; className?: string }) {
  const t = useT();
  if (!who.invited) return null;
  return (
    <p className={className ?? "text-center text-sm font-semibold text-gold"}>
      {t("ref.invited_by", { who: inviteWhoText(who, t("ref.friend")) })}
    </p>
  );
}

export function InviteLine({ className }: { className?: string }) {
  const [ref] = useState(refOfUrl);
  const q = useQuery({
    queryKey: ["ref-invite", ref],
    queryFn: () => getRefInvite({ data: { ref: ref ?? "" } }),
    enabled: !!ref,
    staleTime: Infinity,
    retry: false,
  });
  return q.data ? <InviteText who={q.data} className={className} /> : null;
}
