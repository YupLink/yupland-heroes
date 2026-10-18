import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { getSession } from "@/server/api/user-auth";

export function SessionSync() {
  const setWallet = useAppStore((s) => s.setWallet);
  const { data } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  useEffect(() => {
    if (data) setWallet(data.wallet ?? null);
  }, [data, setWallet]);

  return null;
}
