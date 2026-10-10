"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TxState } from "@/lib/useTx";
import { txUrl } from "@/lib/config";
import { dollars, naira } from "@/lib/money";

const noopSubscribe = () => () => {};

/** false on the server and during hydration, true afterwards. Gate wallet/chain-dependent UI on it. */
export const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

/**
 * Bottom sheet on phones, centered dialog on desktop. Portalled to <body> because ancestors with
 * backdrop-filter (the sticky header) would otherwise trap a position:fixed overlay inside them.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  // false on the server and during hydration, true afterwards — so portals never cause a mismatch
  const mounted = useHydrated();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-indigo-900/40 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-pop max-h-[90vh] w-full overflow-y-auto rounded-t-[22px] border border-line bg-paper p-5 shadow-[var(--shadow-lift)] sm:max-w-[440px] sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-ink-soft hover:bg-paper-2" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

const PALETTE = ["#34407e", "#c05a35", "#3f7d54", "#a2472a", "#5666a8", "#c9852a", "#20264d", "#7a4f9a"];

/** Initials on a colour derived from the address — stable and recognisable without photos. */
export function Avatar({ address, name, size = 40, ring }: { address: string; name?: string; size?: number; ring?: string }) {
  const color = PALETTE[parseInt(address.slice(2, 8), 16) % PALETTE.length];
  const initials = name
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : address.slice(2, 4).toUpperCase();
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size * 0.38,
        boxShadow: ring ? `0 0 0 3px var(--paper), 0 0 0 5px ${ring}` : undefined,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Naira first (how people think), dollars underneath (what is actually held). */
export function Amount({ units, size = "md", className = "" }: { units: bigint; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const big = { sm: "text-base", md: "text-xl", lg: "text-3xl", xl: "text-4xl sm:text-5xl" }[size];
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`${big} font-semibold tabular-nums tracking-tight`}>{naira(units)}</span>
      <span className="text-xs tabular-nums text-ink-soft">{dollars(units)}</span>
    </span>
  );
}

export function TxStatus({ state }: { state: TxState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending")
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft" role="status">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        {state.label}
      </p>
    );
  if (state.status === "error")
    return (
      <p className="mt-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">
        {state.message}
      </p>
    );
  return (
    <p className="mt-3 text-sm text-good" role="status">
      ✓ {state.label} · confirmed in {state.ms < 100 ? "<0.1" : (state.ms / 1000).toFixed(1)}s ·{" "}
      <a className="underline" href={txUrl(state.hash)} target="_blank" rel="noreferrer">
        receipt
      </a>
    </p>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "indigo" }) {
  const tones = {
    neutral: "bg-paper-2 text-ink-soft border-line",
    good: "bg-good/10 text-good border-good/20",
    warn: "bg-warn/10 text-warn border-warn/25",
    bad: "bg-bad/10 text-bad border-bad/20",
    indigo: "bg-indigo-600/10 text-indigo-600 border-indigo-600/20",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}
