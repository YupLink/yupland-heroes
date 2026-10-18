import { useEffect, useRef } from "react";
import { ChipImage } from "@/components/ChipImage";
import { useAppStore } from "@/lib/store";
import "./pack-reveal.css";

type RevealItem = { templateName: string; level: number; imageUrl: string | null };

function chipWord(count: number) {
  const last = count % 10;
  return count % 100 >= 11 && count % 100 <= 14
    ? "фишек"
    : last === 1
      ? "фишка"
      : last >= 2 && last <= 4
        ? "фишки"
        : "фишек";
}

export function PackReveal({
  items,
  title,
  onClose,
}: {
  items: RevealItem[];
  title: string;
  onClose: () => void;
}) {
  const ru = useAppStore((state) => state.lang) === "ru";
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="pack-reveal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="pack-reveal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pack-reveal-title"
      >
        <header className="pack-reveal-head">
          <span className="pack-reveal-source">{title}</span>
          <h2 id="pack-reveal-title">
            {ru
              ? `Выпало ${items.length} ${chipWord(items.length)}`
              : `${items.length} chips dropped`}
          </h2>
        </header>
        <div className="pack-reveal-list">
          {items.map((item, index) => (
            <div className="pack-reveal-item" key={`${item.templateName}-${index}`}>
              {item.imageUrl ? (
                <ChipImage
                  src={item.imageUrl}
                  level={item.level}
                  alt=""
                  className="pack-reveal-image"
                />
              ) : (
                <span className="pack-reveal-image-empty" aria-hidden="true">
                  ◆
                </span>
              )}
              <strong>{item.templateName}</strong>
              <small>{item.level}★</small>
            </div>
          ))}
        </div>
        <footer className="pack-reveal-actions">
          <button ref={closeRef} type="button" onClick={onClose}>
            {ru ? "Забрать" : "Collect"}
          </button>
        </footer>
      </section>
    </div>
  );
}
