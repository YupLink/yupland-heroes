// Кто позвал гостя, открывшего ссылку сайта (?ref=tg<id>) в браузере, — подпись на
// экране входа (lib/referralShare.ts). Только ник Telegram; частота — по адресу сети.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { InviteWho } from "@/lib/referralShare";

const ipOf = (): string => {
  try {
    const xff = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
    return xff || getRequestHeader("x-real-ip") || "-";
  } catch {
    return "-";
  }
};

export const getRefInvite = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ ref: z.string().max(40) }).parse(d))
  .handler(async ({ data }): Promise<InviteWho> => {
    const { rateGate } = await import("@/server/rateGate");
    await rateGate(`invite:${ipOf()}`, { limit: 20, windowMs: 60_000 });
    const { inviteOfRef } = await import("@/server/referralInviter");
    return inviteOfRef(data.ref);
  });
