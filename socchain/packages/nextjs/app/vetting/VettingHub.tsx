"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Shield, Users, Lock, Unlock, CheckCircle, AlertCircle, Clock, Eye, Hash, Loader2, FileText, XCircle } from 'lucide-react';
import { parseEther, keccak256, encodePacked, toHex } from 'viem';
import { generatePrivateKey } from 'viem/accounts'; // For random secret generation

const VETTING_ADDRESS = '0xf67260ed2Bf33c9Dc819c247EF9dc61Cef55D834';
const VETTING_ABI = [
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"}],"name": "getVettingSession","outputs": [{"internalType": "uint256","name": "electionId","type": "uint256"},{"internalType": "uint256[]","name": "candidateIds","type": "uint256[]"},{"internalType": "address[]","name": "jurors","type": "address[]"},{"internalType": "uint96","name": "commitStart","type": "uint96"},{"internalType": "uint96","name": "commitEnd","type": "uint96"},{"internalType": "uint96","name": "revealEnd","type": "uint96"},{"internalType": "bool","name": "isFinalized","type": "bool"},{"internalType": "enum VettingJury.SessionPhase","name": "currentPhase","type": "uint8"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "address","name": "_address","type": "address"}],"name": "isJuror","outputs": [{"internalType": "bool","name": "","type": "bool"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"}],"name": "stakeAsJuror","outputs": [],"stateMutability": "payable","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "uint256","name": "_candidateId","type": "uint256"},{"internalType": "bytes32","name": "_commitHash","type": "bytes32"}],"name": "commitVote","outputs": [],"stateMutability": "nonpayable","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "uint256","name": "_candidateId","type": "uint256"},{"internalType": "bool","name": "_approve","type": "bool"},{"internalType": "string","name": "_evidenceIPFS","type": "string"},{"internalType": "string","name": "_findingsSummary","type": "string"},{"internalType": "string","name": "_secret","type": "string"}],"name": "revealVote","outputs": [],"stateMutability": "nonpayable","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "uint256","name": "_candidateId","type": "uint256"}],"name": "getVettingResults","outputs": [{"internalType": "uint256","name": "approvals","type": "uint256"},{"internalType": "uint256","name": "rejections","type": "uint256"},{"internalType": "uint256","name": "totalReveals","type": "uint256"},{"internalType": "uint256","name": "approvalPercentage","type": "uint256"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "uint256","name": "_candidateId","type": "uint256"}],"name": "getAllJurorReports","outputs": [{"components": [{"internalType": "address","name": "juror","type": "address"},{"internalType": "bool","name": "approve","type": "bool"},{"internalType": "string","name": "evidenceIPFS","type": "string"},{"internalType": "string","name": "findingsSummary","type": "string"},{"internalType": "uint96","name": "revealedAt","type": "uint96"},{"internalType": "bool","name": "hasRevealed","type": "bool"}],"internalType": "struct VettingJury.JurorReport[]","name": "","type": "tuple[]"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "uint256","name": "_candidateId","type": "uint256"},{"internalType": "address","name": "_juror","type": "address"}],"name": "hasCommitted","outputs": [{"internalType": "bool","name": "","type": "bool"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_sessionId","type": "uint256"},{"internalType": "uint256","name": "_candidateId","type": "uint256"},{"internalType": "address","name": "_juror","type": "address"}],"name": "hasRevealed","outputs": [{"internalType": "bool","name": "","type": "bool"}],"stateMutability": "view","type": "function"}
];

const PHASE_NAMES = ['Jury Selection', 'Commit', 'Reveal', 'Finalized'];

