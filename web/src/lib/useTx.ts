"use client";

import { useCallback, useState } from "react";
import { useConnection, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, type Hash, type TransactionReceipt } from "viem";

export type TxState =
  | { status: "idle" }
  | { status: "pending"; label: string }
  | { status: "success"; label: string; hash: Hash; ms: number }
  | { status: "error"; message: string };

/** Human messages for the contract's custom errors. */
const FRIENDLY: Record<string, string> = {
  CircleFull: "This circle is already full.",
  AlreadyMember: "You're already in this circle.",
  NotMember: "Only members of this circle can do that.",
  AlreadyPaid: "You've already paid this round.",
  RoundNotClosable: "Someone still hasn't paid and the deadline hasn't passed yet.",
  NotOrganizer: "Only the organiser can do that.",
  NotFull: "The circle needs all its members before it can start.",
  CannotVouchForSelf: "You can't vouch for yourself — ask someone who trusts you.",
  TooManyVouchers: "This member already has the maximum number of vouchers.",
  InvalidAmount: "That amount isn't valid.",
  InvalidName: "Names must be 1–32 characters.",
  NothingToClaim: "There's nothing to claim right now.",
  FaucetCooldown: "Test dollars are limited to once a minute. Try again shortly.",
  WrongStatus: "The circle isn't at that stage.",
};

function friendly(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && FRIENDLY[name]) return FRIENDLY[name];
    }
    if (/rejected|denied/i.test(e.shortMessage)) return "You cancelled in your wallet.";
    if (/insufficient funds/i.test(e.message)) return "Not enough MON for the network fee.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong";
}

/** sign → wait for receipt → refresh all reads; measures confirmation time. */
export function useTx() {
  const client = usePublicClient();
  const { address } = useConnection();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async (
      label: string,
      steps: { label: string; send: () => Promise<Hash> }[],
    ): Promise<TransactionReceipt | null> => {
      if (!client) throw new Error("No connection to Monad");
      // A brand-new account has no MON for network fees until the free top-up lands.
      if (address && (await client.getBalance({ address }).catch(() => 1n)) === 0n) {
        setState({
          status: "error",
          message: "Your account doesn't have network fees yet. Free fees are added automatically — wait a few seconds and try again.",
        });
        return null;
      }
      try {
        let last: { hash: Hash; ms: number; receipt: TransactionReceipt } | undefined;
        for (const [i, step] of steps.entries()) {
          const prefix = steps.length > 1 ? `Step ${i + 1} of ${steps.length}: ` : "";
          setState({ status: "pending", label: `${prefix}${step.label} — confirm in your wallet` });
          const hash = await step.send();
          const t0 = performance.now();
          setState({ status: "pending", label: `${prefix}${step.label} — confirming…` });
          const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: 250 });
          if (receipt.status !== "success") throw new Error("Transaction failed on-chain");
          last = { hash, ms: performance.now() - t0, receipt };
        }
        setState({ status: "success", label, hash: last!.hash, ms: last!.ms });
        await queryClient.invalidateQueries();
        return last!.receipt;
      } catch (e) {
        setState({ status: "error", message: friendly(e) });
        await queryClient.invalidateQueries();
        return null;
      }
    },
    [client, address, queryClient],
  );

  return { state, run, reset: () => setState({ status: "idle" }) };
}
