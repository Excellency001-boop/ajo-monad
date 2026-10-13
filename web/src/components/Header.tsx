"use client";

import Link from "next/link";
import { useState } from "react";
import { useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { chain, USE_PRIVY } from "@/lib/config";
import { useMe, useReputation } from "@/lib/hooks";
import { shortAddr } from "@/lib/money";
import { Avatar, Sheet, useHydrated } from "./ui";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1060px] items-center justify-between px-4 sm:px-[22px]">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-gradient-to-br from-indigo-600 to-indigo-900 font-serif text-xl font-bold text-ochre-soft shadow-[inset_0_0_0_1.5px_rgba(217,164,65,.35)]">
            à
          </span>
          <span>
            <span className="block font-serif text-xl font-semibold leading-none">Ajo</span>
            <span className="hidden text-[10.5px] uppercase tracking-[0.08em] text-ink-soft sm:block">savings circles</span>
          </span>
        </Link>
        <ConnectButton compact />
      </div>
    </header>
  );
}

/** Email/Google sign-in when Privy is configured; plain wallet connect otherwise (local demo). */
export const ConnectButton = USE_PRIVY ? PrivyConnectButton : WalletConnectButton;

function PrivyConnectButton({ compact = false }: { compact?: boolean }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, isConnected } = useMe();
  const hydrated = useHydrated();
  const cls = compact ? "btn-primary btn-sm" : "btn-primary px-6 py-3.5 text-base";

  if (!hydrated || !ready) return <button className={cls} disabled>Sign in</button>;
  if (!authenticated) return <button className={cls} onClick={() => login()}>Sign in</button>;
  if (!isConnected || !address) return <button className={cls} disabled>Setting up…</button>;
  return <AccountButton onSignOut={() => logout()} />;
}

function WalletConnectButton({ compact = false }: { compact?: boolean }) {
  const { isConnected, onMonad } = useMe();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const [open, setOpen] = useState(false);
  const hydrated = useHydrated();

  if (!hydrated || !isConnected) {
    // De-duplicate: wagmi lists both the generic "Injected" and EIP-6963 wallets (MetaMask, Rabby…).
    const named = connectors.filter((c) => c.id !== "injected");
    const options = named.length ? named : connectors;
    return (
      <>
        <button className={compact ? "btn-primary btn-sm" : "btn-primary px-6 py-3.5 text-base"} onClick={() => setOpen(true)}>
          Sign in
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Sign in to Ajo">
          <p className="mb-4 text-sm text-ink-soft">Pick the wallet on this device. On a phone, open this page inside your wallet app.</p>
          <div className="space-y-2">
            {options.map((c) => (
              <button
                key={c.uid}
                className="btn-ghost w-full justify-between"
                disabled={connect.isPending}
                onClick={() =>
                  connect.mutate({ connector: c, chainId: chain.id }, { onSuccess: () => setOpen(false) })
                }
              >
                <span className="flex items-center gap-3">
                  {c.icon ? <img src={c.icon} alt="" className="h-6 w-6 rounded" /> : <span className="h-6 w-6 rounded bg-paper-2" />}
                  {c.name === "Injected" ? "Browser wallet" : c.id === "mock" ? "Demo wallet" : c.name}
                </span>
                <span aria-hidden>→</span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="text-sm text-ink-soft">
                No wallet found. Install MetaMask or Rabby, or open this link in your wallet app&apos;s browser.
              </p>
            )}
          </div>
          {connect.error && <p className="mt-3 text-sm text-bad">{connect.error.message.split("\n")[0]}</p>}
        </Sheet>
      </>
    );
  }

  if (!onMonad) {
    return (
      <button className="btn-sm btn bg-warn text-white" onClick={() => switchChain.mutate({ chainId: chain.id })}>
        Switch to Monad
      </button>
    );
  }

  return <AccountButton onSignOut={() => disconnect.mutate()} />;
}

function AccountButton({ onSignOut }: { onSignOut: () => void }) {
  const { address } = useMe();
  const { name } = useReputation(address);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="flex items-center gap-2 rounded-full border border-line bg-paper-2 py-1 pl-1 pr-3 text-sm" onClick={() => setOpen(true)}>
        <Avatar address={address!} name={name} size={28} />
        <span className="max-w-[110px] truncate">{name || shortAddr(address!)}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your account">
        <div className="mb-4 flex items-center gap-3">
          <Avatar address={address!} name={name} size={48} />
          <div>
            <p className="font-semibold">{name || "No name yet"}</p>
            <p className="font-mono text-xs text-ink-soft">{address}</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Link href={`/u/${address}`} className="btn-ghost" onClick={() => setOpen(false)}>
            My trust profile
          </Link>
          <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(address!)}>
            Copy my address
          </button>
          <button
            className="btn-ghost text-bad"
            onClick={() => {
              onSignOut();
              setOpen(false);
            }}
          >
            Sign out
          </button>
        </div>
      </Sheet>
    </>
  );
}
