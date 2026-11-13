type ResourceGlyphKind = "tickets" | "likes" | "energy" | "gold";

const sources: Record<ResourceGlyphKind, string> = {
  tickets: "/resources/tickets.webp",
  likes: "/resources/likes.png",
  energy: "/resources/energy.png",
  gold: "/resources/gold.png",
};

/** Shared pixel icon for game currencies. Health hearts and ability bolts stay separate. */
export function ResourceGlyph({
  kind,
  className = "h-4 w-4",
  label,
}: {
  kind: ResourceGlyphKind;
  className?: string;
  label?: string;
}) {
  return (
    <img
      src={sources[kind]}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 object-contain [image-rendering:pixelated] ${className}`}
    />
  );
}
