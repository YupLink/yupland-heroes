import { useState } from 'react';
import { thumb } from '@/lib/image';
import { worldAssetImage, type WorldArt } from './worldArt';

/** Use the world picture without changing the selected item or its stored URL. */
export function WorldArtThumbnail({ art, kind, id, original, width, className, cut }: {
  art: WorldArt | null; kind: string; id: string; original: string;
  width: number; className?: string; cut?: 'black' | 'white';
}) {
  const image = worldAssetImage(art, kind, id, original)!;
  const [failed, setFailed] = useState<string | null>(null);
  const src = thumb(failed === image ? original : image, width, cut);
  return <img src={src} alt="" className={className}
    onError={() => { if (image !== original && failed !== image) setFailed(image); }} />;
}
