"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { ajoAbi } from "@/lib/abi";
import { AJO_ADDRESS, chain } from "@/lib/config";
import {
  STATUS,
  useAjoWrite,
  useChainNow,
  useCircle,
  useMe,
  useWallet,
  type CircleData,
  type MemberView,
} from "@/lib/hooks";
import { countdown, frequencyLabel, naira, nairaInput, nairaToUnits, shortAddr } from "@/lib/money";
import { useTx } from "@/lib/useTx";
import { ConnectButton } from "./Header";
import { Amount, Avatar, Pill, Sheet, TxStatus, useHydrated } from "./ui";

const label = (m: MemberView) => m.name || shortAddr(m.account);

export function CircleView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : undefined;
  const { circle, members, exists, isLoading } = useCircle(id);
  const { address } = useMe();
  const now = useChainNow();
  const [celebration, setCelebration] = useState<{ who: string; amount: bigint } | null>(null);
  const queryClient = useQueryClient();
  const hydrated = useHydrated();

  useWatchContractEvent({
    address: AJO_ADDRESS,
    abi: ajoAbi,
    chainId: chain.id,
    eventName: "Payout",
    args: id !== undefined ? { circleId: id } : undefined,
    enabled: id !== undefined,
    onLogs: (logs) => {
      // A payout changes everything on the page — refresh now, even if this tab is in the background.
      queryClient.invalidateQueries();
      const last = logs[logs.length - 1];
      if (!last?.args.recipient) return;
      const m = members.find((x) => x.account.toLowerCase() === last.args.recipient!.toLowerCase());
      setCelebration({ who: m ? label(m) : shortAddr(last.args.recipient), amount: (last.args.upfront ?? 0n) + (last.args.reserved ?? 0n) });
    },
  });

  if (!hydrated || isLoading) return <p className="mt-16 text-center text-ink-soft">Loading circle…</p>;
  if (!circle || exists === false)
    return (
      <div className="mt-16 text-center">
        <h1 className="font-serif text-2xl font-semibold">Circle not found</h1>
        <Link href="/" className="btn-ghost mt-4">
          Go home
        </Link>
      </div>
    );

  const me = members.find((m) => address && m.account.toLowerCase() === address.toLowerCase());
  const status = STATUS[circle.status];
  const vouchTarget = search.get("vouch");

  return (
    <div className="mt-6 space-y-5">
      {celebration && (
        <div className="animate-pop card flex items-center gap-4 border-ochre bg-gradient-to-r from-ochre-soft/40 to-paper p-4" role="status">
          <span className="text-3xl" aria-hidden>
            🎉
          </span>
          <div className="flex-1">
            <p className="font-serif text-lg font-semibold">The pot just landed for {celebration.who}</p>
            <p className="text-sm text-ink-soft">{naira(celebration.amount)} paid out, settled on Monad in under a second.</p>
          </div>
          <button className="text-ink-soft" onClick={() => setCelebration(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <CircleHeader id={id!} circle={circle} members={members} status={status} share={search.get("share") === "1"} />

      {status === "Open" && <OpenStage id={id!} circle={circle} members={members} me={me} />}
      {status === "Active" && <ActiveStage key={circle.currentRound} id={id!} circle={circle} members={members} me={me} now={now} />}
      {(status === "Completed" || status === "Cancelled") && <EndStage id={id!} status={status} me={me} />}

      <Members id={id!} circle={circle} members={members} me={me} status={status} initialVouch={vouchTarget} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function CircleHeader({ id, circle, members, status, share }: { id: bigint; circle: CircleData; members: readonly MemberView[]; status: string; share: boolean }) {
  const [open, setOpen] = useState(share);
  const pot = circle.contribution * BigInt(circle.size);
  const organizer = members.find((m) => m.account === circle.organizer);
  const link = typeof window !== "undefined" ? `${window.location.origin}/c/${id}` : `/c/${id}`;
  const text = `Join my ajo "${circle.name}" — ${naira(circle.contribution)} ${frequencyLabel(Number(circle.roundDuration)).toLowerCase()}, ${circle.size} people. No collector, the pot is held by code: ${link}`;

  return (
    <section className="card overflow-hidden">
      <div className="bg-indigo-800 p-5 text-paper">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-ochre-soft">
              {status === "Open" ? `Gathering · ${members.length} of ${circle.size} joined` : status === "Active" ? `Round ${circle.currentRound + 1} of ${circle.size}` : status}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight">{circle.name}</h1>
            <p className="mt-1 text-sm text-paper/75">
              {naira(circle.contribution)} {frequencyLabel(Number(circle.roundDuration)).toLowerCase()} · organised by {organizer ? label(organizer) : shortAddr(circle.organizer)}
            </p>
          </div>
          {(status === "Open" || status === "Active") && (
            <button className="btn-sm btn shrink-0 bg-ochre text-indigo-900 hover:bg-ochre-soft" onClick={() => setOpen(true)}>
              Invite
            </button>
          )}
        </div>
        <div className="mt-4 flex items-end justify-between">
          <span className="text-sm text-paper/70">Pot each round</span>
          <span className="font-serif text-3xl font-semibold">{naira(pot)}</span>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Invite your people">
        <p className="text-sm text-ink-soft">Anyone with this link can join until the circle is full — or vouch for a member.</p>
        <div className="mt-3 break-all rounded-xl bg-paper-2 p-3 font-mono text-xs">{link}</div>
        <div className="mt-4 grid gap-2">
          <a className="btn bg-[#25D366] text-white hover:opacity-90" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            Share on WhatsApp
          </a>
          <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(link)}>
            Copy link
          </button>
        </div>
      </Sheet>
    </section>
  );
}

// ─── Open: join / start ──────────────────────────────────────────────────────

function OpenStage({ id, circle, members, me }: { id: bigint; circle: CircleData; members: readonly MemberView[]; me?: MemberView }) {
  const { address, isConnected, onMonad } = useMe();
  const { balance } = useWallet();
  const { approveIfNeeded, call } = useAjoWrite();
  const { state, run } = useTx();
  const [stakeInput, setStakeInput] = useState(nairaInput(circle.minStake > circle.contribution ? circle.minStake : circle.contribution));
  const [order, setOrder] = useState<Address[] | null>(null);
  const full = members.length === Number(circle.size);
  const isOrganizer = address?.toLowerCase() === circle.organizer.toLowerCase();
  const pot = circle.contribution * BigInt(circle.size);

  if (!me) {
    const stake = nairaToUnits(stakeInput);
    const tooLow = stake < circle.minStake;
    return (
      <section className="card p-5">
        <h2 className="font-serif text-xl font-semibold">{full ? "This circle is full" : "Join this circle"}</h2>
        {!full && (
          <>
            <p className="mt-1 text-sm text-ink-soft">
              You&apos;ll pay {naira(circle.contribution)} {frequencyLabel(Number(circle.roundDuration)).toLowerCase()} for {circle.size} rounds, and collect{" "}
              {naira(pot)} once. Your guarantee comes back at the end.
            </p>
            {!isConnected ? (
              <div className="mt-4">
                <ConnectButton />
              </div>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run("You're in", [...approveIfNeeded(stake, stake + pot), call("Join the circle", "join", [id, stake])]);
                }}
              >
                <div>
                  <label className="label" htmlFor="stake">
                    Your guarantee (₦){circle.minStake > 0n && <> — at least {naira(circle.minStake)}</>}
                  </label>
                  <input id="stake" className="field tabular-nums" inputMode="numeric" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)} />
                  <p className="mt-1.5 text-xs text-ink-soft">A bigger guarantee means more of your pot is paid upfront when it&apos;s your turn.</p>
                </div>
                {stake > balance && <p className="text-sm text-bad">Not enough money in your wallet — add test money on the home page.</p>}
                <button className="btn-primary w-full" disabled={!onMonad || tooLow || stake > balance || state.status === "pending"}>
                  Join for {naira(stake)} guarantee
                </button>
              </form>
            )}
          </>
        )}
        <TxStatus state={state} />
      </section>
    );
  }

  if (!isOrganizer)
    return (
      <section className="card p-5">
        <h2 className="font-serif text-xl font-semibold">You&apos;re in ✓</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {full ? "Waiting for the organiser to start the rotation." : `Waiting for ${Number(circle.size) - members.length} more ${Number(circle.size) - members.length === 1 ? "person" : "people"}. Share the invite link.`}
        </p>
      </section>
    );

  const preview = order ?? members.map((m) => m.account);
  return (
    <section className="card p-5">
      <h2 className="font-serif text-xl font-semibold">{full ? "Everyone's here — start the rotation" : "Waiting for people to join"}</h2>
      {full ? (
        <>
          <p className="mt-1 text-sm text-ink-soft">Choose who collects first. Many groups ballot; others agree an order together.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={`btn-sm ${order === null ? "btn-indigo" : "btn-ghost"}`} onClick={() => setOrder(null)}>
              Order people joined
            </button>
            <button
              className={`btn-sm ${order !== null ? "btn-indigo" : "btn-ghost"}`}
              onClick={() => {
                const a = members.map((m) => m.account);
                for (let i = a.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [a[i], a[j]] = [a[j], a[i]];
                }
                setOrder(a);
              }}
            >
              🎲 Ballot (shuffle)
            </button>
          </div>
          <ol className="mt-3 space-y-1.5 text-sm">
            {preview.map((a, i) => {
              const m = members.find((x) => x.account === a)!;
              return (
                <li key={a} className="flex items-center gap-2">
                  <span className="w-16 text-ink-soft">Round {i + 1}</span>
                  <Avatar address={a} name={m.name} size={24} />
                  {label(m)}
                </li>
              );
            })}
          </ol>
          <button className="btn-primary mt-4 w-full" disabled={state.status === "pending"} onClick={() => run("The rotation has started", [call("Start the circle", "start", [id, order ?? []])])}>
            Start the rotation
          </button>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">
          {members.length} of {circle.size} have joined. Tap Invite to share the link on WhatsApp.
        </p>
      )}
      <button className="mt-3 text-sm text-bad underline" onClick={() => run("Circle cancelled — everyone can take their guarantee back", [call("Cancel the circle", "cancel", [id])])}>
        Cancel this circle
      </button>
      <TxStatus state={state} />
    </section>
  );
}

