// Запись голоса для лаборатории: нажал — пишем (до 15 с), нажал ещё раз —
// отправляем на сервер (adminLabTranscribe), распознанный текст — в поле.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { adminLabTranscribe } from "@/server/api/craft/lab-voice";

const MAX_MS = 15_000;

export type VoiceState = "idle" | "rec" | "busy";

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function useVoice(onText: (text: string) => void) {
  const t = useT();
  const lang = useLang();
  const [state, setState] = useState<VoiceState>("idle");
  const rec = useRef<MediaRecorder | null>(null);

  const send = async (blob: Blob) => {
    setState("busy");
    try {
      const audio = await toBase64(blob);
      const { text } = await adminLabTranscribe({
        data: { audio, lang: lang === "en" ? "en" : "ru" },
      });
      if (text) onText(text);
    } catch (e) {
      toast.error(humanError(e));
    } finally {
      setState("idle");
    }
  };

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(t("lab.err_mic"));
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      void send(new Blob(chunks, { type: r.mimeType }));
    };
    rec.current = r;
    r.start();
    setState("rec");
    setTimeout(() => r.state === "recording" && r.stop(), MAX_MS);
  };

  const toggle = () => {
    if (state === "rec") rec.current?.stop();
    else if (state === "idle") void start();
  };

  return { state, toggle };
}
