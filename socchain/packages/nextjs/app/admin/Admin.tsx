"use client";

import React, { useState, useEffect } from "react";
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
  Loader2,
  Play,
  Shield,
  Users,
  Vote,
  XCircle,
} from "lucide-react";
import { parseEther } from "viem";

// Contract Addresses
const IDENTITY_ADDRESS = "0x59d37399B778729d4B52aBf68Ee5D3deA62De277";
const NOMINATION_ADDRESS = "0x2519A217755e7E31d4FDC6075079Ae15769ffE8a";
const CANDIDACY_ADDRESS = "0x18dE7B71bb81B8140cD44B36aF0A669cc4e0F2Ca";
const VETTING_ADDRESS = "0xf67260ed2Bf33c9Dc819c247EF9dc61Cef55D834";
const LOTTERY_ADDRESS = "0xaeCF00cfa7479527ec47Aa3D68E11AE206C4bC98";

// ABIs
const NOMINATION_ABI = [
  {
    inputs: [
      { internalType: "uint96", name: "_nominationStart", type: "uint96" },
      { internalType: "uint96", name: "_nominationEnd", type: "uint96" },
      { internalType: "uint256", name: "_topN", type: "uint256" },
      { internalType: "uint256", name: "_minimumNominations", type: "uint256" },
      { internalType: "bool", name: "_autoFinalizationEnabled", type: "bool" },
    ],
    name: "createElection",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_electionId", type: "uint256" }],
    name: "finalizeNominations",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "electionCounter",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const VETTING_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "_electionId", type: "uint256" },
      { internalType: "uint256", name: "_jurySize", type: "uint256" },
      { internalType: "uint96", name: "_commitDuration", type: "uint96" },
      { internalType: "uint96", name: "_revealDuration", type: "uint96" },
      { internalType: "uint256", name: "_stakeAmount", type: "uint256" },
      { internalType: "bool", name: "_autoTransitionEnabled", type: "bool" },
    ],
    name: "createVettingSession",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_sessionId", type: "uint256" }],
    name: "requestJurySelection",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_sessionId", type: "uint256" }],
    name: "finalizeVetting",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "sessionCounter",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_sessionId", type: "uint256" }],
    name: "getVettingSession",
    outputs: [
      { internalType: "uint256", name: "electionId", type: "uint256" },
      { internalType: "uint256[]", name: "candidateIds", type: "uint256[]" },
      { internalType: "address[]", name: "jurors", type: "address[]" },
      { internalType: "uint96", name: "commitStart", type: "uint96" },
      { internalType: "uint96", name: "commitEnd", type: "uint96" },
      { internalType: "uint96", name: "revealEnd", type: "uint96" },
      { internalType: "bool", name: "isFinalized", type: "bool" },
      { internalType: "uint8", name: "currentPhase", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const LOTTERY_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "_vettingSessionId", type: "uint256" },
      { internalType: "uint96", name: "_votingStart", type: "uint96" },
      { internalType: "uint96", name: "_votingEnd", type: "uint96" },
      { internalType: "bool", name: "_autoDrawEnabled", type: "bool" },
    ],
    name: "createElection",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_electionId", type: "uint256" }],
    name: "requestWinnerDraw",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "s_electionCounter",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const IDENTITY_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_member", type: "address" },
      { internalType: "bool", name: "_status", type: "bool" },
    ],
    name: "setWhitelist",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalMembers",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "identities",
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
    inputs: [],
    name: "getAllMembers",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
];

