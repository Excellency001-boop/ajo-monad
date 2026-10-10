"use client";

import { ConnectButton } from "@/components/Header";
import { MyCircles, NamePrompt, WalletCard } from "@/components/Dashboard";
import { IS_CONFIGURED } from "@/lib/config";
import { useMe } from "@/lib/hooks";
import { useHydrated } from "@/components/ui";

export default function Home() {
  const { isConnected } = useMe();
  const hydrated = useHydrated();
  return (
    <>
      {!IS_CONFIGURED && (
        <p className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          Contracts not configured: set <code>NEXT_PUBLIC_AJO_ADDRESS</code> and <code>NEXT_PUBLIC_TOKEN_ADDRESS</code> in{" "}
          <code>web/.env.local</code>.
        </p>
      )}
      {hydrated && isConnected ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-6">
            <NamePrompt />
            <WalletCard />
          </div>
          <MyCircles />
        </div>
      ) : (
        <Landing />
      )}
    </>
  );
}

function Landing() {
  return (
    <>
      <section className="grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <p className="eyebrow mb-4">àjọ · èsúsú · adashe · susu</p>
          <h1 className="font-serif text-[40px] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[56px]">
            The ajo you know. <em className="text-indigo-600">Without the collector</em> who runs away.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
            Save with people you trust. The pot is held by code, not a person. When the people who know you vouch for you,
            you collect your full pot when it&apos;s your turn — and every payment builds a record that follows you.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <ConnectButton />
            <a href="#how" className="btn-ghost px-6 py-3.5 text-base">
              How it works
            </a>
          </div>
        </div>
        <RotationArt />
      </section>

      <section id="how" className="grid gap-4 pb-12 sm:grid-cols-3">
        {[
          {
            n: "1",
            t: "Nobody holds the pot",
            d: "Everyone pays in each round and the whole pot goes to that round's person automatically. No collector, no excuses, no running away.",
          },
          {
            n: "2",
            t: "Trust becomes money",
            d: "Collecting early is like a loan from the group. When people vouch for you, you get the full pot now. Without vouches, part is held to cover what you still owe — and it pays your next contributions for you.",
          },
          {
            n: "3",
            t: "The circle never freezes",
            d: "If someone stops paying, their stake and the people who vouched for them cover it. Honest members always get their money.",
          },
        ].map((s) => (
          <div key={s.n} className="card p-5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-800 font-serif text-lg text-ochre-soft">{s.n}</span>
            <h3 className="mt-3 font-serif text-xl font-semibold">{s.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="card mb-6 grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="eyebrow mb-2">Your record travels with you</p>
          <h2 className="font-serif text-2xl font-semibold">A trust score banks can&apos;t ignore</h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
            Every payment on time, every circle finished and every vouch honoured is recorded publicly and weighted by real money —
            so it can&apos;t be faked with two phones. Millions of people save in ajo every month with no credit history to show for
            it. Now it counts.
          </p>
        </div>
        <div className="text-center">
          <p className="font-serif text-6xl font-semibold text-good">92</p>
          <p className="text-xs text-ink-soft">example trust score</p>
        </div>
      </section>
    </>
  );
}

function RotationArt() {
  const seats = ["A", "B", "C", "D", "E", "F"];
  return (
    <div className="relative mx-auto aspect-square w-[280px] max-w-full">
      <div className="absolute inset-0 rounded-full border-2 border-dashed border-ochre-soft motion-safe:animate-[spin-slow_60s_linear_infinite]" />
      {seats.map((s, i) => {
        const a = (i / seats.length) * 2 * Math.PI - Math.PI / 2;
        const active = i === 0;
        return (
          <span
            key={s}
            className={`absolute grid h-[54px] w-[54px] place-items-center rounded-full border-[1.5px] text-lg font-semibold shadow-[var(--shadow-card)] ${
              active ? "scale-110 border-transparent bg-gradient-to-br from-clay to-clay-dark text-white" : "border-line bg-paper text-indigo-800"
            }`}
            style={{ left: `calc(50% + ${Math.cos(a) * 46}% - 27px)`, top: `calc(50% + ${Math.sin(a) * 46}% - 27px)` }}
          >
            {s}
          </span>
        );
      })}
      <div className="absolute inset-0 m-auto grid h-[124px] w-[124px] place-content-center rounded-full bg-indigo-800 text-center text-paper shadow-[var(--shadow-lift)]">
        <span className="text-[11px] uppercase tracking-widest text-ochre-soft">this round</span>
        <span className="font-serif text-2xl font-semibold">₦900k</span>
        <span className="text-[11px] text-paper/70">goes to A</span>
      </div>
    </div>
  );
}
