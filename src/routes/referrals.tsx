import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CastleReferrals } from "@/components/referrals/CastleReferrals";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "YupLink" },
      {
        name: "description",
        content: "Приглашай друзей: Bonus Box за этапы приглашений и 10–20 % золотом с их покупок.",
      },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  return (
    <AppShell>
      <CastleReferrals />
    </AppShell>
  );
}
