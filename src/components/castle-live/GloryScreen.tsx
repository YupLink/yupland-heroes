// Castle damage leaderboard. Read-only; uses the existing tournament API.
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBetaRaidTournament } from "@/server/api/beta-raid";
import { useLang } from "@/lib/i18n";
import "./glory-screen.css";

const PAGE_SIZE = 20;

export function GloryScreen(_props: { defaultOpen?: boolean } = {}) {
  const ru = useLang() === "ru";
  const format = (value: number) => value.toLocaleString(ru ? "ru-RU" : "en-US");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [atBottom, setAtBottom] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const ranking = useQuery({
    queryKey: ["beta-raid-tournament"],
    queryFn: () => getBetaRaidTournament(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const players = ranking.data?.players ?? [];
  const wideDamage = players.some((player) => player.totalDamage >= 100_000);
  const shown = players.slice(0, visible);
  const myHiddenRow = players.find((player) => player.mine && !shown.includes(player));
  const more = Math.max(0, players.length - visible);
  const participantCount = players.length < 200 ? String(players.length) : "200+";
  const myPlace = ranking.data?.myRank;
  const t = (russian: string, english: string) => (ru ? russian : english);

  const row = (player: (typeof players)[number]) => (
    <tr
      key={player.wallet}
      className={`glory-screen__row${player.mine ? " glory-screen__row--mine" : ""}`}
    >
      <th
        scope="row"
        className={`glory-screen__place glory-screen__place--${Math.min(player.place, 4)}`}
      >
        <span aria-label={t(`Место ${player.place}`, `Rank ${player.place}`)}>{player.place}</span>
      </th>
      <td className="glory-screen__name" title={player.name}>
        {player.name}
        {player.mine && <span className="glory-screen__you"> {t("(ты)", "(you)")}</span>}
      </td>
      <td className="glory-screen__damage" title={format(player.totalDamage)}>
        {format(player.totalDamage)}
      </td>
    </tr>
  );

  return (
    <main className="glory-screen" aria-label={t("Рейтинг урона", "Damage ranking")}>
      {!ranking.isPending && !ranking.isError && (
        <p className="glory-screen__participants">
          {myPlace ? (
            <>
              <strong>
                {t("Твоё место:", "Your rank:")} {format(myPlace)}
              </strong>
              <span>
                {" "}
                · {t("участников:", "players:")} {participantCount}
              </span>
            </>
          ) : (
            t(`Участников: ${participantCount}`, `Players: ${participantCount}`)
          )}
        </p>
      )}
      <section className="glory-screen__board" aria-labelledby="glory-ranking-title">
        <h2 id="glory-ranking-title">{t("Рейтинг урона", "Damage ranking")}</h2>
        <div
          ref={listRef}
          className="glory-screen__list"
          onScroll={(event) => {
            const panel = event.currentTarget;
            setAtBottom(panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 8);
          }}
        >
          {ranking.isPending ? (
            <p className="glory-screen__state" role="status">
              {t("Загрузка рейтинга…", "Loading ranking…")}
            </p>
          ) : ranking.isError ? (
            <div className="glory-screen__state" role="alert">
              <p>{t("Не удалось загрузить рейтинг.", "Could not load the ranking.")}</p>
              <button onClick={() => void ranking.refetch()}>{t("Повторить", "Retry")}</button>
            </div>
          ) : players.length === 0 ? (
            <p className="glory-screen__state">{t("Пока нет результатов.", "No results yet.")}</p>
          ) : (
            <>
              <table
                className={`glory-screen__table${wideDamage ? " glory-screen__table--wide-damage" : ""}`}
              >
                <thead>
                  <tr>
                    <th scope="col">{t("Место", "Rank")}</th>
                    <th scope="col">{t("Игрок", "Player")}</th>
                    <th scope="col">{t("Урон", "Damage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(row)}
                  {myHiddenRow && (
                    <>
                      <tr className="glory-screen__ellipsis" aria-hidden="true">
                        <td colSpan={3}>···</td>
                      </tr>
                      {row(myHiddenRow)}
                    </>
                  )}
                </tbody>
              </table>
              {more > 0 && (
                <button
                  className="glory-screen__more"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                >
                  {t(
                    `Показать ещё ${Math.min(PAGE_SIZE, more)}`,
                    `Show ${Math.min(PAGE_SIZE, more)} more`,
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </section>
      {!ranking.isPending && !ranking.isError && players.length > 9 && !atBottom && (
        <button
          className="glory-screen__scroll"
          aria-label={t("Прокрутить рейтинг вниз", "Scroll ranking down")}
          onClick={() => {
            const list = listRef.current;
            if (list)
              list.scrollTo({ top: list.scrollTop + list.clientHeight * 0.75, behavior: "auto" });
          }}
        >
          ↓
        </button>
      )}
    </main>
  );
}
