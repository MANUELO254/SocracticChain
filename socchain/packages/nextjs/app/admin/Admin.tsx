"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  AlertCircle,
  Award,
  CheckCircle,
  Hash,
  Loader2,
  Play,
  Settings,
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
      {
        internalType: "uint96",
        name: "_nominationStart",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "_nominationEnd",
        type: "uint96",
      },
      {
        internalType: "uint256",
        name: "_topN",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_minimumNominations",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "_autoFinalizationEnabled",
        type: "bool",
      },
    ],
    name: "createElection",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
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
    name: "finalizeNominations",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "electionCounter",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const VETTING_ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_electionId",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "_jurySize",
        type: "uint256",
      },
      {
        internalType: "uint96",
        name: "_commitDuration",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "_revealDuration",
        type: "uint96",
      },
      {
        internalType: "uint256",
        name: "_stakeAmount",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "_autoTransitionEnabled",
        type: "bool",
      },
    ],
    name: "createVettingSession",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_sessionId",
        type: "uint256",
      },
    ],
    name: "requestJurySelection",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_sessionId",
        type: "uint256",
      },
    ],
    name: "finalizeVetting",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "sessionCounter",
    outputs: [
      {
        internalType: "uint256",
        name: "",
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
        name: "_sessionId",
        type: "uint256",
      },
    ],
    name: "getVettingSession",
    outputs: [
      {
        internalType: "uint256",
        name: "electionId",
        type: "uint256",
      },
      {
        internalType: "uint256[]",
        name: "candidateIds",
        type: "uint256[]",
      },
      {
        internalType: "address[]",
        name: "jurors",
        type: "address[]",
      },
      {
        internalType: "uint96",
        name: "commitStart",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "commitEnd",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "revealEnd",
        type: "uint96",
      },
      {
        internalType: "bool",
        name: "isFinalized",
        type: "bool",
      },
      {
        internalType: "uint8",
        name: "currentPhase",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const LOTTERY_ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_vettingSessionId",
        type: "uint256",
      },
      {
        internalType: "uint96",
        name: "_votingStart",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "_votingEnd",
        type: "uint96",
      },
      {
        internalType: "bool",
        name: "_autoDrawEnabled",
        type: "bool",
      },
    ],
    name: "createElection",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
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
    name: "requestWinnerDraw",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "s_electionCounter",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const IDENTITY_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_member",
        type: "address",
      },
      {
        internalType: "bool",
        name: "_status",
        type: "bool",
      },
    ],
    name: "setWhitelist",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalMembers",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "identities",
    outputs: [
      {
        internalType: "address",
        name: "member",
        type: "address",
      },
      {
        internalType: "uint96",
        name: "registeredAt",
        type: "uint96",
      },
      {
        internalType: "uint96",
        name: "lastActivityAt",
        type: "uint96",
      },
      {
        internalType: "uint64",
        name: "passportScore",
        type: "uint64",
      },
      {
        internalType: "uint96",
        name: "lastScoreUpdate",
        type: "uint96",
      },
      {
        internalType: "uint256",
        name: "participationCount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "stakeAmount",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "isWhitelisted",
        type: "bool",
      },
      {
        internalType: "bool",
        name: "isBanned",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getAllMembers",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const CANDIDACY_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_vettingContract",
        type: "address",
      },
    ],
    name: "grantVettingRole",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "_tokenId",
        type: "uint256",
      },
    ],
    name: "disqualifyCandidate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// Member Row Component with Real-time Whitelist Status
