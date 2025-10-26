"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle, Crown, Loader2, Upload } from "lucide-react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

const CANDIDACY_ADDRESS = "0x18dE7B71bb81B8140cD44B36aF0A669cc4e0F2Ca";
const NOMINATION_ADDRESS = "0x2519A217755e7E31d4FDC6075079Ae15769ffE8a";

const CANDIDACY_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "_electionId", type: "uint256" },
      { internalType: "string", name: "_platformIPFS", type: "string" },
      { internalType: "string", name: "_platformSummary", type: "string" },
      { internalType: "string[]", name: "_tags", type: "string[]" },
    ],
    name: "mintCandidacy",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "cooldownPeriod",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "lastMintTimestamp",
    outputs: [{ internalType: "uint96", name: "", type: "uint96" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "activeCandidacyId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_electionId", type: "uint256" }],
    name: "getActiveCandidatesForElection",
    outputs: [{ internalType: "uint256[]", name: "", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "getCandidateProfile",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "tokenId", type: "uint256" },
          { internalType: "address", name: "candidate", type: "address" },
          { internalType: "uint256", name: "electionId", type: "uint256" },
          { internalType: "bool", name: "isActive", type: "bool" },
          { internalType: "string", name: "platformIPFS", type: "string" },
          { internalType: "string", name: "platformSummary", type: "string" },
          { internalType: "string[]", name: "tags", type: "string[]" },
          { internalType: "uint96", name: "mintedAt", type: "uint96" },
          { internalType: "uint256", name: "attestationCount", type: "uint256" },
        ],
        internalType: "struct CandidacyNFT.CandidateProfile",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const NOMINATION_ABI = [
  {
    inputs: [],
    name: "electionCounter",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_electionId", type: "uint256" }],
    name: "getElection",
    outputs: [
      { internalType: "uint96", name: "nominationStart", type: "uint96" },
      { internalType: "uint96", name: "nominationEnd", type: "uint96" },
      { internalType: "uint256", name: "topN", type: "uint256" },
      { internalType: "uint256", name: "minimumNominations", type: "uint256" },
      { internalType: "bool", name: "isFinalized", type: "bool" },
      { internalType: "uint256", name: "totalVoters", type: "uint256" },
      { internalType: "bool", name: "autoFinalizationEnabled", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

interface CandidateProfile {
  tokenId: bigint;
  candidate: string;
  electionId: bigint;
  isActive: boolean;
  platformIPFS: string;
  platformSummary: string;
  tags: string[];
  mintedAt: bigint;
  attestationCount: bigint;
}

interface Election {
  nominationStart: number;
  nominationEnd: number;
  topN: number;
  minimumNominations: number;
  isFinalized: boolean;
  totalVoters: number;
}

export default function NominationHub() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState("overview");
  const [electionId, setElectionId] = useState("1");
  const [ipfsHash, setIpfsHash] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data: electionCounter } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: "electionCounter",
  });

  const { data: electionData } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: "getElection",
    args: [BigInt(electionId)],
  });

  const cooldown = 300n;

  const { data: lastMint } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: "lastMintTimestamp",
    args: address ? [address] : undefined,
  });

  const { data: activeId } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: "activeCandidacyId",
    args: address ? [address] : undefined,
  });

  const { data: activeCandidates } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: "getActiveCandidatesForElection",
    args: [BigInt(electionId)],
  });

  const { data: profile } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: "getCandidateProfile",
    args: activeId && (activeId as bigint) > 0n ? [activeId as bigint] : undefined,
  });

  const now = Math.floor(Date.now() / 1000);
  const cooldownElapsed = lastMint ? now - Number(lastMint as bigint) : Infinity;
  const hasActive = activeId && (activeId as bigint) > 0n;
  const isEligible = !hasActive && cooldownElapsed >= Number(cooldown || 0n);

  const rawElection = electionData as [bigint, bigint, bigint, bigint, boolean, bigint, boolean] | undefined;

  const election: Election | null = rawElection
    ? {
        nominationStart: Number(rawElection[0]),
        nominationEnd: Number(rawElection[1]),
        topN: Number(rawElection[2]),
        minimumNominations: Number(rawElection[3]),
        isFinalized: rawElection[4],
        totalVoters: Number(rawElection[5]),
      }
    : null;

  const isElectionActive =
    election && now >= election.nominationStart && now < election.nominationEnd && !election.isFinalized;

  const { writeContract, data: txHash, isPending: isMinting } = useWriteContract();
  const { isSuccess: mintSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {}
        throw new Error(`Upload failed (${response.status}): ${errorMessage}`);
      }

      const result = await response.json();
      setIpfsHash(result.cid);
      alert(`File uploaded successfully! CID: ${result.cid}`);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed: " + (error as Error).message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleMint = () => {
    if (!ipfsHash || !summary || !tagsInput.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    writeContract({
      address: CANDIDACY_ADDRESS,
      abi: CANDIDACY_ABI,
      functionName: "mintCandidacy",
      args: [BigInt(electionId), ipfsHash, summary, tags],
    });
  };

  const typedProfile = profile as CandidateProfile | undefined;

  const Overview = () => (
    <div className="space-y-6">
      <div className="bg-indigo-50 border-2 border-indigo-400 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium text-indigo-900">Select Election:</span>
            <select
              value={electionId}
              onChange={(e) => setElectionId(e.target.value)}
              className="px-4 py-2 border border-indigo-300 rounded-lg bg-white font-medium"
            >
              {electionCounter &&
                Array.from({ length: Number(electionCounter as bigint) }, (_, i) => i + 1).map((id) => (
                  <option key={id} value={id}>
                    Election #{id}
                  </option>
                ))}
            </select>
          </div>
          {election && (
            <div className="flex items-center gap-2">
              {isElectionActive ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">● Active</span>
              ) : election.isFinalized ? (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">● Finalized</span>
              ) : now < election.nominationStart ? (
                <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">● Not Started</span>
              ) : (
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">● Ended</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-purple-500">
        <h3 className="text-2xl font-bold text-slate-800 mb-2">Election #{electionId} - Candidacy Declaration</h3>
        <p className="text-slate-600 mb-2">Mint your Candidacy NFT to declare your intent to run</p>

        {!address ? (
          <div className="p-4 bg-yellow-50 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-yellow-800">Connect wallet to check eligibility</p>
          </div>
        ) : hasActive ? (
          <div className="p-4 bg-blue-50 rounded-xl text-center">
            <Crown className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <p className="text-blue-700 font-medium mb-3">You have active candidacy #{(activeId as bigint)?.toString()}</p>
          </div>
        ) : isEligible ? (
          <div className="p-4 bg-green-50 rounded-xl text-center">
            <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-green-700 font-medium mb-3">You are eligible to declare candidacy!</p>
          </div>
        ) : (
          <div className="p-4 bg-red-50 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <p className="text-red-700">Cooldown active</p>
          </div>
        )}
      </div>
    </div>
  );

  const DeclareTab = () => (
    <div className="space-y-6">
      {!address ? (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <span className="text-yellow-800">Connect your wallet to declare candidacy</span>
        </div>
      ) : hasActive && typedProfile ? (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Your Active Candidacy #{(activeId as bigint)?.toString()}</h3>
          <div className="space-y-4">
            <div>
              <span className="text-sm text-slate-600">Election: </span>
              <span className="font-medium">#{typedProfile.electionId.toString()}</span>
            </div>
            <div>
              <span className="text-sm text-slate-600">Summary: </span>
              <p className="font-medium">{typedProfile.platformSummary}</p>
            </div>
            <div>
              <span className="text-sm text-slate-600">IPFS: </span>
              <a
                href={`https://ipfs.io/ipfs/${typedProfile.platformIPFS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {typedProfile.platformIPFS.slice(0, 20)}...
              </a>
            </div>
            <div>
              <span className="text-sm text-slate-600">Tags: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {typedProfile.tags.map((tag, i) => (
                  <span key={i} className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <h3 className="font-semibold text-slate-800 mb-4">Declare Your Candidacy</h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Upload Manifesto</label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
              <input
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                accept=".pdf,.md,.txt"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Click to upload your platform document</p>
                {uploadingFile && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-2" />}
              </label>
            </div>
            {ipfsHash && (
              <div className="mt-2 p-2 bg-green-50 rounded text-sm text-green-700">✓ Uploaded: {ipfsHash}</div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IPFS Hash</label>
            <input
              type="text"
              placeholder="Qm..."
              value={ipfsHash}
              onChange={(e) => setIpfsHash(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Platform Summary (280 chars)</label>
            <textarea
              placeholder="Brief summary of your platform"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg h-20"
              maxLength={280}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              placeholder="governance, sustainability"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="button"
            onClick={handleMint}
            disabled={!ipfsHash || !summary || !tagsInput.trim() || isMinting}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg"
          >
            {isMinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            {isMinting ? "Minting..." : "Declare Candidacy"}
          </button>
          {mintSuccess && <div className="p-3 bg-green-100 rounded text-green-700 text-sm">✓ Candidacy declared!</div>}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-purple-600 mb-4">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Candidacy Declaration</h1>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 bg-white rounded-xl p-2 shadow-md">
            {[
              { id: "overview", label: "Overview" },
              { id: "declare", label: "Declare Candidacy" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id ? "bg-purple-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {activeTab === "overview" && <Overview />}
          {activeTab === "declare" && <DeclareTab />}
        </div>
      </div>
    </div>
  );
}