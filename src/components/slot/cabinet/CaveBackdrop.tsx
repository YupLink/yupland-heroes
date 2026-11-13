import { useEffect, useState } from "react";
import { asset, text } from "./shared";

const files = [
  "bonus-caves-2026-10-12.webp",
  "bonus-caves-fallback-2026-10-20.jpg",
] as const;

/** Explicit image lifecycle: a failed background must not leave a blind choice. */
export function CaveBackdrop({
  ru,
  onReady,
}: {
  ru: boolean;
  onReady: (ready: boolean) => void;
}) {
  const [image, setImage] = useState({
    format: 0,
    attempt: 0,
    status: "loading" as "loading" | "ready" | "error",
  });
  const src =
    asset(files[image.format]) +
    "?v=20261020" +
    (image.attempt ? `&retry=${image.attempt}` : "");
  const fail = () =>
    setImage((current) => {
      if (
        current.status !== "loading" ||
        current.format !== image.format ||
        current.attempt !== image.attempt
      )
        return current;
      return current.format === 0
        ? { ...current, format: 1 }
        : { ...current, status: "error" };
    });
  useEffect(() => {
    onReady(image.status === "ready");
  }, [image.status, onReady]);
  useEffect(() => {
    if (image.status !== "loading") return;
    const timer = window.setTimeout(fail, 12000);
    return () => window.clearTimeout(timer);
  }, [src, image.status]);
  return (
    <>
      {image.status !== "error" && (
        <img
          key={src}
          className="cave-backdrop"
          src={src}
          alt=""
          draggable={false}
          onLoad={() =>
            setImage((current) =>
              current.status === "loading" &&
              current.format === image.format &&
              current.attempt === image.attempt
                ? { ...current, status: "ready" }
                : current,
            )
          }
          onError={fail}
        />
      )}
      <div className="cave-shade" aria-hidden="true" />
      {image.status !== "ready" && (
        <div
          className="cave-art-status"
          role={image.status === "error" ? "alert" : "status"}
        >
          <p>
            {text(
              ru,
              image.status === "error"
                ? "Не удалось загрузить пещеры"
                : "Загружаем пещеры…",
              image.status === "error"
                ? "Could not load the caves"
                : "Loading caves…",
            )}
          </p>
          {image.status === "error" && (
            <button
              onClick={() => {
                onReady(false);
                setImage((current) => ({
                  format: 0,
                  attempt: current.attempt + 1,
                  status: "loading",
                }));
              }}
            >
              {text(ru, "Повторить", "Retry")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
