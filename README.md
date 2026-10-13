# àjọ — savings circles where trust is money

**The ajo you know, without the collector who runs away.**
Save with people you trust. The pot is held by code, not a person. When people who know you vouch for you,
you collect your full pot when it's your turn, and every payment builds a record that follows you.

Built on **Monad** for the Metropolis hackathon · Track: **Social, Attention & Culture**

| | |
|---|---|
| Live app | **https://ajo-monad.vercel.app** |
| Demo video | https://youtu.be/ASB7kh-7Csg |
| Ajo contract (verified) | [`0xE68c055aEECA6567DE6C01Dd90dC21381E9C4Bd8`](https://testnet.monadvision.com/address/0xE68c055aEECA6567DE6C01Dd90dC21381E9C4Bd8) |
| Test dollar (verified) | [`0x26cEF3636D74c34ffC1F17Ba8E6C3B4a57c70F7a`](https://testnet.monadvision.com/address/0x26cEF3636D74c34ffC1F17Ba8E6C3B4a57c70F7a) |
| Network | Monad Testnet (chain 10143) |

---

## The problem

Rotating savings circles (àjọ and èsúsú in Nigeria, susu in Ghana, chama in Kenya, tanda in Mexico, hui
in China) are how an estimated hundreds of millions of people save, with no bank in sight. Everyone pays a fixed amount
each round, and each round one member collects the whole pot.

Putting the pot in a smart contract so "the collector can't run away" is the easy part, and it has been
done before. **The hard problem is what kills real circles:**

1. **The early collector who stops paying.** Collecting in round 1 is effectively a loan from the group.
   When that person disappears, everyone after them loses.
2. **Circles that freeze.** One person stops paying and the whole circle stalls, with everyone's money stuck.
3. **Invisible good behaviour.** Someone who has paid faithfully for 10 years has nothing to show a bank.

## The solution: three mechanisms

### 1. Trust becomes liquidity
When it's your turn, the pot is split in two:

- **Upfront:** the part of your remaining contributions that is backed by your own guarantee plus what
  other people have **vouched** for you. This is paid to you now.
- **Held:** the part nobody has backed. It stays in the contract and **pays your next contributions
  automatically**.

Anyone can vouch: a circle-mate, an aunt in London, an employer. Every naira vouched unlocks a naira of
your pot, up to the full amount, and a vouch made after you've collected releases held money straight
away. If you pay everything, vouchers get their money back in full and their record shows it. If you
stop paying, their vouch covers you. This is the social pressure that real ajo runs on, made enforceable.

> Example: 4 traders, ₦150,000 each per round, so the pot is ₦600,000. Amaka collects first and still owes
> ₦450,000. Her ₦150,000 guarantee backs part of it, so **₦300,000 is paid now and ₦300,000 is held**.
> Her uncle vouches ₦300,000, and she collects the **full ₦600,000**.

### 2. A circle never freezes
After a round's deadline **anyone** can close it, whether a member, the person collecting, or a bot.
A missing payment is covered, in order, from:

1. the member's held money,
2. then their own guarantee,
3. then their vouchers, shared in proportion to what each vouched,
4. and only for a member who hasn't collected yet, a **debt repaid out of their own pot** before they
   receive anything.

The honest members always get their money. A fuzz test checks this on 10,000 random circles.

### 3. A record that costs something to earn
Every on-time payment, miss, completed circle and honoured or lost vouch is recorded per address, across
all circles, with the **money value** saved. The trust score weighs reliability by value saved, so a good
record takes real savings over real time. It is portable credit history for people banks ignore.

## Why Monad

- **Small money, moving often.** An ajo is ₦5,000–₦150,000 a week, for months. Fees have to be invisible,
  and on Monad a contribution costs about 0.01–0.03 MON of gas (testnet), with sub-second confirmation.
- **Payouts that feel like cash.** When the last person pays, the pot goes out **in the same transaction**,
  confirmed in under a second. The app shows "🎉 The pot just landed for Amaka" while people are still looking
  at their phones.
- **Loops that would be too expensive elsewhere.** Closing a round touches every member, and covering
  a default walks the voucher list. On Monad that's cheap enough to run every week for every circle.

## What's new in this build (Metropolis, Sep 1 – Oct 13 2026)

Ajo v1 won the BOT Chain Africa Builder Challenge (Aug 2026): a basic trustless circle with a deposit
([repo](https://github.com/Excellency001-boop/ajo-botchain)). **Everything in this repository was written
during Metropolis**, from a new design:

| | v1 (BOT Chain, Aug) | **v2 (Monad, this repo)** |
|---|---|---|
| Early collector stops paying | deposit covers ~1 round, then the group loses | **reserve + guarantee + vouchers cover every remaining payment** |
| Someone stops paying | circle can freeze with funds stuck | **anyone closes the round; it never freezes** |
| Collecting early | everyone gets the same pot regardless of trust | **trust = liquidity: vouches unlock the pot** |
| Vouching / social graph | none | **anyone can vouch, slashed pro-rata, honoured on record** |
| Reputation | count of on-time payments (farmable) | **value-weighted, includes misses, completions, vouches** |
| Money safety | lifecycle tests | **26 tests + 10,000-run fuzz: conservation, nothing stuck, honest members whole** |
| App | single page | **mobile-first: invites, live rounds, vouch links, profiles, naira-first** |

## Architecture

```
contracts/ (Foundry, Solidity 0.8.28, OpenZeppelin 5.1)
  src/Ajo.sol         the whole protocol: circles, vouching, reserve, coverage, reputation, names
  src/TestDollar.sol  6-decimal testnet dollar with a faucet (mainnet would use AUSD/USDC)
  test/Ajo.t.sol      26 tests incl. fuzzed conservation of money
  script/             Deploy.s.sol (testnet), SeedLocal.s.sol (local QA only)

web/ (Next.js 16, wagmi 3, viem, Tailwind 4)
  /            landing → dashboard (balance, name, your circles)
  /new         start a circle → WhatsApp invite
  /c/[id]      the circle: whose turn, who paid, countdown, pay, vouch, close round, settle
  /c/[id]?vouch=0x…   a "please vouch for me" link to send a relative
  /u/[address] trust profile
```

- **One contract, many circles.** No admin, no upgradeability, no fees.
- `nonReentrant` on every state-changing function, all state written **before** any token moves, and pushed
  payouts with a `claimable` fallback, so one blocked recipient can't stop a circle.
- Dust-vouch griefing is blocked: the minimum vouch is 1/10 of a contribution.
- The app reads everything through view functions (`getCircle`, `getMembers`, `previewPayout`), so it
  needs no indexer, and it falls back across 4 Monad RPCs.

## Run it

```bash
git clone --recursive https://github.com/Excellency001-boop/ajo-monad && cd ajo-monad

# contracts
cd contracts && forge test            # 26 tests
FOUNDRY_FUZZ_RUNS=10000 forge test --match-test testFuzz

# app (uses the deployed testnet contracts from .env.example)
cd ../web && cp .env.example .env.local && npm install && npm run dev
```

Get testnet MON at https://faucet.monad.xyz. Test dollars come from the "+ Add test money" button in the app.

Deploy your own:
```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --private-key $PRIVATE_KEY --broadcast
```

## Honest limits and roadmap

- **Testnet only, not audited.** The test dollar is not money.
- **Sybil resistance is economic, not identity-based.** The score makes farming cost real money and time,
  but it doesn't prove one person = one address. Next: passkey accounts (no seed phrases) and attestations.
- **Payout order** is set by the organiser (join order or a ballot). A trust-ranked order is a natural next step.
- **Next:** mainnet with a real dollar stablecoin, naira on/off-ramp, a WhatsApp bot that reminds people and
  closes overdue rounds, credit lines priced from the Ajo record, and diaspora members contributing from abroad.
