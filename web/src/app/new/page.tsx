"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseEventLogs } from "viem";
import { ConnectButton } from "@/components/Header";
import { Amount, TxStatus, useHydrated } from "@/components/ui";
import { ajoAbi } from "@/lib/abi";
import { useAjoWrite, useMe, useWallet } from "@/lib/hooks";
import { FREQUENCIES, naira, nairaToUnits } from "@/lib/money";
import { useTx } from "@/lib/useTx";

export default function NewCircle() {
  const router = useRouter();
  const { isConnected, onMonad } = useMe();
  const { balance } = useWallet();
  const { approveIfNeeded, call } = useAjoWrite();
  const { state, run } = useTx();
  const hydrated = useHydrated();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("50,000");
  const [size, setSize] = useState(5);
  const [freq, setFreq] = useState<number>(FREQUENCIES[0].seconds);
  const [guarantee, setGuarantee] = useState("50,000");

  const contribution = nairaToUnits(amount);
  const stake = nairaToUnits(guarantee);
  const pot = contribution * BigInt(size);
  const valid = name.trim().length > 0 && contribution > 0n && size >= 2 && size <= 20;
  const needNow = stake;
  const tooPoor = needNow > balance;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !onMonad) return;
    const receipt = await run("Your circle is open", [
      // One approval covers your guarantee plus every contribution in this circle.
      ...approveIfNeeded(stake, stake + pot),
      call("Open the circle", "createCircle", [name.trim(), contribution, size, freq, stake, stake]),
    ]);
    if (!receipt) return;
    const [created] = parseEventLogs({ abi: ajoAbi, logs: receipt.logs, eventName: "CircleCreated" });
    if (created) router.push(`/c/${created.args.circleId}?share=1`);
  };

  if (!hydrated) return <p className="mt-16 text-center text-ink-soft">Loading…</p>;
  if (!isConnected)
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="font-serif text-3xl font-semibold">Start a circle</h1>
        <p className="mt-2 text-ink-soft">Sign in first.</p>
        <div className="mt-6 flex justify-center">
          <ConnectButton />
        </div>
      </div>
    );

  return (
    <div className="mx-auto mt-8 max-w-xl">
      <p className="eyebrow mb-2">New circle</p>
      <h1 className="font-serif text-3xl font-semibold">Start a circle</h1>
      <p className="mt-1 text-ink-soft">You&apos;ll get an invite link to share with your people.</p>

      <form onSubmit={submit} className="card mt-6 space-y-5 p-5">
        <div>
          <label className="label" htmlFor="name">
            Circle name
          </label>
          <input id="name" className="field" placeholder="e.g. Ogbomoso Traders" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="amount">
              Each person pays (₦)
            </label>
            <input id="amount" className="field tabular-nums" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="freq">
              How often
            </label>
            <select id="freq" className="field" value={freq} onChange={(e) => setFreq(Number(e.target.value))}>
              {FREQUENCIES.map((f) => (
                <option key={f.seconds} value={f.seconds}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">How many people (including you)</span>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-ghost h-11 w-11 p-0 text-xl" onClick={() => setSize((s) => Math.max(2, s - 1))} aria-label="Fewer people">
              −
            </button>
            <span className="w-10 text-center text-2xl font-semibold tabular-nums" aria-live="polite">
              {size}
            </span>
            <button type="button" className="btn-ghost h-11 w-11 p-0 text-xl" onClick={() => setSize((s) => Math.min(20, s + 1))} aria-label="More people">
              +
            </button>
            <span className="text-sm text-ink-soft">= {size} rounds</span>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="guarantee">
            Guarantee each member locks (₦)
          </label>
          <input id="guarantee" className="field tabular-nums" inputMode="numeric" value={guarantee} onChange={(e) => setGuarantee(e.target.value)} />
          <p className="mt-1.5 text-xs text-ink-soft">
            Given back at the end. Only used if that person misses a payment. One round&apos;s amount is a good default.
          </p>
        </div>

        <div className="rounded-xl bg-indigo-800 p-4 text-paper">
          <p className="text-xs uppercase tracking-widest text-ochre-soft">Every round, one person collects</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{naira(pot)}</p>
          <p className="mt-1 text-xs text-paper/70">
            {size} people × {naira(contribution)}. People vouched for by others get it all at once.
          </p>
        </div>

        {tooPoor && <p className="text-sm text-bad">You need {naira(needNow)} for your guarantee. Add test money on the home page.</p>}

        <button className="btn-primary w-full py-3.5 text-base" disabled={!valid || !onMonad || tooPoor || state.status === "pending"}>
          Open the circle
        </button>
        <TxStatus state={state} />
        <p className="text-center text-xs text-ink-soft">
          You lock <Amount units={stake} size="sm" className="inline-flex align-middle" /> now as your guarantee.
        </p>
      </form>
    </div>
  );
}
