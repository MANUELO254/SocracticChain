"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Award,
  BarChart3,
  Clock,
  Crown,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAccount, useReadContract } from "wagmi";

const LOTTERY_ADDRESS = "0xaeCF00cfa7479527ec47Aa3D68E11AE206C4bC98";
const LOTTERY_ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_electionId",
        type: "uint256",
      },
    ],
    name: "getElection",
    outputs: [
      {
        internalType: "uint256",
        name: "vettingSessionId",
        type: "uint256",
      },
      {
        internalType: "uint256[]",
        name: "candidateIds",
        type: "uint256[]",
      },
      {
        internalType: "uint96",
        name: "votingStart",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "votingEnd",
        type: "uint96",
      },
      {
        internalType: "bool",
        name: "isFinalized",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "winner",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "totalVotes",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "totalWeight",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_electionId",
        type: "uint256",
      },
    ],
    name: "getVoteDistribution",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "candidateId",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "candidateAddress",
            type: "address",
          },
          {
            internalType: "string",
            name: "platformSummary",
            type: "string",
          },
          {
            internalType: "uint256",
            name: "voteWeight",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "probabilityBasisPoints",
            type: "uint256",
          },
        ],
        internalType: "struct WeightedLottery.VoteDistribution[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

export default function ElectionHub() {
  const [electionId, setElectionId] = useState(1);

  const { data: electionData, isLoading } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: "getElection",
    args: [BigInt(electionId)],
  });

  const { data: voteDistribution } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: "getVoteDistribution",
    args: [BigInt(electionId)],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-indigo-600" />
          <p className="text-slate-600">Loading election data...</p>
        </div>
      </div>
    );
  }

  const election = electionData
    ? {
        vettingSessionId: Number(electionData[0]),
        candidateIds: electionData[1].map((id: bigint) => Number(id)),
        votingStart: Number(electionData[2]),
        votingEnd: Number(electionData[3]),
        isFinalized: electionData[4],
        winner: Number(electionData[5]),
        totalVotes: Number(electionData[6]),
        totalWeight: Number(electionData[7]),
      }
    : null;

  const now = Math.floor(Date.now() / 1000);
  const timeLeft =
    election && election.votingEnd > now
      ? Math.floor((election.votingEnd - now) / 3600) + "h"
      : "Ended";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link
            href="/vetting"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 mb-4"
          >
            ← Back to Vetting
          </Link>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Weighted Lottery Election
          </h1>
          <p className="text-slate-600">
            Winner selected randomly based on nomination weights
          </p>
        </div>

        {election && (
          <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-indigo-500 mb-8">
            <div className="flex items-start gap-6 mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <Crown className="w-8 h-8 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-800 mb-2">
                  Election #{electionId}
                </h3>
                <p className="text-slate-600 mb-2">
                  {election.isFinalized
                    ? "Winner has been selected via weighted random draw"
                    : "Random selection based on nomination counts from vetting phase"}
                </p>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{timeLeft}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{election.candidateIds.length} candidates</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-indigo-600">
                  {election.candidateIds.length}
                </div>
                <div className="text-sm text-slate-600">Vetted Candidates</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-indigo-600">
                  {election.totalWeight}
                </div>
                <div className="text-sm text-slate-600">Total Weight</div>
              </div>
              <div>
                {election.isFinalized ? (
                  <div className="text-3xl font-bold text-green-600">Finalized</div>
                ) : (
                  <div className="text-3xl font-bold text-yellow-600">Pending</div>
                )}
                <div className="text-sm text-slate-600">Status</div>
              </div>
            </div>

            {election.isFinalized && (
              <div className="mt-6 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-400">
                <div className="flex items-center gap-4">
                  <Crown className="w-12 h-12 text-yellow-600" />
                  <div>
                    <h4 className="text-2xl font-bold text-yellow-900">Winner Selected!</h4>
                    <p className="text-yellow-800 text-lg font-semibold">
                      Candidate #{election.winner}
                    </p>
                    <p className="text-yellow-700 text-sm">
                      Selected via provably fair VRF random draw
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Vote Distribution &amp; Probabilities
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Each candidate&apos;s probability is weighted by their nomination count from the community voting phase.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">
                    Candidate
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">
                    Address
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">
                    Platform
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">
                    Weight
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">
                    Probability
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {voteDistribution && voteDistribution.length > 0 ? (
                  voteDistribution.map((dist: any, idx: number) => {
                    const isWinner =
                      election?.isFinalized &&
                      Number(dist.candidateId) === election.winner;
                    const probability = (
                      Number(dist.probabilityBasisPoints) / 100
                    ).toFixed(2);

                    return (
                      <tr
                        key={idx}
                        className={`border-b border-slate-100 hover:bg-slate-50 ${
                          isWinner ? "bg-yellow-50" : ""
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {isWinner && (
                              <Crown className="w-4 h-4 text-yellow-600" />
                            )}
                            <span className="font-bold text-slate-800">
                              #{dist.candidateId.toString()}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono text-xs">
                          {dist.candidateAddress.slice(0, 6)}...
                          {dist.candidateAddress.slice(-4)}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {dist.platformSummary}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-indigo-500" />
                            <span className="font-semibold text-slate-800">
                              {dist.voteWeight.toString()}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-[100px]">
                              <div
                                className="bg-indigo-600 h-2 rounded-full"
                                style={{ width: `${probability}%` }}
                              />
                            </div>
                            <span className="font-semibold text-indigo-600 text-sm">
                              {probability}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {isWinner ? (
                            <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                              <Award className="w-3 h-3" />
                              Winner
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-medium">
                              Candidate
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No vote distribution data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-xl p-6 border-2 border-indigo-200">
          <h4 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            How Weighted Lottery Works
          </h4>
          <div className="space-y-2 text-sm text-indigo-800">
            <p>• <strong>No Direct Voting:</strong> This is NOT a traditional election where most votes wins</p>
            <p>• <strong>Nomination-Based:</strong> Weights come from the community nomination phase</p>
            <p>• <strong>Random Selection:</strong> Chainlink VRF randomly selects winner weighted by nomination counts</p>
            <p>• <strong>Fair Probability:</strong> Higher nominations = higher chance, but not guaranteed</p>
            <p>• <strong>Provably Fair:</strong> All randomness is verifiable on-chain via VRF</p>
          </div>
        </div>
      </div>
    </div>
  );
}