const CANDIDACY_ABI = [
  {
    inputs: [{ internalType: "address", name: "_vettingContract", type: "address" }],
    name: "grantVettingRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "disqualifyCandidate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

interface MemberIdentity {
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

interface VettingSession {
  electionId: bigint;
  candidateIds: bigint[];
  jurors: string[];
  commitStart: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
  isFinalized: boolean;
  currentPhase: number;
}

const MemberRow = ({
  address: memberAddress,
  index,
  selectedJurors,
  onToggleWhitelist,
  isProcessing,
}: {
  address: string;
  index: number;
  selectedJurors: string[];
  onToggleWhitelist: (address: string, status: boolean) => void;
  isProcessing: boolean;
}) => {
  const { data: memberData } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "identities",
    args: [memberAddress as `0x${string}`],
    query: { refetchInterval: 3000 },
  });

  const typedData = memberData as MemberIdentity | undefined;
  const isWhitelisted = typedData?.isWhitelisted || false;
  const isSelectedJuror = selectedJurors.includes(memberAddress);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
        isSelectedJuror ? "bg-green-50 border-2 border-green-300" : "bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            isSelectedJuror ? "bg-green-100 text-green-600" : "bg-indigo-100 text-indigo-600"
          }`}
        >
          {index + 1}
        </span>
        <span className="font-mono text-sm text-slate-700">{memberAddress}</span>
      </div>
      <div className="flex items-center gap-2">
        {isSelectedJuror && (
          <span className="text-xs bg-green-600 text-white px-3 py-1 rounded-full font-bold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Selected Juror
          </span>
        )}
        {isWhitelisted ? (
          <>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">Whitelisted</span>
            <button
              onClick={() => onToggleWhitelist(memberAddress, false)}
              disabled={isProcessing}
              className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Remove whitelist status"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded">Not Whitelisted</span>
            <button
              onClick={() => onToggleWhitelist(memberAddress, true)}
              disabled={isProcessing}
              className="text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Grant whitelist status"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default function AdminDashboard() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState("overview");
  const [nomStart, setNomStart] = useState("");
  const [nomEnd, setNomEnd] = useState("");
  const [topN, setTopN] = useState("2");
  const [minNominations, setMinNominations] = useState("1");
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [finalizeElectionId, setFinalizeElectionId] = useState("1");
  const [vettingElectionId, setVettingElectionId] = useState("1");
  const [jurySize, setJurySize] = useState("5");
  const [commitDuration, setCommitDuration] = useState("259200");
  const [revealDuration, setRevealDuration] = useState("172800");
  const [stakeAmount, setStakeAmount] = useState("0.01");
  const [autoTransition, setAutoTransition] = useState(true);
  const [jurySessionId, setJurySessionId] = useState("1");
  const [finalizeVettingId, setFinalizeVettingId] = useState("1");
  const [lotteryVettingId, setLotteryVettingId] = useState("1");
  const [votingStart, setVotingStart] = useState("");
  const [votingEnd, setVotingEnd] = useState("");
  const [autoDraw, setAutoDraw] = useState(true);
  const [drawElectionId, setDrawElectionId] = useState("1");
  const [whitelistAddress, setWhitelistAddress] = useState("");
  const [disqualifyTokenId, setDisqualifyTokenId] = useState("");

  const { data: nomCounter } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: "electionCounter",
  });

  const { data: vettingCounter } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: "sessionCounter",
  });

  const { data: lotteryCounter } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: "s_electionCounter",
  });

  const { data: totalMembers } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "totalMembers",
  });

  const { data: allMembers } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "getAllMembers",
    query: { refetchInterval: 3000 },
  });

  const { data: memberCheck } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "identities",
    args: whitelistAddress ? [whitelistAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!whitelistAddress && whitelistAddress.length === 42 && whitelistAddress.startsWith("0x"),
    },
  });

  const typedMemberCheck = memberCheck as MemberIdentity | undefined;
  const isAlreadyMember = typedMemberCheck && typedMemberCheck.member !== "0x0000000000000000000000000000000000000000";
  const isAlreadyWhitelisted = typedMemberCheck && typedMemberCheck.isWhitelisted === true;

  const { writeContract: writeNomElection, isPending: isCreatingNom } = useWriteContract();
  const { writeContract: writeFinalizeNom, isPending: isFinalizingNom } = useWriteContract();
  const { writeContract: writeVettingSession, isPending: isCreatingVetting } = useWriteContract();
  const { writeContract: writeRequestJury, isPending: isRequestingJury } = useWriteContract();
  const { writeContract: writeFinalizeVetting, isPending: isFinalizingVetting } = useWriteContract();
  const { writeContract: writeLotteryElection, isPending: isCreatingLottery } = useWriteContract();
  const { writeContract: writeRequestDraw, isPending: isRequestingDraw } = useWriteContract();
  const { writeContract: writeSetWhitelist, isPending: isSettingStatus } = useWriteContract();
  const { writeContract: writeGrantVetting, isPending: isGranting } = useWriteContract();
  const { writeContract: writeDisqualify, isPending: isDisqualifying } = useWriteContract();

  const { isSuccess: nomSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: finalizeNomSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: vettingSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: jurySuccess } = useWaitForTransactionReceipt();
  const { isSuccess: finalizeVettingSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: lotterySuccess } = useWaitForTransactionReceipt();
  const { isSuccess: drawSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: statusSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: grantSuccess } = useWaitForTransactionReceipt();
  const { isSuccess: disqualifySuccess } = useWaitForTransactionReceipt();

  const handleCreateNomination = () => {
    if (!nomStart || !nomEnd) {
      alert("Please set both start and end timestamps");
      return;
    }
    writeNomElection({
      address: NOMINATION_ADDRESS,
      abi: NOMINATION_ABI,
      functionName: "createElection",
      args: [BigInt(nomStart), BigInt(nomEnd), BigInt(topN), BigInt(minNominations), autoFinalize],
    });
  };

  const handleFinalizeNomination = () => {
    writeFinalizeNom({
      address: NOMINATION_ADDRESS,
      abi: NOMINATION_ABI,
      functionName: "finalizeNominations",
      args: [BigInt(finalizeElectionId)],
    });
  };

  const handleCreateVetting = () => {
    const VRF_BUFFER = 300;
    const adjustedCommitDuration = BigInt(commitDuration) + BigInt(VRF_BUFFER);
    writeVettingSession({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: "createVettingSession",
      args: [BigInt(vettingElectionId), BigInt(jurySize), adjustedCommitDuration, BigInt(revealDuration), parseEther(stakeAmount), autoTransition],
    });
  };

  const handleRequestJury = () => {
    writeRequestJury({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: "requestJurySelection",
      args: [BigInt(jurySessionId)],
    });
  };

  const handleFinalizeVetting = () => {
    writeFinalizeVetting({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: "finalizeVetting",
      args: [BigInt(finalizeVettingId)],
    });
  };

  const handleCreateLottery = () => {
    if (!votingStart || !votingEnd) {
      alert("Please set voting timestamps");
      return;
    }
    writeLotteryElection({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: "createElection",
      args: [BigInt(lotteryVettingId), BigInt(votingStart), BigInt(votingEnd), autoDraw],
    });
  };

  const handleRequestDraw = () => {
    writeRequestDraw({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: "requestWinnerDraw",
      args: [BigInt(drawElectionId)],
    });
  };

  const [statusAction, setStatusAction] = useState<"whitelist" | "remove" | null>(null);

  useEffect(() => {
    if (statusSuccess) {
      const timer = setTimeout(() => setStatusAction(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusSuccess]);

  const handleSetWhitelist = (targetAddress: string, status: boolean) => {
    if (!targetAddress || targetAddress.length !== 42 || !targetAddress.startsWith("0x")) {
      alert("Invalid Ethereum address format");
      return;
    }
    const action = status ? "whitelist" : "remove";
    setStatusAction(action);
    writeSetWhitelist({
      address: IDENTITY_ADDRESS,
      abi: IDENTITY_ABI,
      functionName: "setWhitelist",
      args: [targetAddress as `0x${string}`, status],
    });
  };

  const handleWhitelist = () => {
    if (isAlreadyMember && isAlreadyWhitelisted) {
      alert(`⚠️ Address ${whitelistAddress} is already whitelisted!`);
      return;
    }
    if (isAlreadyMember && !isAlreadyWhitelisted) {
      alert(`ℹ️ This address is already a member. Proceeding will grant whitelist status.`);
    }
    handleSetWhitelist(whitelistAddress, true);
  };

  const handleGrantVettingRole = () => {
    writeGrantVetting({
      address: CANDIDACY_ADDRESS,
      abi: CANDIDACY_ABI,
      functionName: "grantVettingRole",
      args: [VETTING_ADDRESS],
    });
  };

  const handleDisqualify = () => {
    if (!disqualifyTokenId) return;
    writeDisqualify({
      address: CANDIDACY_ADDRESS,
      abi: CANDIDACY_ABI,
      functionName: "disqualifyCandidate",
      args: [BigInt(disqualifyTokenId)],
    });
  };

  const Overview = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md p-6">
          <Users className="w-5 h-5 text-blue-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{totalMembers?.toString() || "0"}</div>
          <div className="text-xs text-slate-600">Total Members</div>
        </div>
        <div className="bg-white rounded-xl shadow-md p-6">
          <Vote className="w-5 h-5 text-purple-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{nomCounter?.toString() || "0"}</div>
          <div className="text-xs text-slate-600">Nomination Elections</div>
        </div>
        <div className="bg-white rounded-xl shadow-md p-6">
          <Shield className="w-5 h-5 text-indigo-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{vettingCounter?.toString() || "0"}</div>
          <div className="text-xs text-slate-600">Vetting Sessions</div>
        </div>
        <div className="bg-white rounded-xl shadow-md p-6">
          <Award className="w-5 h-5 text-yellow-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">{lotteryCounter?.toString() || "0"}</div>
          <div className="text-xs text-slate-600">Lottery Elections</div>
        </div>
      </div>
    </div>
  );

  const NominationTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Create Nomination Election</h3>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Timestamp (Unix)</label>
            <input type="number" value={nomStart} onChange={(e) => setNomStart(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Timestamp (Unix)</label>
            <input type="number" value={nomEnd} onChange={(e) => setNomEnd(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
        </div>
        <button onClick={handleCreateNomination} disabled={isCreatingNom} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg">
          {isCreatingNom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Create Election
        </button>
      </div>
    </div>
  );

  const VettingTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Create Vetting Session</h3>
        <button onClick={handleCreateVetting} disabled={isCreatingVetting} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg">
          Create Session
        </button>
      </div>
    </div>
  );

  const LotteryTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Create Lottery Election</h3>
        <button onClick={handleCreateLottery} disabled={isCreatingLottery} className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg">
          Create Lottery
        </button>
      </div>
    </div>
  );

  const IdentityTab = () => {
    const [selectedSessionId, setSelectedSessionId] = useState("1");
    const { data: vettingSession } = useReadContract({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: "getVettingSession",
      args: [BigInt(selectedSessionId)],
      query: { enabled: !!selectedSessionId },
    });

    const typedSession = vettingSession as VettingSession | undefined;
    const selectedJurors = typedSession?.jurors || [];
    const PHASE_NAMES = ["Jury Selection", "Commit", "Reveal", "Finalized"];

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Registered Members ({(allMembers as string[] | undefined)?.length || 0})</h3>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {allMembers && (allMembers as string[]).length > 0 ? (
              (allMembers as string[]).map((member, idx) => (
                <MemberRow key={member} address={member} index={idx} selectedJurors={selectedJurors} onToggleWhitelist={handleSetWhitelist} isProcessing={isSettingStatus} />
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">No members registered yet</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!address) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-8">
              <AlertCircle className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Admin Access Required</h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-slate-800 mb-8">Admin Dashboard</h1>
        <div className="mb-6">
          <div className="flex gap-2 bg-white rounded-xl p-2 shadow-md">
            {[
              { id: "overview", label: "Overview" },
              { id: "nominations", label: "Nominations" },
              { id: "vetting", label: "Vetting" },
              { id: "lottery", label: "Lottery" },
              { id: "identity", label: "Identity" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium ${activeTab === tab.id ? "bg-indigo-600 text-white" : "text-slate-600"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          {activeTab === "overview" && <Overview />}
          {activeTab === "nominations" && <NominationTab />}
          {activeTab === "vetting" && <VettingTab />}
          {activeTab === "lottery" && <LotteryTab />}
          {activeTab === "identity" && <IdentityTab />}
        </div>
      </div>
    </div>
  );
}