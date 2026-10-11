# Metropolis submission kit — Ajo

## Name
Ajo

## Tagline
Savings circles where trust is money. The ajo you know, without the collector who runs away.

## Track
Social, Attention & Culture
(Fallback if you prefer: Consumer Products & Payments. Its brief lists "shared wallets and group spending
that settle without an intermediary".)

## Short description (paste into the project profile)

An estimated hundreds of millions of people save in rotating circles: àjọ and èsúsú in Nigeria, susu, chama, tanda. Everyone
pays in each round and one person collects the pot. Putting the pot in a contract stops the collector running
away, but that isn't why circles fail. They fail when the person who collected early stops paying, the circle
freezes, and years of good behaviour leave no record.

**Ajo makes the circle's social trust enforceable.**

- **Trust becomes money.** Collecting early is a loan from the group. When it's your turn you get the part of
  your pot backed by your own guarantee plus what others have vouched for you. The rest is held back and pays
  your next contributions automatically. Get vouched for by a circle-mate or a relative abroad, and you collect
  the full pot.
- **Circles never freeze.** After a deadline anyone can close the round. A missed payment is covered by the
  member's held money, then their guarantee, then their vouchers in proportion, then a debt repaid from their
  own pot. Honest members always get paid.
- **A record that counts.** Payments, misses, completed circles and honoured vouches are recorded per address
  and weighted by the money actually saved. It becomes portable credit history for people banks ignore.

**Why Monad:** ajo is small money moving every week, so fees must be invisible and payouts must feel like cash.
When the last member pays, the pot goes out in the same transaction and confirms in under a second.

**Built during Metropolis:** Ajo v1 won the BOT Chain Africa Builder Challenge in August 2026. It was a basic
trustless circle with a deposit. Everything in this repo is new: the vouching and liquidity design, never-freeze
coverage, value-weighted reputation, the contract, 26 tests plus a 10,000-run money-safety fuzz, and a new
mobile-first app. The README has a v1 vs v2 table.

## Links
- Live app: `<Vercel URL>`
- Code: https://github.com/Excellency001-boop/ajo-monad
- Demo video: `<URL>`
- Contract (verified): https://testnet.monadvision.com/address/0xE68c055aEECA6567DE6C01Dd90dC21381E9C4Bd8

---

## Demo script (about 2 minutes)

**Cast:** Amaka (your MetaMask, account 1, on screen), Tunde (your deploy wallet, driven by commands),
Uncle Femi (MetaMask account 2). Use a **2-minute circle with 2 people** so the whole story fits in one take.
Rehearse once before recording.

| Time | Screen | Say |
|---|---|---|
| 0:00 | Landing page | "Millions of Nigerians save in ajo every month. The problem isn't the collector running away. It's the person who collects first and then disappears. Ajo fixes that." |
| 0:12 | Amaka: Start a circle, "Bodija Market Women", ₦150,000, 2 people, 2 minutes → invite sheet | "I start a circle and share it on WhatsApp." |
| 0:25 | Tunde joins (run the join command) → seat fills → Amaka taps **Start** | "Tunde joins. The pot is held by code, not by a person." |
| 0:35 | Amaka's **Your turn** card: ₦X now, ₦Y held | "I collect first, but I still owe the group. Nobody has vouched for me yet, so part of my pot is held back to pay my next contribution." |
| 0:50 | Switch to Femi: open Amaka's vouch link → vouch → back to Amaka: **full pot unlocked** | "My uncle trusts me. He vouches, and the whole pot unlocks. Trust just became money." |
| 1:05 | Amaka pays, Tunde pays → **🎉 The pot just landed for Amaka** | "Last payment in, and the pot lands in under a second on Monad." |
| 1:20 | Round 2: Amaka *doesn't* pay. Wait out the deadline → **Close the round** | "Now say I stop paying. Anyone can close the round. My held money, my guarantee, then my vouchers cover it. Tunde still gets his full pot. The circle never freezes." |
| 1:40 | Amaka's profile: trust score + "Missed 1" | "And it's on my record: what I saved, what I missed, who I backed. Credit history for people banks ignore." |
| 1:55 | Landing | "Ajo. The circle you know, made unbreakable." |

### Commands for Tunde during the demo (run from `~/void/ajo/contracts`)
Replace `CIRCLE_ID` with the number in the circle's URL (`/c/CIRCLE_ID`).

```bash
source ~/void/contracts/.env; R=https://testnet-rpc.monad.xyz; A=0xE68c055aEECA6567DE6C01Dd90dC21381E9C4Bd8; T=0x26cEF3636D74c34ffC1F17Ba8E6C3B4a57c70F7a
# one-time setup for Tunde
cast send $T "faucet()" --private-key $PRIVATE_KEY --rpc-url $R
cast send $T "approve(address,uint256)" $A 1000000000000 --private-key $PRIVATE_KEY --rpc-url $R
cast send $A "setName(string)" "Tunde" --private-key $PRIVATE_KEY --rpc-url $R
# join with a ₦150,000 guarantee ($100 at ₦1,500/$)
cast send $A "join(uint256,uint128)" CIRCLE_ID 100000000 --private-key $PRIVATE_KEY --rpc-url $R
# pay the current round
cast send $A "contribute(uint256)" CIRCLE_ID --private-key $PRIVATE_KEY --rpc-url $R
```

**Recording tips:** 1080p, browser zoom 110–125%, close other tabs, keep both MetaMask accounts on Monad
Testnet, and give each account about 0.5 testnet MON for gas.
