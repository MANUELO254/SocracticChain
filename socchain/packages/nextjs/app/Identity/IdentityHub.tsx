"use client";

import React, { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  AlertCircle,
  Award,
  CheckCircle,
  Coins,
  Loader2,
  Plus,
  Shield,
  User,
  Users,
} from "lucide-react";
import { parseEther } from "viem";

const IDENTITY_ADDRESS = "0x59d37399B778729d4B52aBf68Ee5D3deA62De277";
const IDENTITY_ABI = [
  {
    inputs: [{ internalType: "string", name: "_gitcoinPassportId", type: "string" }],
    name: "register",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "_toAddress", type: "address" },
      { internalType: "string", name: "_message", type: "string" },
    ],
    name: "createAttestation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_member", type: "address" }],
    name: "getIdentity",
    outputs: [
      { internalType: "address", name: "member", type: "address" },
      { internalType: "uint96", name: "registeredAt", type: "uint96" },
      { internalType: "uint96", name: "lastActivityAt", type: "uint96" },
      { internalType: "uint64", name: "passportScore", type: "uint64" },
      { internalType: "uint96", name: "lastScoreUpdate", type: "uint96" },
      { internalType: "uint256", name: "participationCount", type: "uint256" },
      { internalType: "uint256", name: "stakeAmount", type: "uint256" },
      { internalType: "bool", name: "isWhitelisted", type: "bool" },
      { internalType: "bool", name: "isBanned", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "_member", type: "address" }],
    name: "getAttestationsReceived",
    outputs: [
      {
        components: [
          { internalType: "address", name: "fromAddress", type: "address" },
          { internalType: "string", name: "message", type: "string" },
          { internalType: "uint96", name: "timestamp", type: "uint96" },
        ],
        internalType: "struct IdentityRegistry.Attestation[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

interface Identity {
  member: string;
  registeredAt: bigint;
  lastActivityAt: bigint;
  passportScore: bigint;
  lastScoreUpdate: bigint;
  participationCount: bigint;
  stakeAmount: bigint;
  isWhitelisted: boolean;
  isBanned: boolean;
}

interface Attestation {
  fromAddress: string;
  message: string;
  timestamp: bigint;
}

export default function IdentityHub() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState("overview");
  const [passportId, setPassportId] = useState("");
  const [stakeAmount] = useState("0.01");
  const [attestTo, setAttestTo] = useState("");
  const [attestMessage, setAttestMessage] = useState("");

  const { data: identityData } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "getIdentity",
    args: address ? [address] : undefined,
  });

  const { data: attestations } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "getAttestationsReceived",
    args: address ? [address] : undefined,
  });

  const { writeContract: writeRegister, data: registerHash, isPending: isRegistering } = useWriteContract();
  const { writeContract: writeAttest, data: attestHash, isPending: isAttesting } = useWriteContract();
  const { isSuccess: registerSuccess } = useWaitForTransactionReceipt({ hash: registerHash });
  const { isSuccess: attestSuccess } = useWaitForTransactionReceipt({ hash: attestHash });

  const typedIdentity = identityData as Identity | undefined;
  const isRegistered = typedIdentity && typedIdentity.member !== "0x0000000000000000000000000000000000000000";

  const formatEth = (value: bigint | undefined, fallback = 0) => {
    if (!value) return fallback;
    return (Number(value) / 1e18).toFixed(4);
  };

  const formatTimestamp = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  };

  const handleRegister = () => {
    if (!passportId.trim()) {
      alert("Please enter your Gitcoin Passport ID");
      return;
    }
    writeRegister({
      address: IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "register",
      args: [passportId],
      value: parseEther(stakeAmount),
    });
  };

  const handleAttest = () => {
    if (!attestTo || !attestMessage.trim()) return;
    writeAttest({
      address: IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "createAttestation",
      args: [attestTo as `0x${string}`, attestMessage],
    });
  };

  const Overview = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-indigo-500">
        <div className="flex items-start gap-6 mb-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Register Your Identity</h3>
            <p className="text-slate-600">Join the democratic process by verifying your identity</p>
          </div>
        </div>

        {!address ? (
          <div className="p-4 bg-yellow-50 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-yellow-800">Please connect your wallet to continue</p>
          </div>
        ) : isRegistered && typedIdentity ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm text-slate-600">Score</span>
                </div>
                <div className="text-2xl font-bold text-indigo-600">{typedIdentity.passportScore.toString()}</div>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-slate-600">Active</span>
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {typedIdentity.isWhitelisted ? "Whitelisted" : "Registered"}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-slate-600">Participation</span>
                  <div className="font-semibold text-slate-800">{typedIdentity.participationCount.toString()}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Attestations</span>
                  <div className="font-semibold text-slate-800">
                    {(attestations as Attestation[] | undefined)?.length || 0}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Registered since</span>
                  <div className="font-semibold text-slate-800">{formatTimestamp(typedIdentity.registeredAt)}</div>
                </div>
                <div>
                  <span className="text-sm text-slate-600">Whitelist Status</span>
                  <div className={`font-medium ${typedIdentity.isWhitelisted ? "text-green-600" : "text-slate-500"}`}>
                    {typedIdentity.isWhitelisted ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm text-slate-700">Staked Amount</span>
                </div>
                <span className="text-lg font-bold text-indigo-600">{formatEth(typedIdentity.stakeAmount)} ETH</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded mb-4">
            <CheckCircle className="w-5 h-5 inline mr-2 text-green-600" />
            <span className="text-green-800 font-medium">You are eligible to declare candidacy!</span>
          </div>
        )}
      </div>
    </div>
  );

  const RegisterTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Register Your Identity</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Gitcoin Passport ID</label>
            <input
              type="text"
              placeholder="Enter your Passport ID"
              value={passportId}
              onChange={e => setPassportId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <button
            onClick={handleRegister}
            disabled={isRegistering || !passportId.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            {isRegistering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Register Identity
          </button>
          {registerSuccess && (
            <div className="p-3 bg-green-100 rounded text-green-700 text-sm">✓ Registration successful!</div>
          )}
        </div>
      </div>
    </div>
  );

  const AttestTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Create Attestation</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Member Address</label>
            <input
              type="text"
              placeholder="0x..."
              value={attestTo}
              onChange={e => setAttestTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
            <textarea
              placeholder="Write your attestation message"
              value={attestMessage}
              onChange={e => setAttestMessage(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg h-24"
            />
          </div>
          <button
            onClick={handleAttest}
            disabled={isAttesting}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            {isAttesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Attestation
          </button>
          {attestSuccess && (
            <div className="p-3 bg-green-100 rounded text-green-700 text-sm">Attestation created successfully!</div>
          )}
        </div>
      </div>

      {attestations && (attestations as Attestation[]).length > 0 && (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4">
            Attestations Received ({(attestations as Attestation[]).length})
          </h3>
          <div className="space-y-3">
            {(attestations as Attestation[]).map((att, idx) => (
              <div key={idx} className="p-4 border border-slate-200 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-mono text-slate-600">
                    {att.fromAddress.slice(0, 6)}...{att.fromAddress.slice(-4)}
                  </span>
                  <span className="text-xs text-slate-500">{formatTimestamp(att.timestamp)}</span>
                </div>
                <p className="text-sm text-slate-700">{att.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!attestations || (attestations as Attestation[]).length === 0) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center">
          <Users className="w-12 h-12 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600">No attestations received yet</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Identity Registry</h1>
          <p className="text-slate-600">Verify your identity to participate in governance</p>
        </div>

        {isRegistered && typedIdentity && (
          <div className="bg-indigo-50 border-2 border-indigo-400 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-indigo-600" />
              <div>
                <p className="font-semibold text-indigo-900">Identity Verified</p>
                <p className="text-sm text-indigo-700">
                  Registered since {formatTimestamp(typedIdentity.registeredAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="flex gap-2 bg-white rounded-xl p-2 shadow-md">
            {[
              { id: "overview", label: "Overview" },
              { id: "register", label: "Register" },
              { id: "attest", label: "Attestations" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {activeTab === "overview" && <Overview />}
          {activeTab === "register" && <RegisterTab />}
          {activeTab === "attest" && <AttestTab />}
        </div>
      </div>
    </div>
  );
}