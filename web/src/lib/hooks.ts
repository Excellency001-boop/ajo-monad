"use client";

import { useEffect, useState } from "react";
import { useBlock, useConnection, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import type { Address, Hash } from "viem";
import { ajoAbi, tokenAbi } from "./abi";
import { AJO_ADDRESS, chain, TOKEN_ADDRESS } from "./config";

const ajo = { address: AJO_ADDRESS, abi: ajoAbi, chainId: chain.id } as const;
const token = { address: TOKEN_ADDRESS, abi: tokenAbi, chainId: chain.id } as const;

export const STATUS = ["Open", "Active", "Completed", "Cancelled"] as const;

/** Chain time in seconds, ticking every second, anchored to the latest block (laptop clocks drift). */
export function useChainNow() {
  const { data: block, dataUpdatedAt } = useBlock({ chainId: chain.id, query: { refetchInterval: 30_000 } });
  const offset = block ? Number(block.timestamp) - dataUpdatedAt / 1000 : 0;
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.abs(offset) > 2 ? now + offset : now;
}

export function useMe() {
  const { address, isConnected, chainId } = useConnection();
  return { address, isConnected, onMonad: isConnected && chainId === chain.id };
}

export function useWallet() {
  const { address } = useMe();
  const enabled = Boolean(address && TOKEN_ADDRESS && AJO_ADDRESS);
  const balance = useReadContract({
    ...token,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 8_000 },
  });
  const allowance = useReadContract({
    ...token,
    functionName: "allowance",
    args: address && AJO_ADDRESS ? [address, AJO_ADDRESS] : undefined,
    query: { enabled },
  });
  return { balance: balance.data ?? 0n, allowance: allowance.data ?? 0n };
}

export function useCircle(id: bigint | undefined) {
  const enabled = id !== undefined && Boolean(AJO_ADDRESS);
  const circle = useReadContract({
    ...ajo,
    functionName: "getCircle",
    args: id !== undefined ? [id] : undefined,
    query: { enabled, refetchInterval: 3_000 },
  });
  const members = useReadContract({
    ...ajo,
    functionName: "getMembers",
    args: id !== undefined ? [id] : undefined,
    query: { enabled, refetchInterval: 3_000 },
  });
  const count = useReadContract({ ...ajo, functionName: "circleCount", query: { enabled } });
  const exists = count.data !== undefined && id !== undefined ? id < count.data : undefined;
  return {
    circle: exists ? circle.data : undefined,
    members: members.data ?? [],
    exists,
    isLoading: circle.isLoading || count.isLoading,
  };
}

export type CircleData = NonNullable<ReturnType<typeof useCircle>["circle"]>;
export type MemberView = ReturnType<typeof useCircle>["members"][number];

export function useMyCircles() {
  const { address } = useMe();
  const ids = useReadContract({
    ...ajo,
    functionName: "circlesOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && AJO_ADDRESS), refetchInterval: 6_000 },
  });
  const list = [...(ids.data ?? [])].reverse();
  const circles = useReadContracts({
    contracts: list.map((id) => ({ ...ajo, functionName: "getCircle", args: [id] }) as const),
    query: { enabled: list.length > 0, refetchInterval: 6_000 },
  });
  return {
    isLoading: ids.isLoading,
    circles: list
      .map((id, i) => ({ id, circle: circles.data?.[i]?.result as CircleData | undefined }))
      .filter((x) => x.circle),
  };
}

export function useReputation(address: Address | undefined) {
  const enabled = Boolean(address && AJO_ADDRESS);
  const rep = useReadContract({
    ...ajo,
    functionName: "reputation",
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 10_000 },
  });
  const name = useReadContract({
    ...ajo,
    functionName: "nameOf",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const [onTime, late, missed, circlesCompleted, payouts, savedValue, vouchHonoured, vouchLost] = rep.data ?? [
    0, 0, 0, 0, 0, 0n, 0n, 0n,
  ];
  return {
    name: name.data ?? "",
    rep: { onTime, late, missed, circlesCompleted, payouts, savedValue, vouchHonoured, vouchLost },
    isLoading: rep.isLoading,
  };
}

/**
 * Trust score 0–100 shown on profiles. Transparent on purpose: every input is on-chain.
 * Payment reliability is the core; completed circles and honoured vouches add weight;
 * newcomers start at 0 ("new"), not at a free 50.
 */
export function trustScore(r: ReturnType<typeof useReputation>["rep"]): number | null {
  const paidTotal = r.onTime + r.late + r.missed;
  if (paidTotal === 0) return null;
  const reliability = (r.onTime + 0.5 * r.late) / paidTotal; // 0..1
  const experience = Math.min(1, (r.circlesCompleted * 2 + paidTotal / 4) / 10); // grows with history
  const backingOthers = Number(r.vouchHonoured) > 0 && Number(r.vouchLost) === 0 ? 0.05 : 0;
  return Math.round(Math.min(1, reliability * (0.6 + 0.35 * experience) + backingOthers) * 100);
}

/** Builds the approve-then-act steps so each action is one clear flow in the UI. */
export function useAjoWrite() {
  const { mutateAsync } = useWriteContract();
  const { allowance } = useWallet();

  const approveIfNeeded = (needed: bigint, generous: bigint) =>
    allowance >= needed
      ? []
      : [
          {
            label: "Allow Ajo to collect your payments",
            send: () =>
              mutateAsync({
                address: TOKEN_ADDRESS!,
                abi: tokenAbi,
                functionName: "approve",
                args: [AJO_ADDRESS!, generous > needed ? generous : needed],
              }) as Promise<Hash>,
          },
        ];

  const call = <F extends string>(label: string, functionName: F, args: readonly unknown[]) => ({
    label,
    send: () =>
      mutateAsync({ address: AJO_ADDRESS!, abi: ajoAbi, functionName, args } as never) as Promise<Hash>,
  });

  const faucet = () => ({
    label: "Get test dollars",
    send: () =>
      mutateAsync({ address: TOKEN_ADDRESS!, abi: tokenAbi, functionName: "faucet" }) as Promise<Hash>,
  });

  return { approveIfNeeded, call, faucet };
}
