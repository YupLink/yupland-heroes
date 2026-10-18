import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { CastleReferrals } from "@/components/referrals/CastleReferrals";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "YupLink" },
      {
        name: "description",
        content: "Приглашай друзей: за каждого, кто погасит NFT, получаешь +1 билет на клейм.",
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