// ─── Active: this round, your actions ────────────────────────────────────────

function ActiveStage({ id, circle, members, me, now }: { id: bigint; circle: CircleData; members: readonly MemberView[]; me?: MemberView; now: number }) {
  const { onMonad } = useMe();
  const { balance } = useWallet();
  const { approveIfNeeded, call } = useAjoWrite();
  const { state, run } = useTx();
  const round = circle.currentRound;
  const recipient = members[round];
  const deadline = Number(circle.roundStart) + Number(circle.roundDuration);
  const pastDeadline = now > deadline;
  const C = circle.contribution;
  const covered = members.filter((m) => m.paidThisRound || m.data.reserve >= C).length;
  const remainingRounds = BigInt(Number(circle.size) - round);

  const preview = useReadContract({
    address: AJO_ADDRESS,
    abi: ajoAbi,
    chainId: chain.id,
    functionName: "previewPayout",
    args: me ? [id, me.account] : undefined,
    query: { enabled: Boolean(me && !me.data.received), refetchInterval: 5_000 },
  });

  const myStatus = !me
    ? null
    : me.paidThisRound
      ? "paid"
      : me.data.reserve >= C
        ? "reserve"
        : "due";

  return (
    <>
      <section className="card p-5">
        <p className="eyebrow">This round</p>
        <div className="mt-3 flex items-center gap-4">
          <Avatar address={recipient.account} name={recipient.name} size={56} ring="var(--ochre)" />
          <div className="flex-1">
            <p className="font-serif text-xl font-semibold">
              {me?.account === recipient.account ? "It's your turn!" : `${label(recipient)} collects`}
            </p>
            <p className="text-sm text-ink-soft">
              {covered} of {members.length} paid in ·{" "}
              {pastDeadline ? <span className="font-medium text-warn">deadline passed</span> : <>closes in {countdown(deadline - now)}</>}
            </p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-2">
          <div className="h-full rounded-full bg-gradient-to-r from-clay to-ochre transition-all" style={{ width: `${(covered / members.length) * 100}%` }} />
        </div>

        {me && (
          <div className="mt-5">
            {myStatus === "paid" && <p className="rounded-xl bg-good/10 px-4 py-3 text-sm text-good">✓ You&apos;ve paid this round.</p>}
            {myStatus === "reserve" && (
              <p className="rounded-xl bg-indigo-600/10 px-4 py-3 text-sm text-indigo-600">
                ✓ Your held money pays this round automatically ({naira(me.data.reserve)} held).
              </p>
            )}
            {myStatus === "due" && (
              <>
                <button
                  className="btn-primary w-full py-3.5 text-base"
                  disabled={!onMonad || C > balance || state.status === "pending"}
                  onClick={() => run(`Paid ${naira(C)}`, [...approveIfNeeded(C, C * remainingRounds), call(`Pay ${naira(C)}`, "contribute", [id])])}
                >
                  Pay {naira(C)}
                </button>
                {C > balance && <p className="mt-2 text-sm text-bad">Not enough in your wallet.</p>}
                {pastDeadline && <p className="mt-2 text-xs text-warn">You&apos;re late — you can still pay until someone closes the round.</p>}
              </>
            )}
          </div>
        )}

        {pastDeadline && covered < members.length && (
          <div className="mt-4 rounded-xl border border-warn/30 bg-warn/5 p-4">
            <p className="text-sm">
              The deadline has passed. Anyone can close the round: missed payments are covered from that person&apos;s guarantee and the people who vouched for them, and {label(recipient)} gets paid.
            </p>
            <button className="btn-indigo btn-sm mt-3" disabled={state.status === "pending"} onClick={() => run("Round closed and paid out", [call("Close the round", "closeRound", [id])])}>
              Close the round
            </button>
          </div>
        )}
        <TxStatus state={state} />
      </section>

      {me && !me.data.received && preview.data && <YourTurn id={id} circle={circle} me={me} upfront={preview.data[0]} reserved={preview.data[1]} />}
      {me && me.releasable > 0n && <Release id={id} amount={me.releasable} />}
    </>
  );
}

