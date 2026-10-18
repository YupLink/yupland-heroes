import { useEffect, useRef, useState } from "react";
import { cardLabel, cardRed, type Card } from "@/lib/slot/risk";
import { num, text, useTimeline, vars, type SceneProps } from "./shared";

function Face({ card }: { card: Card }) {
  const label = cardLabel(card),
    rank = label.slice(0, -1),
    suit = label.slice(-1),
    corner = (
      <>
        <span>{rank}</span>
        <small>{suit}</small>
      </>
    );
  return (
    <>
      <span className="card-corner">{corner}</span>
      <span className="card-pip">{suit}</span>
      <span className="card-corner card-corner-bottom">{corner}</span>
    </>
  );
}
function CardArt({ card }: { card?: Card }) {
  return (
    <span className="card-turn" aria-hidden="true">
      <span className="card-side card-back">?</span>
      <span
        className={
          "card-side card-face" + (card && cardRed(card) ? " is-red" : "")
        }
      >
        {card && card.rank > 0 && <Face card={card} />}
      </span>
    </span>
  );
}
export function RiskScene({ state, act, ru, acting }: SceneProps) {
  const game = state.risk!,
    timeline = useTimeline(),
    lock = useRef(false);
  const [stage, setStage] = useState<
      "drawing" | "moving" | "face" | "picking" | "result"
    >("drawing"),
    [host, setHost] = useState(0);
  const [requestError, setRequestError] = useState(false);
  const scene = useRef<HTMLElement>(null);
  useEffect(() => {
    scene.current
      ?.querySelector<HTMLButtonElement>(
        stage === "picking"
          ? ".card:not(:disabled)"
          : stage === "result"
            ? ".risk-action-primary"
            : ".scene-exit",
      )
      ?.focus({ preventScroll: true });
  }, [stage]);
  const take = () =>
    void act({
      type:
        game.stake > 0 && game.outcome !== "lose" ? "risk-take" : "risk-close",
    });
  useEffect(() => {
    let active = true;
    timeline.cancel();
    lock.current = false;
    setRequestError(false);
    if (game.picked !== null) {
      setStage("result");
      return;
    }
    setStage("drawing");
    setHost(0);
    void (async () => {
      if (!(await timeline.wait(180)) || !active) return;
      setHost(1);
      if (!(await timeline.wait(260)) || !active) return;
      setHost(2);
      if (!(await timeline.wait(180)) || !active) return;
      setHost(0);
      setStage("moving");
      if (!(await timeline.wait(420)) || !active) return;
      setStage("face");
      if (!(await timeline.wait(640, true)) || !active) return;
      setStage("picking");
    })();
    return () => {
      active = false;
    };
  }, [game]);
  // Preserve the live game's automatic next deal after a win or a tie.
  useEffect(() => {
    if (
      stage !== "result" ||
      game.picked === null ||
      game.done ||
      game.outcome === "lose"
    )
      return;
    let active = true;
    void timeline.wait(1500, true).then(async (ok) => {
      if (ok && active) {
        const res = await act({ type: "risk-next" });
        if (!res) setRequestError(true);
      }
    });
    return () => {
      active = false;
    };
  }, [stage, game]);
  const pick = async (index: number) => {
    if (lock.current || acting || stage !== "picking" || game.picked !== null)
      return;
    lock.current = true;
    const result = await act({ type: "risk-pick", index });
    if (!result) {
      lock.current = false;
      setRequestError(true);
    }
  };
  const result = game.picked !== null,
    shown = stage === "face" || stage === "picking" || result;
  const prompt = result
    ? text(
        ru,
        {
          win: "Твоя карта старше · Выигрыш удвоен!",
          push: "Карты равны · Выигрыш сохранён",
          lose: "Твоя карта младше · Выигрыш потерян",
        }[game.outcome!] ?? "",
        {
          win: "Your card is higher · Winnings doubled!",
          push: "A tie · Winnings kept",
          lose: "Your card is lower · Winnings lost",
        }[game.outcome!] ?? "",
      )
    : stage === "picking"
      ? text(
          ru,
          "Твой ход · Выбери карту старше ",
          "Your turn · Choose a card higher than ",
        ) + cardLabel(game.dealer)
      : text(ru, "Юпик вытягивает карту…", "Yupik is drawing a card…");
  return (
    <section
      ref={scene}
      className="scene risk"
      aria-label={text(ru, "Игра с картами", "Card game")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !acting) {
          event.preventDefault();
          take();
        }
      }}
    >
      <header className="scene-head">
        <h2>{text(ru, "Карты", "Cards")}</h2>
        <button
          className="scene-exit"
          disabled={acting}
          onClick={take}
          aria-label={text(
            ru,
            "Вернуться к автомату и забрать выигрыш",
            "Return to the slot and collect winnings",
          )}
        >
          ×
        </button>
      </header>
      <div className="scene-info">
        {text(ru, "Выигрыш: ", "Winnings: ")}
        {num(game.stake, ru)}
      </div>
      <div className="risk-table-plane">
        <div
          className="risk-host"
          style={vars({ "--risk-host-frame": host * 50 + "%" })}
          role="img"
          aria-label={text(
            ru,
            "Юпик за карточным столом",
            "Yupik at the card table",
          )}
        />
        <div className="risk-deal">
          <div className="risk-dealer">
            <span className="risk-dealer-label">
              {text(ru, "Карта Юпика", "Yupik’s card")}
            </span>
            <div
              id="dealer-card"
              className={
                "playing-card" +
                (stage !== "drawing" ? " is-dealt" : "") +
                (shown ? " is-revealed" : "")
              }
              role="img"
              aria-label={
                shown
                  ? text(ru, "Карта Юпика: ", "Yupik’s card: ") +
                    cardLabel(game.dealer)
                  : text(ru, "Юпик вытягивает карту", "Yupik is drawing a card")
              }
            >
              <CardArt card={game.dealer} />
            </div>
          </div>
          <p className="risk-rule">
            {text(
              ru,
              "Карта старше, чем у Юпика, — ",
              "A card higher than Yupik’s — ",
            )}
            <strong>{text(ru, "выигрыш ×2", "winnings ×2")}</strong>
          </p>
          <div
            className={"cards" + (result ? " has-choice" : "")}
            role="group"
            aria-label={text(
              ru,
              "Выбери карту старше карты Юпика",
              "Choose a card higher than Yupik’s",
            )}
          >
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                className={"card playing-card" + (result ? " is-revealed" : "")}
                disabled={acting || stage !== "picking" || result}
                data-outcome={
                  game.picked === i ? (game.outcome ?? undefined) : undefined
                }
                onClick={() => void pick(i)}
                aria-label={
                  result
                    ? cardLabel(game.hand[i])
                    : text(ru, "Закрытая карта ", "Hidden card ") + (i + 1)
                }
              >
                <CardArt card={result ? game.hand[i] : undefined} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="scene-result" role="status">
        {requestError
          ? text(
              ru,
              "Не удалось получить ответ. Попробуй ещё раз.",
              "Could not get a response. Please try again.",
            )
          : prompt}
      </div>
      <div className="risk-actions">
        <button
          className="risk-action risk-action-primary"
          disabled={acting}
          onClick={take}
        >
          {game.stake > 0
            ? text(ru, "Забрать ", "Collect ") + num(game.stake, ru)
            : text(ru, "К автомату", "Back to slot")}
        </button>
        {result && !game.done && (
          <button
            className="risk-action"
            disabled={acting}
            onClick={() => void act({ type: "risk-next" })}
          >
            {text(
              ru,
              game.outcome === "push" ? "Выбрать снова" : "Удвоить ещё",
              game.outcome === "push" ? "Draw again" : "Double again",
            )}
          </button>
        )}
      </div>
    </section>
  );
}
