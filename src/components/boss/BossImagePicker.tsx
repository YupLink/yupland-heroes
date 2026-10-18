import { useState } from "react";
import { Loader2, Skull, Upload } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { uploadFile } from "./boss-screen-types";

export function BossImagePicker({ url, onUrl }: { url: string; onUrl: (u: string) => void }) {
  const t = useT();
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const onFile = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try { onUrl(await uploadFile(file)); toast.success(t("boss.image_uploaded")); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("boss.upload_error")); }
    finally { setUploading(false); }
  };
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
      className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-2.5 transition", drag ? "border-gold bg-gold/5" : "border-border")}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary">
        {uploading ? <Loader2 className="h-5 w-5 animate-spin text-gold" />
          : url ? <img src={url} alt="" className="h-full w-full object-cover" />
          : <Skull className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-medium text-foreground"><Upload className="h-3.5 w-3.5" /> {t("boss.boss_image")}</span>
        <span>{t("boss.drag_or_click")}</span>
      </div>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </label>
  );
}