function YourTurn({ id, circle, me, upfront, reserved }: { id: bigint; circle: CircleData; me: MemberView; upfront: bigint; reserved: bigint }) {
  const pot = circle.contribution * BigInt(circle.size);
  const askLink = typeof window !== "undefined" ? `${window.location.origin}/c/${id}?vouch=${me.account}` : "";
  const text = `I'm saving in an ajo ("${circle.name}"). If you vouch for me I collect my full ${naira(pot)} pot when it's my turn — and you get your vouch back when I finish paying. ${askLink}`;
  const pct = Number((upfront * 100n) / (pot || 1n));
  return (
    <section className="card p-5">
      <p className="eyebrow">Your turn · round {me.data.slot + 1}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-good/10 p-3">
          <p className="text-xs text-good">Paid to you upfront</p>
          <Amount units={upfront} size="md" />
        </div>
        <div className="rounded-xl bg-paper-2 p-3">
          <p className="text-xs text-ink-soft">Held for your next payments</p>
          <Amount units={reserved} size="md" />
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
      </div>
      {reserved > 0n ? (
        <>
          <p className="mt-3 text-sm text-ink-soft">
            Collecting early is like a loan from your circle. Every naira someone vouches for you unlocks a naira of your pot — up to the full {naira(pot)}.
          </p>
          <a className="btn mt-3 w-full bg-[#25D366] text-white hover:opacity-90" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
            Ask someone to vouch for you
          </a>
        </>
      ) : (
        <p className="mt-3 text-sm text-good">You&apos;re fully backed — you&apos;ll collect the whole pot at once.</p>
      )}
    </section>
  );
}

