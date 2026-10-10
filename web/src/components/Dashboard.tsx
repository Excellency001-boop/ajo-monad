"use client";

import Link from "next/link";
import { useState } from "react";
import { STATUS, useAjoWrite, useChainNow, useMe, useMyCircles, useReputation, useWallet } from "@/lib/hooks";
import { frequencyLabel, naira } from "@/lib/money";
import { useTx } from "@/lib/useTx";
import { Amount, Pill, TxStatus } from "./ui";

export function NamePrompt() {
  const { address } = useMe();
  const { name, isLoading } = useReputation(address);
  const { call } = useAjoWrite();
  const { state, run } = useTx();
  const [value, setValue] = useState("");
  if (isLoading || name) return null;
  return (
    <section className="card p-5">
      <p className="eyebrow mb-1">First things first</p>
      <h2 className="font-serif text-xl font-semibold">What should your circle call you?</h2>
      <p className="mt-1 text-sm text-ink-soft">Your name is shown to people in your circles instead of a long wallet address.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (v) run(`Hi ${v}`, [call("Save your name", "setName", [v])]);
        }}
      >
        <input className="field" placeholder="e.g. Amaka or Mama Tunde" maxLength={32} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-indigo shrink-0" disabled={!value.trim() || state.status === "pending"}>
          Save
        </button>
      </form>
      <TxStatus state={state} />
    </section>
  );
}

export function WalletCard() {
  const { onMonad } = useMe();
  const { balance } = useWallet();
  const { faucet } = useAjoWrite();
  const { state, run } = useTx();
  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[14px] border-dashed border-ochre-soft/40" />
      <p className="text-sm text-ink-soft">Your savings wallet</p>
      <Amount units={balance} size="xl" className="mt-1" />
      <p className="mt-2 max-w-[42ch] text-xs text-ink-soft">
        Held in dollars so inflation can&apos;t eat it. Shown in naira so it makes sense.
      </p>
      <button
        className="btn-ghost btn-sm mt-4"
        disabled={!onMonad || state.status === "pending"}
        onClick={() => run("Added test money", [faucet()])}
      >
        + Add {naira(1_000_000_000n)} test money
      </button>
      <TxStatus state={state} />
    </section>
  );
}

export function MyCircles() {
  const { circles, isLoading } = useMyCircles();
  const now = useChainNow();
  return (
    <section>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-serif text-2xl font-semibold">Your circles</h2>
        <Link href="/new" className="btn-primary btn-sm">
          + Start a circle
        </Link>
      </div>
      {isLoading ? (
        <p className="text-sm text-ink-soft">Loading…</p>
      ) : circles.length === 0 ? (
        <div className="card border-dashed p-6 text-center">
          <p className="font-serif text-lg">No circles yet.</p>
          <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink-soft">
            Start one and share the invite on WhatsApp, or open an invite link someone sent you.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {circles.map(({ id, circle }) => {
            const c = circle!;
            const status = STATUS[c.status];
            const pot = c.contribution * BigInt(c.size);
            const deadline = Number(c.roundStart) + Number(c.roundDuration);
            return (
              <li key={id.toString()}>
                <Link href={`/c/${id}`} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-serif text-lg font-semibold leading-tight">{c.name}</p>
                    <Pill tone={status === "Active" ? "indigo" : status === "Completed" ? "good" : status === "Cancelled" ? "bad" : "warn"}>
                      {status === "Open" ? "Gathering" : status}
                    </Pill>
                  </div>
                  <p className="mt-2 text-sm text-ink-soft">
                    {naira(c.contribution)} · {frequencyLabel(Number(c.roundDuration)).toLowerCase()} · {c.size} people
                  </p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="text-xs text-ink-soft">Pot each round</span>
                    <span className="font-semibold">{naira(pot)}</span>
                  </div>
                  {status === "Active" && (
                    <p className="mt-1 text-xs text-ink-soft">
                      Round {c.currentRound + 1} of {c.size} ·{" "}
                      {now > deadline ? <span className="text-warn">deadline passed</span> : "in progress"}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
