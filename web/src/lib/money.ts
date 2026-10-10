import { TOKEN_DECIMALS } from "./config";

/**
 * Circles hold dollars (a stablecoin) so savings keep their value; people think in naira.
 * The rate is display-only and configurable — no contract ever uses it.
 */
export const NGN_PER_USD = Number(process.env.NEXT_PUBLIC_NGN_PER_USD || 1500);

const SCALE = 10 ** TOKEN_DECIMALS;

export const toUsd = (units: bigint | number) => Number(units) / SCALE;

/** "₦150,000" */
export function naira(units: bigint | number): string {
  const n = Math.round(toUsd(units) * NGN_PER_USD);
  return "₦" + n.toLocaleString("en-NG");
}

/** "$100.00" */
export function dollars(units: bigint | number): string {
  return (
    "$" + toUsd(units).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/**
 * Naira typed by a person ("150,000") → token base units at full token precision, so naira
 * amounts survive the round trip (₦50,000 → $33.333333 → ₦50,000, not ₦49,995).
 */
export function nairaToUnits(input: string): bigint {
  const n = Number(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round((n / NGN_PER_USD) * SCALE));
}

/** Token base units → a plain naira string for pre-filling inputs ("150000"). */
export const nairaInput = (units: bigint) => (units > 0n ? String(Math.round(toUsd(units) * NGN_PER_USD)) : "");

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const FREQUENCIES = [
  { label: "Every 2 minutes (demo)", seconds: 120 },
  { label: "Every hour", seconds: 3_600 },
  { label: "Every day", seconds: 86_400 },
  { label: "Every week", seconds: 604_800 },
  { label: "Every month", seconds: 2_592_000 },
] as const;

export function frequencyLabel(seconds: number): string {
  const f = FREQUENCIES.find((x) => x.seconds === seconds);
  if (f) return f.label.replace(" (demo)", "");
  if (seconds % 86_400 === 0) return `Every ${seconds / 86_400} days`;
  if (seconds % 3_600 === 0) return `Every ${seconds / 3_600} hours`;
  return `Every ${Math.round(seconds / 60)} minutes`;
}

export function countdown(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}
