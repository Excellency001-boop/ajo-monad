"use client";

import { useEffect, useRef, useState } from "react";
import { useBalance } from "wagmi";
import { parseEther } from "viem";
import { chain } from "@/lib/config";
import { useMe } from "@/lib/hooks";

const LOW = parseEther("0.05");

/**
 * New accounts have no MON for network fees. When a signed-in wallet runs low, ask our
 * /api/gas route to top it up, so people never have to find a faucet.
 */
export function GasTopUp() {
  const { address, onMonad } = useMe();
  const { data, refetch } = useBalance({ address, chainId: chain.id, query: { enabled: Boolean(address && onMonad), refetchInterval: 20_000 } });
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!address || !onMonad || !data || data.value >= LOW) return;
    if (asked.current === address) return; // once per address per page load
    asked.current = address;
    setStatus("working");
    fetch("/api/gas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })
      .then((r) => r.json())
      .then((j) => {
        setStatus(j.ok ? "done" : "error");
        refetch();
        setTimeout(() => setStatus("idle"), 5000);
      })
      .catch(() => setStatus("error"));
  }, [address, onMonad, data, refetch]);

  if (status === "idle") return null;
  const text = {
    working: "Setting up your account — adding free network fees…",
    done: "Your account is ready ✓",
    error: "Couldn't add free network fees right now. You can still get some at faucet.monad.xyz.",
  }[status];
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-xl border border-line bg-paper px-4 py-3 text-sm shadow-[var(--shadow-lift)]"
    >
      {status === "working" && <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent align-middle" />}
      {text}
    </div>
  );
}
