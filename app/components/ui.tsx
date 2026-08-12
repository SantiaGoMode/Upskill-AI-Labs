"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1180px] px-6 py-10 md:px-8 md:py-12", className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="min-w-0 max-w-[62ch]">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-[clamp(30px,3.4vw,42px)] font-bold">{title}</h1>
        {lede ? <p className="mt-3 text-[15px] leading-relaxed text-muted">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mb-10", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold">{title}</h2>
            {description ? <p className="mt-1 max-w-[70ch] text-[14px] text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section" | "li";
}) {
  return (
    <Tag className={cx("rounded-[12px] border border-line bg-raised", className)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h3 className="text-[17px] font-bold">{title}</h3>
        {meta ? <p className="mt-1 text-[13px] text-muted">{meta}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "accent" | "danger";
  size?: "sm" | "md";
};

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-primary-fg border-primary hover:bg-primary-hover hover:border-primary-hover",
  accent: "bg-accent text-accent-fg border-accent hover:brightness-110",
  secondary: "bg-raised text-fg border-line-strong hover:bg-inset",
  ghost: "bg-transparent text-muted border-transparent hover:bg-inset hover:text-fg",
  danger: "bg-transparent text-risk-fg border-risk-line hover:bg-risk-bg",
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border font-semibold transition-colors",
        size === "sm" ? "min-h-[32px] px-3 text-[13px]" : "min-h-[40px] px-4 text-[14px]",
        BUTTON_VARIANTS[variant],
        className,
      )}
    />
  );
}

/** Same visual language as Button, but renders a real anchor for navigation. */
export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: NonNullable<ButtonProps["variant"]>;
  size?: NonNullable<ButtonProps["size"]>;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[8px] border font-semibold no-underline transition-colors",
        size === "sm" ? "min-h-[32px] px-3 text-[13px]" : "min-h-[40px] px-4 text-[14px]",
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[13px] font-semibold text-fg">{children}</span>
      {hint ? <span className="text-[12px] text-subtle">{hint}</span> : null}
    </span>
  );
}

const FIELD_BASE =
  "w-full rounded-[8px] border border-line bg-bg px-3 py-2.5 text-[14px] text-fg placeholder:text-subtle focus:border-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1";

export function TextField({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className={cx("block", className)}>
      <Label hint={hint}>{label}</Label>
      <input {...props} className={FIELD_BASE} />
    </label>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  return (
    <label className={cx("block", className)}>
      <Label hint={hint}>{label}</Label>
      <textarea {...props} className={cx(FIELD_BASE, "resize-y leading-relaxed")} />
    </label>
  );
}

export function SelectField({
  label,
  hint,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  return (
    <label className={cx("block", className)}>
      <Label hint={hint}>{label}</Label>
      <select {...props} className={FIELD_BASE}>
        {children}
      </select>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone = "neutral" | "ok" | "warn" | "risk" | "info" | "primary";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-inset text-muted border-line",
  ok: "bg-ok-bg text-ok-fg border-ok-line",
  warn: "bg-warn-bg text-warn-fg border-warn-line",
  risk: "bg-risk-bg text-risk-fg border-risk-line",
  info: "bg-info-bg text-info-fg border-info-line",
  primary: "bg-primary text-primary-fg border-primary",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Rubric bands are the product's core vocabulary — always rendered the same way. */
export function BandBadge({ band }: { band: string }) {
  const tone: Tone =
    band === "Strong" || band === "Transferred" ? "ok" : band === "Capable" ? "warn" : band === "Developing" ? "risk" : "neutral";
  return <Badge tone={tone}>{band}</Badge>;
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-[10px] border px-4 py-3 text-[13px] leading-relaxed", TONE_CLASSES[tone], className)}>
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={cx(Boolean(title) && "mt-1", "opacity-90")}>{children}</div> : null}
    </div>
  );
}

/**
 * The load-error / action-error / success trio every mutating surface renders
 * above its content. Errors are listed rather than collapsed so a failed reload
 * and a failed action stay visible at the same time.
 */
export function Banners({
  errors,
  notice,
  className = "mb-6",
}: {
  errors: Array<string | null | undefined>;
  notice?: string;
  className?: string;
}) {
  return (
    <>
      {errors.filter(Boolean).map((message, index) => (
        <Callout key={index} tone="risk" className={className}>
          {message}
        </Callout>
      ))}
      {notice ? (
        <Callout tone="ok" className={className}>
          {notice}
        </Callout>
      ) : null}
    </>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-dashed border-line-strong bg-raised px-6 py-10 text-center">
      <p className="text-[16px] font-bold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-[52ch] text-[14px] text-muted">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Meter({ value, total, tone = "accent" }: { value: number; total: number; tone?: "accent" | "primary" }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-inset"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx("h-full rounded-full transition-[width]", tone === "accent" ? "bg-accent" : "bg-primary")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line bg-raised px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 font-display text-[26px] font-bold leading-none tabular-nums">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-[14px] text-muted" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
      {label}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Overlay                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Centred modal dialog.
 *
 * Escape and a backdrop press both dismiss. Focus moves into the panel on open
 * and returns to whatever opened it on close, so dismissing a dialog opened from
 * the canvas puts the keyboard back on the canvas rather than at the top of the
 * document. The panel is the scroll container, which keeps a long artifact inside
 * the dialog instead of scrolling the page behind it.
 */
export function Modal({
  title,
  onClose,
  children,
  width = "820px",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Stopped so a dialog opened from a canvas does not also clear its selection.
      event.stopPropagation();
      onClose();
    }

    document.addEventListener("keydown", handleKey);
    const restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = restoreOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0/45%)] p-4 md:p-8"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="max-h-[88dvh] w-full overflow-y-auto rounded-[12px] border border-line bg-raised shadow-[0_18px_50px_rgb(0_0_0/28%)] outline-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-raised/95 px-5 py-2.5 backdrop-blur">
          <p className="eyebrow m-0 truncate">{title}</p>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close dialog">
            <span aria-hidden>✕</span>
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
