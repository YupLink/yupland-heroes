import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { getAuctionUnread } from "@/server/api/game-auction";

export const auctionUnreadKey = (viewer: string) => ["auctions", "unread", viewer] as const;
export function useAuctionUnread() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const viewer = session.isSuccess ? session.data?.wallet ?? null : null;
  const enabled = !!viewer && !!(session.data as { features?: Record<string, boolean> } | undefined)?.features?.auctions;
  const query = useQuery({
    queryKey: auctionUnreadKey(viewer ?? "guest"),
    queryFn: ({ signal }) => getAuctionUnread({ signal }),
    enabled,
    refetchInterval: 30_000,
  });
  return { viewer, enabled, unreadCount: enabled && !query.isError ? query.data?.unreadCount : undefined };
}