const MemberRow = ({
  address: memberAddress,
  index,
  selectedJurors,
  onToggleWhitelist,
  isProcessing,
}: any) => {
  const { data: memberData } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "identities",
    args: [memberAddress],
    query: { refetchInterval: 3000 },
  });

  const isWhitelisted = memberData?.[7] || false;
  const isSelectedJuror = selectedJurors.includes(memberAddress);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
        isSelectedJuror
          ? "bg-green-50 border-2 border-green-300"
          : "bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            isSelectedJuror
              ? "bg-green-100 text-green-600"
              : "bg-indigo-100 text-indigo-600"
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
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
              Whitelisted
            </span>
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
            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded">
              Not Whitelisted
            </span>
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

  // Nomination Election State
  const [nomStart, setNomStart] = useState("");
  const [nomEnd, setNomEnd] = useState("");
  const [topN, setTopN] = useState("2");
  const [minNominations, setMinNominations] = useState("1");
  const [autoFinalize, setAutoFinalize] = useState(true);
  const [finalizeElectionId, setFinalizeElectionId] = useState("1");

  // Vetting Session State
  const [vettingElectionId, setVettingElectionId] = useState("1");
  const [jurySize, setJurySize] = useState("5");
  const [commitDuration, setCommitDuration] = useState("259200");
  const [revealDuration, setRevealDuration] = useState("172800");
  const [stakeAmount, setStakeAmount] = useState("0.01");
  const [autoTransition, setAutoTransition] = useState(true);
  const [jurySessionId, setJurySessionId] = useState("1");
  const [finalizeVettingId, setFinalizeVettingId] = useState("1");

  // Lottery State
  const [lotteryVettingId, setLotteryVettingId] = useState("1");
  const [votingStart, setVotingStart] = useState("");
  const [votingEnd, setVotingEnd] = useState("");
  const [autoDraw, setAutoDraw] = useState(true);
  const [drawElectionId, setDrawElectionId] = useState("1");

  // Whitelist State
  const [whitelistAddress, setWhitelistAddress] = useState("");
  const [disqualifyTokenId, setDisqualifyTokenId] = useState("");

  // Read counters with auto-refresh
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

  // Get all members with auto-refresh
  const { data: allMembers } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "getAllMembers",
    query: { refetchInterval: 3000 },
  });

  // Check whitelist status for new address input
  const { data: memberCheck } = useReadContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "identities",
    args: whitelistAddress
      ? [whitelistAddress as `0x${string}`]
      : undefined,
    query: {
      enabled:
        !!whitelistAddress &&
        whitelistAddress.length === 42 &&
        whitelistAddress.startsWith("0x"),
    },
  });

  const isAlreadyMember =
    memberCheck && memberCheck[0] !== "0x0000000000000000000000000000000000000000";
  const isAlreadyWhitelisted = memberCheck && memberCheck[7] === true;

  // Write contracts
  const { writeContract: writeNomElection, data: nomHash, isPending: isCreatingNom } =
    useWriteContract();
  const {
    writeContract: writeFinalizeNom,
    data: finalizeNomHash,
    isPending: isFinalizingNom,
  } = useWriteContract();
  const {
    writeContract: writeVettingSession,
    data: vettingHash,
    isPending: isCreatingVetting,
  } = useWriteContract();
  const {
    writeContract: writeRequestJury,
    data: juryHash,
    isPending: isRequestingJury,
  } = useWriteContract();
  const {
    writeContract: writeFinalizeVetting,
    data: finalizeVettingHash,
    isPending: isFinalizingVetting,
  } = useWriteContract();
  const {
    writeContract: writeLotteryElection,
    data: lotteryHash,
    isPending: isCreatingLottery,
  } = useWriteContract();
  const {
    writeContract: writeRequestDraw,
    data: drawHash,
    isPending: isRequestingDraw,
  } = useWriteContract();
  const {
    writeContract: writeSetWhitelist,
    data: setStatusHash,
    isPending: isSettingStatus,
  } = useWriteContract();
  const {
    writeContract: writeGrantVetting,
    data: grantHash,
    isPending: isGranting,
  } = useWriteContract();
  const {
    writeContract: writeDisqualify,
    data: disqualifyHash,
    isPending: isDisqualifying,
  } = useWriteContract();

  // Transaction receipts
  const { isSuccess: nomSuccess } = useWaitForTransactionReceipt({
    hash: nomHash,
  });
  const { isSuccess: finalizeNomSuccess } = useWaitForTransactionReceipt({
    hash: finalizeNomHash,
  });
  const { isSuccess: vettingSuccess } = useWaitForTransactionReceipt({
    hash: vettingHash,
  });
  const { isSuccess: jurySuccess } = useWaitForTransactionReceipt({
    hash: juryHash,
  });
  const { isSuccess: finalizeVettingSuccess } = useWaitForTransactionReceipt({
    hash: finalizeVettingHash,
  });
  const { isSuccess: lotterySuccess } = useWaitForTransactionReceipt({
    hash: lotteryHash,
  });
  const { isSuccess: drawSuccess } = useWaitForTransactionReceipt({
    hash: drawHash,
  });
  const { isSuccess: statusSuccess } = useWaitForTransactionReceipt({
    hash: setStatusHash,
  });
  const { isSuccess: grantSuccess } = useWaitForTransactionReceipt({
    hash: grantHash,
  });
  const { isSuccess: disqualifySuccess } = useWaitForTransactionReceipt({
    hash: disqualifyHash,
  });

  // Handlers
  const handleCreateNomination = () => {
    if (!nomStart || !nomEnd) {
      alert("Please set both start and end timestamps");
      return;
    }
    writeNomElection({
      address: NOMINATION_ADDRESS,
      abi: NOMINATION_ABI,
      functionName: "createElection",
      args: [
        BigInt(nomStart),
        BigInt(nomEnd),
        BigInt(topN),
        BigInt(minNominations),
        autoFinalize,
      ],
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
    // CRITICAL FIX: Add 5-minute buffer for VRF callback delay
    const VRF_BUFFER = 300; // 5 minutes in seconds
    const adjustedCommitDuration = BigInt(commitDuration) + BigInt(VRF_BUFFER);

    writeVettingSession({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: "createVettingSession",
      args: [
        BigInt(vettingElectionId),
        BigInt(jurySize),
        adjustedCommitDuration,
        BigInt(revealDuration),
        parseEther(stakeAmount),
        autoTransition,
      ],
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
    if (
      !targetAddress ||
      targetAddress.length !== 42 ||
      !targetAddress.startsWith("0x")
    ) {
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
      alert(
        `ℹ️ This address is already a member. Proceeding will grant whitelist status.`
      );
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

  // OVERVIEW TAB
  const Overview = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md p-6">
          <Users className="w-5 h-5 text-blue-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">
            {totalMembers?.toString() || "0"}
          </div>
          <div className="text-xs text-slate-600">Total Members</div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <Vote className="w-5 h-5 text-purple-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">
            {nomCounter?.toString() || "0"}
          </div>
          <div className="text-xs text-slate-600">Nomination Elections</div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <Shield className="w-5 h-5 text-indigo-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">
            {vettingCounter?.toString() || "0"}
          </div>
          <div className="text-xs text-slate-600">Vetting Sessions</div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <Award className="w-5 h-5 text-yellow-600 mb-2" />
          <div className="text-2xl font-bold text-slate-800">
            {lotteryCounter?.toString() || "0"}
          </div>
          <div className="text-xs text-slate-600">Lottery Elections</div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h3 className="text-xl font-bold mb-2">Election Workflow</h3>
        <p className="text-indigo-100 mb-4">Follow these steps in order:</p>
        <div className="space-y-3">
          {[
            { num: 1, title: "Create Nomination Election", desc: "Set timeframes for community nominations" },
            { num: 2, title: "Candidates Declare (Public)", desc: "Users mint candidacy NFTs via /nominations page" },
            { num: 3, title: "Community Votes (Public)", desc: "Members nominate their favorite candidates" },
            { num: 4, title: "Finalize Nominations", desc: "Lock in top N candidates after period ends" },
            { num: 5, title: "Create Vetting Session", desc: "Set up jury review (adds automatic 5min VRF buffer)" },
            { num: 6, title: "Request Jury Selection (VRF)", desc: "Randomly select jurors - DO THIS IMMEDIATELY!" },
            { num: 7, title: "Selected Jurors Stake (Public)", desc: "Only selected jurors can stake on /vetting page" },
            { num: 8, title: "Jurors Commit & Reveal", desc: "Commit & reveal votes on /vetting page" },
            { num: 9, title: "Finalize Vetting", desc: "Complete jury review, approve/reject candidates" },
            { num: 10, title: "Create Lottery Election", desc: "Set voting period for final winner" },
            { num: 11, title: "Community Votes (Public)", desc: "Members vote on /election page" },
            { num: 12, title: "Request Winner Draw (VRF)", desc: "Randomly select winner weighted by votes" },
          ].map((step) => (
            <div key={step.num} className="flex items-start gap-3 bg-white/10 rounded-lg p-3">
              <div className="w-8 h-8 bg-white text-indigo-600 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                {step.num}
              </div>
              <div>
                <div className="font-semibold">{step.title}</div>
                <div className="text-sm text-indigo-100">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-amber-900 mb-2">Important Notes</h4>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>• Next Election ID: <strong>{Number(nomCounter || 0) + 1}</strong></li>
              <li>• Next Vetting Session ID: <strong>{Number(vettingCounter || 0) + 1}</strong></li>
              <li>• Next Lottery ID: <strong>{Number(lotteryCounter || 0) + 1}</strong></li>
              <li>• Follow the workflow sequentially - cannot skip steps</li>
              <li>• 🔧 <strong>VRF Buffer:</strong> System automatically adds 5min to commit duration</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">VRF Consumer Setup</h4>
            <p className="text-sm text-blue-800 mb-2">
              Add these contracts to your Chainlink VRF subscription:
            </p>
            <ul className="text-sm text-blue-800 space-y-1 font-mono">
              <li>• VettingJury: <strong>{VETTING_ADDRESS}</strong></li>
              <li>• WeightedLottery: <strong>{LOTTERY_ADDRESS}</strong></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  // NOMINATION TAB
  const NominationTab = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>Current Status:</strong> {nomCounter?.toString() || "0"} elections created. 
            Next ID: <strong>{Number(nomCounter || 0) + 1}</strong>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Vote className="w-5 h-5 text-purple-600" />
          Create Nomination Election
        </h3>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Start Timestamp (Unix)
            </label>
            <input
              type="number"
              value={nomStart}
              onChange={(e) => setNomStart(e.target.value)}
              placeholder={Math.floor(Date.now() / 1000).toString()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <p className="text-xs text-slate-500 mt-1">Current: {Math.floor(Date.now() / 1000)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              End Timestamp (Unix)
            </label>
            <input
              type="number"
              value={nomEnd}
              onChange={(e) => setNomEnd(e.target.value)}
              placeholder={(Math.floor(Date.now() / 1000) + 604800).toString()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <p className="text-xs text-slate-500 mt-1">Suggested: +7 days</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Top N Candidates
            </label>
            <input
              type="number"
              value={topN}
              onChange={(e) => setTopN(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Minimum Nominations
            </label>
            <input
              type="number"
              value={minNominations}
              onChange={(e) => setMinNominations(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              min="1"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={autoFinalize}
            onChange={(e) => setAutoFinalize(e.target.checked)}
            id="auto-finalize"
          />
          <label htmlFor="auto-finalize" className="text-sm text-slate-700">
            Enable Auto-Finalization (Chainlink Automation)
          </label>
        </div>

        <button
          onClick={handleCreateNomination}
          disabled={isCreatingNom}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
        >
          {isCreatingNom ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Create Nomination Election
        </button>

        {nomSuccess && (
          <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
            ✓ Election created! ID: {Number(nomCounter) + 1}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Finalize Nomination Election</h3>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            <strong>⚠️ Requirements:</strong> Period must have ended with candidates having minimum nominations
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="number"
            placeholder="Election ID"
            value={finalizeElectionId}
            onChange={(e) => setFinalizeElectionId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            min="1"
          />
          <button
            onClick={handleFinalizeNomination}
            disabled={isFinalizingNom}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
          >
            {isFinalizingNom ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3" />
            )}
            Finalize Election #{finalizeElectionId}
          </button>
        </div>
        {finalizeNomSuccess && (
          <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
            ✓ Nomination finalized! Top candidates selected.
          </div>
        )}
      </div>
    </div>
  );

  // VETTING TAB
  const VettingTab = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>Prerequisites:</strong> Nomination must be finalized first. 
            Current sessions: <strong>{vettingCounter?.toString() || "0"}</strong>. 
            Next ID: <strong>{Number(vettingCounter || 0) + 1}</strong>
          </div>
        </div>
      </div>

      <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-800">
            <strong>✅ VRF Timing Fix Applied!</strong> System automatically adds 5-minute buffer to commit duration.
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          Create Vetting Session
        </h3>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Election ID</label>
            <input
              type="number"
              value={vettingElectionId}
              onChange={(e) => setVettingElectionId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Jury Size (odd number, min 5)
            </label>
            <select
              value={jurySize}
              onChange={(e) => setJurySize(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              {[5, 7, 9, 11, 13, 15].map((n) => (
                <option key={n} value={n}>
                  {n} Jurors
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Commit Duration (seconds)
            </label>
            <input
              type="number"
              value={commitDuration}
              onChange={(e) => setCommitDuration(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <p className="text-xs text-slate-500 mt-1">3 days = 259200s (auto +5min for VRF)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Reveal Duration (seconds)
            </label>
            <input
              type="number"
              value={revealDuration}
              onChange={(e) => setRevealDuration(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <p className="text-xs text-slate-500 mt-1">2 days = 172800s</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Juror Stake (ETH)</label>
            <input
              type="number"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              step="0.001"
              min="0.001"
            />
            <p className="text-xs text-slate-500 mt-1">Default: 0.01 ETH. Min: 0.001 ETH</p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={autoTransition}
              onChange={(e) => setAutoTransition(e.target.checked)}
              id="auto-transition"
              className="mr-2"
            />
            <label htmlFor="auto-transition" className="text-sm text-slate-700">
              Auto-Transition Phases
            </label>
          </div>
        </div>

        <button
          onClick={handleCreateVetting}
          disabled={isCreatingVetting}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
        >
          {isCreatingVetting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Create Vetting Session (with VRF buffer)
        </button>

        {vettingSuccess && (
          <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
            ✓ Vetting session created! ID: {Number(vettingCounter) + 1}. Request jury selection immediately!
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Session Management</h3>

        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-900 mb-2">
            <strong>🚨 CRITICAL: Request jury selection IMMEDIATELY after creating session!</strong>
          </p>
          <ol className="text-sm text-red-800 list-decimal list-inside space-y-1">
            <li>Create vetting session (system adds 5min buffer)</li>
            <li>
              <strong>IMMEDIATELY request jury selection</strong> - randomly picks jurors via VRF
            </li>
            <li>Wait 1-2 minutes for VRF completion</li>
            <li>Selected jurors stake on /vetting page</li>
            <li>Commit & reveal phases complete</li>
            <li>Finalize to approve/reject candidates</li>
          </ol>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Request Jury Selection (VRF)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Session ID"
                value={jurySessionId}
                onChange={(e) => setJurySessionId(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                min="1"
              />
              <button
                onClick={handleRequestJury}
                disabled={isRequestingJury}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                {isRequestingJury ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Hash className="w-3 h-3" />
                )}
                Request
              </button>
            </div>
            {jurySuccess && (
              <div className="mt-2 p-2 bg-green-100 rounded text-green-700 text-sm">
                ✓ Jury selection requested! Wait 1-2 minutes for VRF.
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Finalize Vetting Session
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Session ID"
                value={finalizeVettingId}
                onChange={(e) => setFinalizeVettingId(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                min="1"
              />
              <button
                onClick={handleFinalizeVetting}
                disabled={isFinalizingVetting}
                className="bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                {isFinalizingVetting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )}
                Finalize
              </button>
            </div>
            {finalizeVettingSuccess && (
              <div className="mt-2 p-2 bg-green-100 rounded text-green-700 text-sm">
                ✓ Vetting finalized!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // LOTTERY TAB
  const LotteryTab = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <strong>Prerequisites:</strong> Vetting must be finalized with approved candidates. 
            Current elections: <strong>{lotteryCounter?.toString() || "0"}</strong>. 
            Next ID: <strong>{Number(lotteryCounter || 0) + 1}</strong>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-600" />
          Create Lottery Election
        </h3>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Vetting Session ID
            </label>
            <input
              type="number"
              value={lotteryVettingId}
              onChange={(e) => setLotteryVettingId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Voting Start (Unix)
            </label>
            <input
              type="number"
              value={votingStart}
              onChange={(e) => setVotingStart(e.target.value)}
              placeholder={Math.floor(Date.now() / 1000).toString()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Voting End (Unix)
            </label>
            <input
              type="number"
              value={votingEnd}
              onChange={(e) => setVotingEnd(e.target.value)}
              placeholder={(Math.floor(Date.now() / 1000) + 259200).toString()}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <p className="text-xs text-slate-500 mt-1">Suggested: +3 days</p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={autoDraw}
              onChange={(e) => setAutoDraw(e.target.checked)}
              id="auto-draw"
              className="mr-2"
            />
            <label htmlFor="auto-draw" className="text-sm text-slate-700">
              Enable Auto-Draw (Chainlink Automation)
            </label>
          </div>
        </div>

        <button
          onClick={handleCreateLottery}
          disabled={isCreatingLottery}
          className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
        >
          {isCreatingLottery ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Create Lottery Election
        </button>

        {lotterySuccess && (
          <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
            ✓ Lottery created! ID: {Number(lotteryCounter) + 1}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Request Winner Draw</h3>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            <strong>⚠️ Requirements:</strong> Voting period ended with at least one vote cast
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="number"
            placeholder="Election ID"
            value={drawElectionId}
            onChange={(e) => setDrawElectionId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            min="1"
          />
          <button
            onClick={handleRequestDraw}
            disabled={isRequestingDraw}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
          >
            {isRequestingDraw ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Hash className="w-3 h-3" />
            )}
            Request Winner Draw (VRF)
          </button>
        </div>
        {drawSuccess && (
          <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
            ✓ Winner draw requested! Waiting for VRF...
          </div>
        )}
      </div>
    </div>
  );

  // IDENTITY TAB
  const IdentityTab = () => {
    const [selectedSessionId, setSelectedSessionId] = useState("1");

    const { data: vettingSession } = useReadContract({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: "getVettingSession",
      args: [BigInt(selectedSessionId)],
      query: { enabled: !!selectedSessionId },
    });

    const selectedJurors = vettingSession ? vettingSession[2] : [];
    const PHASE_NAMES = ["Jury Selection", "Commit", "Reveal", "Finalized"];

    return (
      <div className="space-y-6">
        {/* Jury Status */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 text-white">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Jury Selection Status
          </h3>

          <div className="flex items-center gap-3 mb-4">
            <label className="text-white font-medium">View Session:</label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="px-4 py-2 rounded-lg bg-white/20 text-white border-2 border-white/30 font-medium"
            >
              {vettingCounter &&
                Array.from({ length: Number(vettingCounter) }, (_, i) => i + 1).map(
                  (id) => (
                    <option key={id} value={id} className="text-slate-800">
                      Session #{id}
                    </option>
                  )
                )}
            </select>
          </div>

          {vettingSession && (
            <div className="space-y-3">
              <div className="bg-white/10 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-white/70 text-sm">Election ID</div>
                    <div className="text-2xl font-bold">#{vettingSession[0].toString()}</div>
                  </div>
                  <div>
                    <div className="text-white/70 text-sm">Current Phase</div>
                    <div className="text-2xl font-bold">
                      {PHASE_NAMES[vettingSession[7]]}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/70 text-sm">Candidates</div>
                    <div className="text-2xl font-bold">{vettingSession[1].length}</div>
                  </div>
                  <div>
                    <div className="text-white/70 text-sm">Selected Jurors</div>
                    <div className="text-2xl font-bold">{selectedJurors.length}</div>
                  </div>
                </div>
              </div>

              {selectedJurors.length > 0 ? (
                <div className="bg-white/10 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-lg">
                    ✓ Selected Jurors for Session #{selectedSessionId}
                  </h4>
                  <div className="space-y-2">
                    {selectedJurors.map((juror: string, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 bg-white/10 rounded-lg p-3"
                      >
                        <span className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span className="font-mono text-sm">{juror}</span>
                        <span className="ml-auto bg-green-400 text-green-900 px-2 py-1 rounded text-xs font-bold">
                          SELECTED
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-400/20 border-2 border-yellow-400 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-yellow-100">⚠️ No Jurors Selected Yet</div>
                      <div className="text-sm text-yellow-200 mt-1">
                        Click "Request Jury Selection" in Vetting tab to trigger VRF.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Member List */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Registered Members ({allMembers?.length || 0})
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Toggle whitelist status for each member. Whitelisted members are eligible for jury selection.
          </p>

          <div className="max-h-80 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-4">
            {allMembers && allMembers.length > 0 ? (
              allMembers.map((member: string, idx: number) => (
                <MemberRow
                  key={member}
                  address={member}
                  index={idx}
                  selectedJurors={selectedJurors}
                  onToggleWhitelist={handleSetWhitelist}
                  isProcessing={isSettingStatus}
                />
              ))
            ) : (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No members registered yet</p>
                <p className="text-slate-400 text-xs mt-1">Whitelist addresses below</p>
              </div>
            )}
          </div>

          {allMembers && allMembers.length > 0 && (
            <div className="mt-4 p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-indigo-800">
                <strong>✓ {allMembers.length}</strong> member
                {allMembers.length !== 1 ? "s" : ""} registered. 
                Use toggle buttons to manage whitelist status.
              </p>
            </div>
          )}

          {statusSuccess && (
            <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
              ✓ Whitelist status updated!
            </div>
          )}
        </div>

        {/* Whitelist Form */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Whitelist New Member
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Manually whitelist members who cannot pass Gitcoin Passport verification.
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Member Address (0x...)"
              value={whitelistAddress}
              onChange={(e) => setWhitelistAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
            />

            {whitelistAddress &&
              whitelistAddress.length === 42 &&
              whitelistAddress.startsWith("0x") && (
                <>
                  {isAlreadyMember && isAlreadyWhitelisted && (
                    <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                          <strong>❌ Already Whitelisted!</strong>
                          <p className="mt-1">This address already has whitelist status.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isAlreadyMember && !isAlreadyWhitelisted && (
                    <div className="p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-yellow-800">
                          <strong>ℹ️ Already a Member</strong>
                          <p className="mt-1">Will grant whitelist status to existing member.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isAlreadyMember && (
                    <div className="p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-green-800">
                          <strong>✓ Ready to Whitelist</strong>
                          <p className="mt-1">Will be added as new whitelisted member.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

            <button
              onClick={handleWhitelist}
              disabled={
                isSettingStatus ||
                !whitelistAddress ||
                (isAlreadyMember && isAlreadyWhitelisted)
              }
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {isSettingStatus ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {isAlreadyMember && isAlreadyWhitelisted
                ? "Already Whitelisted"
                : "Whitelist Member"}
            </button>
          </div>

          {statusSuccess && statusAction === "whitelist" && (
            <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
              ✓ Member whitelisted successfully!
            </div>
          )}
        </div>

        {/* Disqualify Candidate */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600" />
            Disqualify Candidate
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Disqualify a candidate by their NFT token ID
          </p>

          <div className="space-y-3">
            <input
              type="number"
              placeholder="Candidacy Token ID"
              value={disqualifyTokenId}
              onChange={(e) => setDisqualifyTokenId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              min="1"
            />
            <button
              onClick={handleDisqualify}
              disabled={isDisqualifying || !disqualifyTokenId}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {isDisqualifying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Disqualify Candidate
            </button>
          </div>
          {disqualifySuccess && (
            <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
              ✓ Candidate disqualified!
            </div>
          )}
        </div>

        {/* System Config */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            System Configuration
          </h3>

          <div className="space-y-3">
            <button
              onClick={handleGrantVettingRole}
              disabled={isGranting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {isGranting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              Grant Vetting Role to Jury Contract
            </button>

            {grantSuccess && (
              <div className="p-3 bg-green-100 rounded text-green-700 text-sm">
                ✓ Vetting role granted successfully!
              </div>
            )}

            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Important:</strong> This grants the Vetting Jury contract permission to disqualify candidates.
                Only run this once during initial setup.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Main Component Guard
  if (!address) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-8">
              <AlertCircle className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                Admin Access Required
              </h2>
              <p className="text-slate-600 mb-4">
                Please connect your wallet with admin privileges to access the control panel.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-800">Admin Dashboard</h1>
              <p className="text-slate-600">Manage elections, vetting, and system configuration</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Connected:</span>
            <span className="font-mono text-slate-700">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              Admin
            </span>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 bg-white rounded-xl p-2 shadow-md overflow-x-auto">
            {[
              { id: "overview", label: "Overview", icon: Settings },
              { id: "nominations", label: "Nominations", icon: Vote },
              { id: "vetting", label: "Vetting", icon: Shield },
              { id: "lottery", label: "Lottery", icon: Award },
              { id: "identity", label: "Identity & Config", icon: Users },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[140px] py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                    activeTab === tab.id
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
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