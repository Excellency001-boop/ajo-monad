"use client";

import { useParams } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { addressUrl } from "@/lib/config";
import { trustScore, useMe, useReputation } from "@/lib/hooks";
import { naira, shortAddr } from "@/lib/money";
import { Avatar, useHydrated } from "./ui";

export function Profile() {
  const params = useParams<{ address: string }>();
  // Accept any capitalisation people paste; normalise to the checksummed form viem requires.
  const valid = isAddress(params.address, { strict: false });
  const account = valid ? getAddress(params.address.toLowerCase()) : undefined;
  const { address: me } = useMe();
  const { name, rep, isLoading } = useReputation(account);
  const hydrated = useHydrated();

  if (!valid) return <p className="mt-16 text-center text-ink-soft">That isn&apos;t a valid address.</p>;
  if (!hydrated || isLoading) return <p className="mt-16 text-center text-ink-soft">Loading record…</p>;

  const score = trustScore(rep);
  const total = rep.onTime + rep.late + rep.missed;
  const isMe = me?.toLowerCase() === account!.toLowerCase();
  const tone = score === null ? "text-ink-soft" : score >= 80 ? "text-good" : score >= 50 ? "text-warn" : "text-bad";

  return (
    <div className="mx-auto mt-8 max-w-2xl space-y-5">
      <section className="card p-6 text-center">
        <div className="flex justify-center">
          <Avatar address={account!} name={name} size={72} />
        </div>
        <h1 className="mt-3 font-serif text-3xl font-semibold">{name || shortAddr(account!)}</h1>
        <a href={addressUrl(account!)} target="_blank" rel="noreferrer" className="font-mono text-xs text-ink-soft underline">
          {shortAddr(account!)}
        </a>
        <div className="mt-5">
          <p className={`font-serif text-6xl font-semibold ${tone}`}>{score ?? "New"}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {score === null ? "No savings history yet" : "Trust score, from every payment on record"}
          </p>
        </div>
        {isMe && score === null && <p className="mt-3 text-sm text-ink-soft">Join a circle and pay on time — your record starts with your first payment.</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Paid on time" value={`${rep.onTime}${total ? ` / ${total}` : ""}`} good />
        <Stat label="Saved on time" value={naira(rep.savedValue)} good />
        <Stat label="Circles finished clean" value={String(rep.circlesCompleted)} good />
        <Stat label="Pots collected" value={String(rep.payouts)} />
        <Stat label="Paid late" value={String(rep.late)} warn={rep.late > 0} />
        <Stat label="Missed (covered by others)" value={String(rep.missed)} bad={rep.missed > 0} />
        <Stat label="Vouched & returned" value={naira(rep.vouchHonoured)} good />
        <Stat label="Lost backing others" value={naira(rep.vouchLost)} bad={rep.vouchLost > 0n} />
      </section>

      <p className="text-center text-xs leading-relaxed text-ink-soft">
        Every number here comes straight from the Ajo contract on Monad. The score weighs reliability by the money actually
        saved, so a good record takes real savings over real time. It belongs to this address, not to any one circle.
      </p>
    </div>
  );
}

function Stat({ label, value, good, warn, bad }: { label: string; value: string; good?: boolean; warn?: boolean; bad?: boolean }) {
  const color = bad ? "text-bad" : warn ? "text-warn" : good ? "text-ink" : "text-ink";
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
