import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10 text-gold">
        {icon}
      </span>
      <h2 className="font-display text-lg font-bold">{title}</h2>
    </div>
  );
}

export function SettingsSection({
  title,
  danger = false,
  children,
}: {
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4
        className={cn(
          "px-1 text-[11px] font-semibold uppercase tracking-wider",
          danger ? "text-destructive/80" : "text-muted-foreground"
        )}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

export function SettingsDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />;
}

export function PwdInput({
  value,
  onChange,
  label = "Пароль",
  autoFocus = true,
  placeholder = "••••••••",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="block text-left">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10"
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

export function PinInput({
  value,
  onChange,
  label = "PIN",
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="block">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono"
          placeholder="••••••"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
