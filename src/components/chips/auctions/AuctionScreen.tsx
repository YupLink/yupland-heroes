// Содержимое окна аукциона: две вкладки — «Аукционы» (лоты игры; админу там же
// создание и управление, AuctionsAdminPanel) и «От игроков» (аукционный дом:
// мой дом: лоты и «Выставить» + лоты игроков; строится дом в Ратуше замка).
// Одно окно и для запуска, и для торгов.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { useLang } from "@/lib/i18n";
import { AuctionsPlayerPanel } from "./AuctionsPlayerPanel";
import { AuctionHouseBar } from "./AuctionHouseBar";
import { AuctionsAdminPanel } from "@/components/admin/AuctionsAdminPanel";
import "./auction-house.css";

type Tab = "game" | "player";

export function AuctionScreen({ initialTab = "game" }: { initialTab?: Tab }) {
  const en = useLang() === "en";
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const isAdmin = !!session.data?.isAdmin;
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "game", label: en ? "Auctions" : "Аукционы" },
    { id: "player", label: en ? "From players" : "От игроков" },
  ];
  return (
    <>
      <div className="auction-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`auction-tab${tab === t.id ? " auction-tab--on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "player" ? (
        <>
          <AuctionHouseBar />
          <AuctionsPlayerPanel source="player" />
        </>
      ) : isAdmin ? (
        <AuctionsAdminPanel />
      ) : (
        <AuctionsPlayerPanel source="game" />
      )}
    </>
  );
}