function Release({ id, amount }: { id: bigint; amount: bigint }) {
  const { call } = useAjoWrite();
  const { state, run } = useTx();
  return (
    <section className="card border-good/40 p-5">
      <p className="font-serif text-lg font-semibold">{naira(amount)} of your held money is unlocked</p>
      <p className="mt-1 text-sm text-ink-soft">Someone vouched for you or you paid ahead, so it&apos;s no longer needed as cover.</p>
      <button className="btn-primary mt-3" disabled={state.status === "pending"} onClick={() => run(`${naira(amount)} sent to your wallet`, [call("Take it out", "releaseReserve", [id])])}>
        Take {naira(amount)} out
      </button>
      <TxStatus state={state} />
    </section>
  );
}

// ─── Ended ───────────────────────────────────────────────────────────────────

function EndStage({ id, status, me }: { id: bigint; status: string; me?: MemberView }) {
  const { address } = useMe();
  const { call } = useAjoWrite();
  const { state, run } = useTx();
  const vouched = useReadContract({
    address: AJO_ADDRESS,
    abi: ajoAbi,
    chainId: chain.id,
    functionName: "vouchLocked",
    args: address ? [id, address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const memberRefund = me && !me.data.settled ? me.data.stake + me.data.reserve : 0n;
  const vouchRefund = vouched.data ?? 0n;
  return (
    <section className="card p-5">
      <h2 className="font-serif text-2xl font-semibold">{status === "Completed" ? "Circle complete 🎉" : "This circle was cancelled"}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {status === "Completed" ? "Everyone has collected once. Take back your guarantee and any vouches." : "Nobody paid any rounds. Take back your guarantee and any vouches."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {me && !me.data.settled && memberRefund > 0n && (
          <button className="btn-primary" disabled={state.status === "pending"} onClick={() => run("Guarantee returned", [call("Take back your guarantee", "settleMember", [id])])}>
            Take back {naira(memberRefund)}
          </button>
        )}
        {me && !me.data.settled && memberRefund === 0n && !me.data.defaulted && status === "Completed" && (
          <button className="btn-primary" disabled={state.status === "pending"} onClick={() => run("Added to your record", [call("Record this circle", "settleMember", [id])])}>
            Add this circle to my record
          </button>
        )}
        {me && memberRefund === 0n && me.data.defaulted && (
          <p className="text-sm text-ink-soft">Your guarantee was used to cover a missed payment, so there&apos;s nothing left to return.</p>
        )}
        {vouchRefund > 0n && (
          <button className="btn-indigo" disabled={state.status === "pending"} onClick={() => run("Vouch returned", [call("Take back your vouches", "settleVoucher", [id])])}>
            Take back {naira(vouchRefund)} vouched
          </button>
        )}
        {me?.data.settled && vouchRefund === 0n && <p className="text-sm text-good">✓ All settled.</p>}
      </div>
      <TxStatus state={state} />
    </section>
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

function Members({ id, circle, members, me, status, initialVouch }: { id: bigint; circle: CircleData; members: readonly MemberView[]; me?: MemberView; status: string; initialVouch: string | null }) {
  const { address } = useMe();
  const initial = useMemo(() => members.find((m) => initialVouch && m.account.toLowerCase() === initialVouch.toLowerCase()) ?? null, [members, initialVouch]);
  const [vouchFor, setVouchFor] = useState<MemberView | null>(null);
  const [dismissedInitial, setDismissedInitial] = useState(false);
  const target = vouchFor ?? (!dismissedInitial ? initial : null);
  const canVouch = status === "Open" || status === "Active";

  return (
    <section>
      <h2 className="mb-3 font-serif text-2xl font-semibold">The circle</h2>
      <ul className="card divide-y divide-line">
        {members.map((m, i) => {
          const isRecipient = status === "Active" && i === circle.currentRound;
          const isMe = me?.account === m.account;
          const backing = m.data.stake + m.data.vouched;
          return (
            <li key={m.account} className={`flex items-center gap-3 p-4 ${isRecipient ? "bg-ochre-soft/15" : ""}`}>
              <Avatar address={m.account} name={m.name} size={42} ring={isRecipient ? "var(--ochre)" : undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <Link href={`/u/${m.account}`} className="hover:underline">
                    {label(m)}
                  </Link>
                  {isMe && <span className="text-ink-soft"> (you)</span>}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {status !== "Open" && <Pill tone="neutral">Round {i + 1}</Pill>}
                  {m.data.received && <Pill tone="good">Collected</Pill>}
                  {isRecipient && <Pill tone="warn">Collecting now</Pill>}
                  {status === "Active" && (m.paidThisRound ? <Pill tone="good">Paid ✓</Pill> : m.data.reserve >= circle.contribution ? <Pill tone="indigo">Covered</Pill> : <Pill>Not yet</Pill>)}
                  {m.data.defaulted && <Pill tone="bad">Missed a payment</Pill>}
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Backed by {naira(backing)}
                  {m.data.vouched > 0n && <> · {naira(m.data.vouched)} from vouches</>}
                </p>
              </div>
              {canVouch && address && !isMe && (
                <button className="btn-ghost btn-sm shrink-0" onClick={() => setVouchFor(m)}>
                  Vouch
                </button>
              )}
            </li>
          );
        })}
        {status === "Open" &&
          Array.from({ length: Number(circle.size) - members.length }).map((_, i) => (
            <li key={`empty-${i}`} className="flex items-center gap-3 p-4 text-ink-soft">
              <span className="grid h-[42px] w-[42px] place-items-center rounded-full border-2 border-dashed border-line">+</span>
              Open seat
            </li>
          ))}
      </ul>
      {target && (
        <VouchSheet
          id={id}
          circle={circle}
          member={target}
          onClose={() => {
            setVouchFor(null);
            setDismissedInitial(true);
          }}
        />
      )}
    </section>
  );
}

function VouchSheet({ id, circle, member, onClose }: { id: bigint; circle: CircleData; member: MemberView; onClose: () => void }) {
  const { isConnected, onMonad, address } = useMe();
  const { balance } = useWallet();
  const { approveIfNeeded, call } = useAjoWrite();
  const { state, run } = useTx();
  const dues = circle.contribution * BigInt(Number(circle.size) - 1 - member.data.slot);
  const gap = dues > member.data.stake + member.data.vouched ? dues - member.data.stake - member.data.vouched : 0n;
  const [input, setInput] = useState(nairaInput(gap));
  const amount = nairaToUnits(input);
  const self = address?.toLowerCase() === member.account.toLowerCase();

  return (
    <Sheet open onClose={onClose} title={`Vouch for ${label(member)}`}>
      <div className="flex items-center gap-3">
        <Avatar address={member.account} name={member.name} size={48} />
        <div className="text-sm">
          <p className="font-medium">{label(member)}</p>
          <p className="text-ink-soft">
            <Link href={`/u/${member.account}`} className="underline">
              See their record
            </Link>
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-ink-soft">
        <li>• Your money backs {label(member)}&apos;s remaining payments in {circle.name}.</li>
        <li>• Every naira you vouch unlocks a naira of their pot now, instead of it being held back.</li>
        <li>• If they pay everything, you get it all back at the end and your record shows you backed someone good.</li>
        <li className="text-bad">• If they stop paying, your vouch covers them — only vouch for people you trust.</li>
      </ul>
      {gap > 0n && <p className="mt-3 text-sm">{naira(gap)} would let them collect their full pot.</p>}
      {!isConnected ? (
        <div className="mt-4">
          <ConnectButton />
        </div>
      ) : self ? (
        <p className="mt-4 text-sm text-bad">You can&apos;t vouch for yourself — share this link with someone who trusts you.</p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(`You vouched ${naira(amount)} for ${label(member)}`, [...approveIfNeeded(amount, amount), call("Vouch", "vouch", [id, member.account, amount])]);
            if (ok) setTimeout(onClose, 1500);
          }}
        >
          <div>
            <label className="label" htmlFor="vouch">
              Amount (₦)
            </label>
            <input id="vouch" className="field tabular-nums" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          </div>
          {amount > balance && <p className="text-sm text-bad">Not enough in your wallet.</p>}
          <button className="btn-primary w-full" disabled={!onMonad || amount === 0n || amount > balance || state.status === "pending"}>
            Vouch {amount > 0n ? naira(amount) : ""}
          </button>
        </form>
      )}
      <TxStatus state={state} />
    </Sheet>
  );
}