export default function VettingHub() {
  const { address } = useAccount();
  const [sessionId, setSessionId] = useState(1);
  const [candidateId, setCandidateId] = useState(1);
  const [commitHash, setCommitHash] = useState('');
  const [approve, setApprove] = useState(true);
  const [evidenceIPFS, setEvidenceIPFS] = useState('');
  const [findingsSummary, setFindingsSummary] = useState('');
  const [secret, setSecret] = useState('');
  const [stakeAmount, setStakeAmount] = useState('0.01');
  const [isGenerating, setIsGenerating] = useState(false);

  const { connect, connectors, error: connectError, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const { data: sessionData } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: 'getVettingSession',
    args: [BigInt(sessionId)],
  });

  const { data: isJuror } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: 'isJuror',
    args: [BigInt(sessionId), address],
  });

  const { data: hasCommitted } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: 'hasCommitted',
    args: [BigInt(sessionId), BigInt(candidateId), address],
  });

  const { data: hasRevealed } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: 'hasRevealed',
    args: [BigInt(sessionId), BigInt(candidateId), address],
  });

  const { data: vettingResults } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: 'getVettingResults',
    args: [BigInt(sessionId), BigInt(candidateId)],
  });

  const { data: jurorReports } = useReadContract({
    address: VETTING_ADDRESS,
    abi: VETTING_ABI,
    functionName: 'getAllJurorReports',
    args: [BigInt(sessionId), BigInt(candidateId)],
  });

  const { writeContract: writeStake, data: stakeHash, isPending: isStaking } = useWriteContract();
  const { writeContract: writeCommit, data: commitTxHash, isPending: isCommitting } = useWriteContract();
  const { writeContract: writeReveal, data: revealHash, isPending: isRevealing } = useWriteContract();

  const { isSuccess: stakeSuccess } = useWaitForTransactionReceipt({ hash: stakeHash });
  const { isSuccess: commitSuccess } = useWaitForTransactionReceipt({ hash: commitTxHash });
  const { isSuccess: revealSuccess } = useWaitForTransactionReceipt({ hash: revealHash });

  const session = sessionData ? {
    electionId: Number(sessionData[0]),
    candidateIds: sessionData[1].map((id: bigint) => Number(id)),
    jurors: sessionData[2],
    commitStart: Number(sessionData[3]),
    commitEnd: Number(sessionData[4]),
    revealEnd: Number(sessionData[5]),
    isFinalized: sessionData[6],
    currentPhase: Number(sessionData[7]),
    phaseName: PHASE_NAMES[Number(sessionData[7])],
  } : null;

  // Local storage for commit data
  const getStorageKey = () => `vetting-commit-${sessionId}-${candidateId}-${address}`;
  const saveCommitData = (app: boolean, sec: string) => {
    if (!address) return;
    const data = { approve: app, secret: sec };
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  };
  const loadCommitData = () => {
    if (!address) return;
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
      const data = JSON.parse(stored);
      setApprove(data.approve);
      setSecret(data.secret);
    }
  };

  useEffect(() => {
    if (session?.currentPhase === 2 && !hasRevealed) {
      loadCommitData();
    }
  }, [session?.currentPhase, candidateId, address, hasRevealed]);

  const handleConnect = async (connector: any) => {
    try {
      await switchChain({ chainId: 11155420 });
      connect({ connector });
    } catch (e) {
      console.error('Connect failed:', e);
    }
  };

  const handleStake = () => {
    if (parseFloat(stakeAmount) < 0.001) {
      alert('Minimum stake is 0.001 ETH');
      return;
    }
    writeStake({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: 'stakeAsJuror',
      args: [BigInt(sessionId)],
      value: parseEther(stakeAmount),
    });
  };

  const generateAndCommit = async () => {
    if (!approve || !address) return;
    setIsGenerating(true);
    try {
      // Generate random secret (as hex string for simplicity)
      const privateKey = generatePrivateKey();
      const secretStr = toHex(privateKey.slice(1)); // Remove 0x and use as string

      // Compute hash: keccak256(abi.encodePacked(_approve, _secret, msg.sender))
      const packed = encodePacked(['bool', 'string', 'address'], [approve, secretStr, address as `0x${string}`]);
      const hash = keccak256(packed);

      setSecret(secretStr);
      setCommitHash(hash);
      saveCommitData(approve, secretStr);

      // Auto-submit if hash is set
      writeCommit({
        address: VETTING_ADDRESS,
        abi: VETTING_ABI,
        functionName: 'commitVote',
        args: [BigInt(sessionId), BigInt(candidateId), hash as `0x${string}`],
      });
    } catch (error) {
      console.error('Generation failed:', error);
      alert('Failed to generate commit. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCommit = () => {
    if (!commitHash.startsWith('0x') || commitHash.length !== 66) {
      alert('Invalid commit hash format. Use the "Generate & Commit" button instead.');
      return;
    }
    writeCommit({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: 'commitVote',
      args: [BigInt(sessionId), BigInt(candidateId), commitHash as `0x${string}`],
    });
  };

  const handleReveal = () => {
    if (!secret) {
      alert('No secret found. You must have committed first.');
      return;
    }
    writeReveal({
      address: VETTING_ADDRESS,
      abi: VETTING_ABI,
      functionName: 'revealVote',
      args: [BigInt(sessionId), BigInt(candidateId), approve, evidenceIPFS, findingsSummary, secret],
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 mb-4">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Vetting Hub</h1>
          <p className="text-slate-600">Jurors review and vote on nominated candidates</p>
        </div>

        {session && (
          <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-indigo-500 mb-8">
            <div className="flex items-start gap-6 mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Vetting Session #{sessionId}</h3>
                <p className="text-slate-600 mb-2">Election #{session.electionId}</p>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>Phase: {session.phaseName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{session.jurors.length} jurors selected</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-indigo-600">{session.candidateIds.length}</div>
                <div className="text-sm text-slate-600">Candidates</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-indigo-600">{session.jurors.length}</div>
                <div className="text-sm text-slate-600">Jurors</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-indigo-600">{session.phaseName}</div>
                <div className="text-sm text-slate-600">Current Phase</div>
              </div>
            </div>
          </div>
        )}

        {!address ? (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-xl text-center space-y-4 mb-8">
            <AlertCircle className="w-8 h-8 text-yellow-600 mx-auto" />
            <p className="text-yellow-800 font-medium">Connect your wallet to check if you're selected as a juror.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {connectors
                .filter((c) => c.ready)
                .map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => handleConnect(connector)}
                    disabled={connectPending}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-2 px-6 rounded-lg flex items-center justify-center gap-2"
                  >
                    {connectPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    Connect {connector.name}
                  </button>
                ))}
            </div>
            {connectError && <p className="text-red-600 text-sm">{connectError.message}</p>}
            {connectors.length === 0 && <p className="text-yellow-700 text-sm">No wallets detected—install MetaMask.</p>}
          </div>
        ) : !isJuror ? (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-xl mb-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-2">Not Selected as Juror</h3>
                <p className="text-amber-800 text-sm mb-3">
                  You are not a selected juror for this vetting session.
                </p>
                <div className="bg-amber-100 rounded-lg p-4 text-sm text-amber-900">
                  <p className="font-medium mb-2">📋 How Jury Selection Works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-800 ml-2">
                    <li>Admin creates vetting session</li>
                    <li><strong>Admin requests jury selection</strong> (triggers Chainlink VRF)</li>
                    <li>VRF randomly selects {session?.jurors.length || 5} jurors from eligible members</li>
                    <li>Selected jurors are notified and can stake to participate</li>
                  </ol>
                  <p className="mt-3 font-medium">
                    {session?.currentPhase === 0 ? (
                      <span className="text-amber-700">⏳ Jury selection has not been requested yet. Waiting for admin...</span>
                    ) : (
                      <span className="text-amber-700">✓ Jury has been selected. You were not chosen this time.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded mb-4">
              <CheckCircle className="w-5 h-5 inline mr-2 text-green-600" />
              <span className="text-green-800 font-medium">✓ You are a selected juror for this session!</span>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6 mb-8">
              <h3 className="font-semibold text-slate-800 mb-4">Stake Your Commitment</h3>
              <p className="text-slate-600 mb-4">
                As a selected juror, you must stake ETH to confirm your participation. Your stake will be returned after honest participation.
              </p>
              <div className="space-y-3">
                <input
                  type="number"
                  placeholder="0.01"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  step="0.001"
                  min="0.001"
                />
                <button
                  onClick={handleStake}
                  disabled={isStaking || parseFloat(stakeAmount) < 0.001}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  {isStaking ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Staking...</>
                  ) : (
                    <><Lock className="w-4 h-4" />Stake {stakeAmount} ETH</>
                  )}
                </button>
              </div>
              {stakeSuccess && (
                <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
                  ✓ Stake successful! You can now commit your votes during the commit phase.
                </div>
              )}
            </div>

            {session?.currentPhase === 1 && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Hash className="w-5 h-5 text-purple-600" />
                  Commit Your Vote (Phase 1: Private Decision)
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Candidate ID</label>
                    <select
                      value={candidateId}
                      onChange={(e) => setCandidateId(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      {session.candidateIds.map((id) => (
                        <option key={id} value={id}>Candidate #{id}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Your Private Decision (Locked & Hidden)</label>
                    <div className="space-y-2">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            value="true"
                            checked={approve}
                            onChange={(e) => setApprove(e.target.value === 'true')}
                            className="rounded"
                          />
                          <span className="text-green-600 font-medium">✅ Proceed (Approve)</span>
                        </label>
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            value="false"
                            checked={!approve}
                            onChange={(e) => setApprove(e.target.value === 'true')}
                            className="rounded"
                          />
                          <span className="text-red-600 font-medium">❌ Disqualify (Reject)</span>
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">This choice is private now. You'll confirm it in the reveal phase.</p>
                  </div>

                  <button
                    onClick={generateAndCommit}
                    disabled={isCommitting || hasCommitted || isGenerating}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                  >
                    {isGenerating || isCommitting ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />{isGenerating ? 'Generating...' : 'Committing...'}</>
                    ) : hasCommitted ? (
                      <><CheckCircle className="w-4 h-4" />Already Committed</>
                    ) : (
                      <><Lock className="w-4 h-4" />Generate Secret & Commit Vote</>
                    )}
                  </button>

                  {commitSuccess && (
                    <div className="p-3 bg-green-100 rounded text-green-700 text-sm">
                      ✓ Vote committed privately! Your secret is saved locally. Don't lose it—clearing browser data will require manual recovery.
                    </div>
                  )}
                </div>
              </div>
            )}

            {session?.currentPhase === 2 && (
              <div className="bg-white rounded-xl shadow-md p-6 mb-8">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-green-600" />
                  Reveal Your Vote (Phase 2: Share Findings)
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Candidate ID</label>
                    <select
                      value={candidateId}
                      onChange={(e) => setCandidateId(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    >
                      {session.candidateIds.map((id) => (
                        <option key={id} value={id}>Candidate #{id}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Your Decision (Auto-loaded from Commit)</label>
                    <div className="space-y-2">
                      <div className={`flex items-center gap-2 p-2 rounded-lg ${approve ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <span className={`text-lg ${approve ? 'text-green-600' : 'text-red-600'}`}>
                          {approve ? '✅ Proceed (Approve)' : '❌ Disqualify (Reject)'}
                        </span>
                        <p className="text-xs text-slate-500">This matches your private commitment. Change only if error.</p>
                      </div>
                      <button
                        onClick={() => setApprove(!approve)}
                        className="text-xs text-slate-500 hover:underline flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" />
                        Edit Decision
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Evidence (IPFS Link or Upload)</label>
                    <input
                      type="text"
                      placeholder="Paste IPFS hash (Qm...) or URL to evidence"
                      value={evidenceIPFS}
                      onChange={(e) => setEvidenceIPFS(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                    <p className="text-xs text-slate-500 mt-1">Optional: Share links to GitHub, docs, or screenshots (upload to IPFS first).</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Your Findings (Public Notes)</label>
                    <textarea
                      placeholder="Write your review: Why proceed or disqualify? E.g., 'Strong community contribs but needs more security knowledge.' Keep it concise (under 500 chars)."
                      value={findingsSummary}
                      onChange={(e) => setFindingsSummary(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg h-24 resize-none"
                      maxLength={500}
                    />
                    <p className="text-xs text-slate-500 mt-1">{findingsSummary.length}/500 characters</p>
                  </div>

                  <div className="text-xs text-slate-500 bg-slate-100 p-2 rounded">
                    <strong>Secret:</strong> {secret ? `${secret.slice(0, 10)}...${secret.slice(-10)} (Auto-loaded & Hidden)` : 'No secret found—commit first!'}
                  </div>

                  <button
                    onClick={handleReveal}
                    disabled={!evidenceIPFS || !findingsSummary || !secret || isRevealing || hasRevealed}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                  >
                    {isRevealing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Revealing...</>
                    ) : hasRevealed ? (
                      <><CheckCircle className="w-4 h-4" />Already Revealed</>
                    ) : (
                      <><Unlock className="w-4 h-4" />Reveal Vote & Share Findings</>
                    )}
                  </button>

                  {revealSuccess && (
                    <div className="p-3 bg-green-100 rounded text-green-700 text-sm">
                      ✓ Vote revealed & findings shared! Thank you for your review.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {vettingResults && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-8">
            <h3 className="font-semibold text-slate-800 mb-4">
              Vetting Results for Candidate #{candidateId}
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-green-600">{vettingResults[0].toString()}</div>
                <div className="text-sm text-slate-600">Approvals</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{vettingResults[1].toString()}</div>
                <div className="text-sm text-slate-600">Rejections</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-600">{vettingResults[2].toString()}</div>
                <div className="text-sm text-slate-600">Total Reveals</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-indigo-600">{vettingResults[3].toString()}%</div>
                <div className="text-sm text-slate-600">Approval Rate</div>
              </div>
            </div>
          </div>
        )}

        {jurorReports && jurorReports.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              Juror Reports for Candidate #{candidateId}
            </h3>
            <div className="space-y-4">
              {jurorReports.map((report: any, idx: number) => (
                <div key={idx} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-mono text-slate-600">
                      {report.juror.slice(0, 6)}...{report.juror.slice(-4)}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      report.hasRevealed 
                        ? report.approve 
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {report.hasRevealed ? (report.approve ? 'Approved' : 'Rejected') : 'Not Revealed'}
                    </span>
                  </div>
                  {report.hasRevealed && (
                    <>
                      <p className="text-sm text-slate-700 mb-2">{report.findingsSummary}</p>
                      {report.evidenceIPFS && (
                        <a
                          href={`https://ipfs.io/ipfs/${report.evidenceIPFS}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          View Evidence →
                        </a>
                      )}
                      <div className="text-xs text-slate-500 mt-1">
                        Revealed: {new Date(Number(report.revealedAt) * 1000).toLocaleString()}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}