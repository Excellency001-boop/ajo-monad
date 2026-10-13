import { createPublicClient, createWalletClient, fallback, formatEther, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

/**
 * Free network fees for new Ajo accounts (Monad TESTNET only).
 * Tops a wallet up to 0.25 MON when it has less than 0.05 MON.
 * The sending wallet's key lives only in the server env var GAS_DRIP_PRIVATE_KEY.
 */
const TARGET = parseEther("0.25");
const LOW = parseEther("0.05");
const PER_IP_PER_HOUR = 6;

const rpcs = (process.env.GAS_DRIP_RPC_URL ? [process.env.GAS_DRIP_RPC_URL] : [])
  .concat(["https://testnet-rpc.monad.xyz", "https://rpc-testnet.monadinfra.com", "https://monad-testnet.drpc.org"]);
const transport = fallback(rpcs.map((u) => http(u)));

// Best-effort abuse limits (per server instance) and a queue so concurrent sends don't clash on nonces.
const hits = new Map<string, number[]>();
let queue: Promise<unknown> = Promise.resolve();

export async function POST(req: Request) {
  const raw = process.env.GAS_DRIP_PRIVATE_KEY;
  if (!raw) return Response.json({ ok: false, error: "Free network fees aren't set up yet." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { address?: string };
  const address = body.address;
  if (!address || !isAddress(address)) return Response.json({ ok: false, error: "Invalid address." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_IP_PER_HOUR) {
    return Response.json({ ok: false, error: "Too many requests — try again in a while." }, { status: 429 });
  }

  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(key);
  const pub = createPublicClient({ chain: monadTestnet, transport });
  const wallet = createWalletClient({ chain: monadTestnet, transport, account });

  const run = async () => {
    const balance = await pub.getBalance({ address });
    if (balance >= LOW) return Response.json({ ok: true, skipped: true, balance: formatEther(balance) });
    const value = TARGET - balance;
    const hash = await wallet.sendTransaction({ to: address, value });
    await pub.waitForTransactionReceipt({ hash });
    recent.push(now);
    hits.set(ip, recent);
    return Response.json({ ok: true, hash, sent: formatEther(value) });
  };

  const result = queue.then(run, run);
  queue = result.catch(() => {});
  try {
    return await result;
  } catch (e) {
    console.error("gas drip failed", e);
    return Response.json({ ok: false, error: "Couldn't send network fees right now." }, { status: 502 });
  }
}
