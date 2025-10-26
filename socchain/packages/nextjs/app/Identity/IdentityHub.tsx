"use client";

import React, { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import identityAbiJson from "../../contracts/abis/IdentityRegistry.json";
import {
  AlertCircle,
  Award,
  CheckCircle,
  Coins,
  Loader2,
  Plus,
  Shield,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

const IDENTITY_REGISTRY_ADDRESS = "0x59d37399B778729d4B52aBf68Ee5D3deA62De277";
const identityAbi = identityAbiJson.abi;

export default function IdentityHub() {
  const { address: connectedAddress } = useAccount();
  const [activeTab, setActiveTab] = useState("overview");
  const [stakeAmount, setStakeAmount] = useState("0.01");
  const [attesteeAddress, setAttesteeAddress] = useState("");
  const [attestationEvidence, setAttestationEvidence] = useState("");

  // Fetch user identity
  const { data: identityData, isLoading: loadingIdentity } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityAbi,
    functionName: "getIdentity",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });

  // Fetch eligibility statuses
  const { data: isEligibleVoter } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityAbi,
    functionName: "isEligibleVoter",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });

  const { data: isEligibleCandidate } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityAbi,
    functionName: "isEligibleCandidate",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });

  const { data: isEligibleJuror } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityAbi,
    functionName: "isEligibleJuror",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });

  // Fetch attestations
  const { data: attestations } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityAbi,
    functionName: "getAttestations",
    args: [connectedAddress],
    query: { enabled: !!connectedAddress },
  });

  // Write functions
  const { writeContract: writeStake, data: stakeHash } = useWriteContract();
  const { writeContract: writeAttestation, data: attestHash } =
    useWriteContract();

  const { isPending: isStaking } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });
  const { isPending: isAttesting, isSuccess: attestSuccess } =
    useWaitForTransactionReceipt({ hash: attestHash });

  const isRegistered =
    identityData && identityData[0] !== "0x0000000000000000000000000000000000000000";

  const handleIncreaseStake = async () => {
    if (!stakeAmount) return;
    writeStake({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: identityAbi,
      functionName: "increaseStake",
      args: [[]],
      value: BigInt(Math.floor(parseFloat(stakeAmount) * 1e18)),
    });
  };

  const handleCreateAttestation = async () => {
    if (!attesteeAddress || !attestationEvidence) return;
    writeAttestation({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: identityAbi,
      functionName: "createAttestation",
      args: [attesteeAddress as `0x${string}`, attestationEvidence],
    });
  };

  const formatTimestamp = (timestamp: bigint | undefined): string => {
    if (!timestamp || Number(timestamp) === 0) return "—";
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString();
  };

  const formatEth = (wei: bigint | undefined): string => {
    if (!wei) return "0.0000";
    return (Number(wei) / 1e18).toFixed(4);
  };

  const safeNumber = (
    value: bigint | undefined | number,
    fallback = 0
  ): number => {
    return value ? Number(value) : fallback;
  };

  const RegistrationForm = () => (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">
            Register Your Identity
          </h2>
          <p className="text-slate-600">Connect your wallet and stake to join</p>
        </div>

        <div className="space-y-6">
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">Gitcoin Passport Integration Required</p>
                <p>
                  Full registration requires Gitcoin Passport score verification. For demo purposes, use the admin
                  whitelist function or contact an admin.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Requirements</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Minimum 0.01 ETH stake
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Gitcoin Passport score ≥ 20
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                Valid wallet connection
              </li>
            </ul>
          </div>

          {!connectedAddress && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
              <p className="text-yellow-800 font-medium">
                Please connect your wallet to continue
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const ProfileOverview = () => {
    if (!identityData) return null;

    const passportScore = safeNumber(identityData[3]);
    const stakeAmountEth = formatEth(identityData[6]);
    const participationCount = safeNumber(identityData[5]);
    const attestationCount = attestations?.length || 0;
    const registeredAt = formatTimestamp(identityData[1]);
    const lastActivity = formatTimestamp(identityData[2]);
    const isWhitelisted = identityData[7] || false;

    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                Score
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-800">{passportScore}</div>
            <div className="text-xs text-slate-600">Passport Score</div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
                Active
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-800">{stakeAmountEth} ETH</div>
            <div className="text-xs text-slate-600">Staked Amount</div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{participationCount}</div>
            <div className="text-xs text-slate-600">Participations</div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-2">
              <Award className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{attestationCount}</div>
            <div className="text-xs text-slate-600">Attestations</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Eligibility Status</h3>
          <div className="space-y-3">
            {[
              { label: "Voter Eligible", value: isEligibleVoter, link: "/nominations" },
              { label: "Candidate Eligible", value: isEligibleCandidate, link: "/nominations" },
              { label: "Juror Eligible", value: isEligibleJuror },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-slate-700">{item.label}</span>
                {item.value ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Eligible</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <AlertCircle className="w-5 h-5" />
                    <span className="font-medium">Not Eligible</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-2">Registration Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Registered At:</span>
              <span className="font-medium">{registeredAt}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Last Activity:</span>
              <span className="font-medium">{lastActivity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Whitelisted:</span>
              <span
                className={`font-medium ${
                  isWhitelisted ? "text-green-600" : "text-slate-500"
                }`}
              >
                {isWhitelisted ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const StakeManagement = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-6">Manage Your Stake</h3>
        {identityData && (
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-600 mb-1">Current Stake</div>
                <div className="text-3xl font-bold text-slate-800">
                  {formatEth(identityData[6])} ETH
                </div>
              </div>
              <Coins className="w-12 h-12 text-amber-500" />
            </div>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl p-4">
          <h4 className="font-medium text-slate-800 mb-3">Increase Stake</h4>
          <input
            type="number"
            placeholder="0.00"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3 text-sm"
            step="0.01"
            min="0.01"
          />
          <button
            onClick={handleIncreaseStake}
            disabled={isStaking || !stakeAmount}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium py-2 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {isStaking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add Stake
          </button>
        </div>

        <div className="mt-4 p-4 bg-amber-50 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Increasing your stake improves eligibility and shows commitment to the community.
          </p>
        </div>
      </div>
    </div>
  );

  const AttestationsView = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Create Attestation</h3>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Member Address (0x...)"
            value={attesteeAddress}
            onChange={(e) => setAttesteeAddress(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg"
          />
          <textarea
            placeholder="Evidence or reason for attestation..."
            value={attestationEvidence}
            onChange={(e) => setAttestationEvidence(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg h-24"
          />
          <button
            onClick={handleCreateAttestation}
            disabled={isAttesting || !attesteeAddress || !attestationEvidence}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            {isAttesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create Attestation
          </button>
          {attestSuccess && (
            <div className="p-3 bg-green-100 rounded text-green-700 text-sm">
              Attestation created successfully!
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">
          Attestations Received ({attestations?.length || 0})
        </h3>
        <div className="space-y-3">
          {attestations && attestations.length > 0 ? (
            attestations.map((att: any, idx: number) => (
              <div key={idx} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-mono text-slate-600">
                      {att[0]?.slice(0, 6)}...{att[0]?.slice(-4)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatTimestamp(att[2])}
                  </span>
                </div>
                <p className="text-sm text-slate-700">{att[3]}</p>
                {att[4] && (
                  <span className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                    Active
                  </span>
                )}
              </div>
            ))
          ) : (
            <p className="text-slate-500 text-center py-4">
              No attestations received yet
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (loadingIdentity) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12">
        <div className="container mx-auto px-4">
          <RegistrationForm />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Identity Hub</h1>
          <p className="text-slate-600">Manage your profile, stake, and attestations</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-800">
                {connectedAddress?.slice(0, 6)}...{connectedAddress?.slice(-4)}
              </h2>
              <p className="text-sm text-slate-600">
                Registered since {formatTimestamp(identityData[1])}
              </p>
            </div>
            <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-700">Verified</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 bg-white rounded-xl p-2 shadow-md">
            {[
              { id: "overview", label: "Overview" },
              { id: "stake", label: "Stake Management" },
              { id: "attestations", label: "Attestations" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {activeTab === "overview" && <ProfileOverview />}
          {activeTab === "stake" && <StakeManagement />}
          {activeTab === "attestations" && <AttestationsView />}
        </div>
      </div>
    </div>
  );
}