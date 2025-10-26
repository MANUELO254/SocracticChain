import React, { useState } from 'react';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { Shield, Lock, Eye, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { keccak256, toBytes } from 'viem';

// Consolidated: Jury Selection + Commit + Reveal + Results
const VettingPortal = () => {
  const { address } = useAccount();
  const [selectedSession, setSelectedSession] = useState('1');
  const [activePhase, setActivePhase] = useState('commit'); // commit, reveal, results
  const [commitData, setCommitData] = useState({});
  const [revealData, setRevealData] = useState({});

  // Contract reads
  const { data: sessionInfo } = useContractRead({
    address: process.env.NEXT_PUBLIC_VETTING_JURY,
    abi: vettingJuryAbi,
    functionName: 'getVettingSession',
    args: [BigInt(selectedSession)],
    watch: true
  });

  const { data: isJuror } = useContractRead({
    address: process.env.NEXT_PUBLIC_VETTING_JURY,
    abi: vettingJuryAbi,
    functionName: 'isJuror',
    args: [BigInt(selectedSession), address],
    watch: true
  });

  const { data: allReports } = useContractRead({
    address: process.env.NEXT_PUBLIC_VETTING_JURY,
    abi: vettingJuryAbi,
    functionName: 'getAllCandidateVettingInfo',
    args: [BigInt(selectedSession)],
    watch: true,
    enabled: sessionInfo?.[7] === 3 // Finalized
  });

  // Contract writes
  const { write: commitVote, data: commitTxData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_VETTING_JURY,
    abi: vettingJuryAbi,
    functionName: 'commitVote'
  });

  const { write: revealVote, data: revealTxData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_VETTING_JURY,
    abi: vettingJuryAbi,
    functionName: 'revealVote'
  });

  const { isLoading: isCommitting } = useWaitForTransaction({ hash: commitTxData?.hash });
  const { isLoading: isRevealing } = useWaitForTransaction({ hash: revealTxData?.hash });

  const handleCommit = (candidateId) => {
    const approve = commitData[candidateId]?.approve;
    const secret = commitData[candidateId]?.secret;
    
    if (!approve || !secret) return;

    // Generate commit hash: keccak256(approve, secret, msg.sender)
    const commitHash = keccak256(
      toBytes(`${approve}${secret}${address}`)
    );

    commitVote({
      args: [BigInt(selectedSession), BigInt(candidateId), commitHash]
    });
  };

  const handleReveal = (candidateId) => {
    const data = revealData[candidateId];
    if (!data) return;

    revealVote({
      args: [
        BigInt(selectedSession),
        BigInt(candidateId),
        data.approve === 'approve',
        data.evidenceIPFS || '',
        data.findings || '',
        data.secret || ''
      ]
    });
  };

  // Phase timing
  const now = Math.floor(Date.now() / 1000);
  const commitEnd = Number(sessionInfo?.[4] || 0);
  const revealEnd = Number(sessionInfo?.[5] || 0);
  
  const currentPhase = now < commitEnd ? 'commit' : now < revealEnd ? 'reveal' : 'results';

  // Mock candidates (replace with actual data)
  const mockCandidates = [
    { id: 1, address: '0x1234...5678', summary: 'Focus on economic reform' },
    { id: 2, address: '0x8765...4321', summary: 'Healthcare and education priorities' },
    { id: 3, address: '0xabcd...ef01', summary: 'Environmental sustainability' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Vetting Portal</h1>
              <p className="text-purple-200">Jury Investigation & Candidate Verification</p>
            </div>
            
            {isJuror && (
              <div className="bg-purple-500/20 rounded-lg px-6 py-3">
                <Shield className="w-8 h-8 text-purple-400 mx-auto mb-1" />
                <p className="text-white font-bold text-sm">Active Juror</p>
              </div>
            )}
          </div>
        </div>

        {/* Phase Progress */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Vetting Progress</h2>
            <span className="text-purple-200 text-sm">Session #{selectedSession}</span>
          </div>

          <div className="relative flex items-center justify-between">
            {/* Commit Phase */}
            <div className={`flex-1 text-center ${currentPhase === 'commit' ? 'z-10' : ''}`}>
              <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${
                currentPhase === 'commit' ? 'bg-purple-600 ring-4 ring-purple-400/50' : 
                ['reveal', 'results'].includes(currentPhase) ? 'bg-green-600' : 'bg-white/20'
              }`}>
                <Lock className="text-white" />
              </div>
              <p className={`font-semibold ${currentPhase === 'commit' ? 'text-white' : 'text-purple-300'}`}>
                Commit
              </p>
            </div>

            {/* Progress Line */}
            <div className="absolute top-6 left-0 right-0 h-1 bg-white/20 -z-10">
              <div className={`h-full bg-purple-600 transition-all duration-500 ${
                currentPhase === 'commit' ? 'w-0' :
                currentPhase === 'reveal' ? 'w-1/2' : 'w-full'
              }`} />
            </div>

            {/* Reveal Phase */}
            <div className={`flex-1 text-center ${currentPhase === 'reveal' ? 'z-10' : ''}`}>
              <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${
                currentPhase === 'reveal' ? 'bg-purple-600 ring-4 ring-purple-400/50' : 
                currentPhase === 'results' ? 'bg-green-600' : 'bg-white/20'
              }`}>
                <Eye className="text-white" />
              </div>
              <p className={`font-semibold ${currentPhase === 'reveal' ? 'text-white' : 'text-purple-300'}`}>
                Reveal
              </p>
            </div>

            {/* Results Phase */}
            <div className={`flex-1 text-center ${currentPhase === 'results' ? 'z-10' : ''}`}>
              <div className={`w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center ${
                currentPhase === 'results' ? 'bg-purple-600 ring-4 ring-purple-400/50' : 'bg-white/20'
              }`}>
                <FileText className="text-white" />
              </div>
              <p className={`font-semibold ${currentPhase === 'results' ? 'text-white' : 'text-purple-300'}`}>
                Results
              </p>
            </div>
          </div>
        </div>

        {/* Content Based on Phase */}
        {currentPhase === 'commit' && isJuror && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-3 mb-6 bg-purple-500/20 rounded-lg p-4">
              <AlertCircle className="text-purple-400 w-6 h-6" />
              <div>
                <p className="text-white font-semibold">Commit Phase Active</p>
                <p className="text-purple-200 text-sm">Submit encrypted votes for each candidate. Keep your secret safe!</p>
              </div>
            </div>

            <div className="space-y-4">
              {mockCandidates.map(candidate => (
                <div key={candidate.id} className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-white font-bold font-mono">{candidate.address}</p>
                      <p className="text-purple-200 text-sm mt-1">{candidate.summary}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-white text-sm font-semibold mb-2 block">Decision</label>
                      <select
                        value={commitData[candidate.id]?.approve || ''}
                        onChange={(e) => setCommitData({
                          ...commitData,
                          [candidate.id]: { ...commitData[candidate.id], approve: e.target.value }
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                      >
                        <option value="">Select...</option>
                        <option value="approve">✓ Approve</option>
                        <option value="reject">✗ Reject</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-white text-sm font-semibold mb-2 block">Secret Passphrase</label>
                      <input
                        type="password"
                        value={commitData[candidate.id]?.secret || ''}
                        onChange={(e) => setCommitData({
                          ...commitData,
                          [candidate.id]: { ...commitData[candidate.id], secret: e.target.value }
                        })}
                        placeholder="Keep this safe!"
                        className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => handleCommit(candidate.id)}
                        disabled={!commitData[candidate.id]?.approve || !commitData[candidate.id]?.secret || isCommitting}
                        className="w-full py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50"
                      >
                        {isCommitting ? 'Committing...' : 'Commit Vote'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentPhase === 'reveal' && isJuror && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center gap-3 mb-6 bg-purple-500/20 rounded-lg p-4">
              <Eye className="text-purple-400 w-6 h-6" />
              <div>
                <p className="text-white font-semibold">Reveal Phase Active</p>
                <p className="text-purple-200 text-sm">Reveal your votes with evidence and findings.</p>
              </div>
            </div>

            <div className="space-y-4">
              {mockCandidates.map(candidate => (
                <div key={candidate.id} className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <p className="text-white font-bold font-mono mb-4">{candidate.address}</p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-white text-sm font-semibold mb-2 block">Your Decision</label>
                      <select
                        value={revealData[candidate.id]?.approve || ''}
                        onChange={(e) => setRevealData({
                          ...revealData,
                          [candidate.id]: { ...revealData[candidate.id], approve: e.target.value }
                        })}
                        className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                      >
                        <option value="">Select...</option>
                        <option value="approve">✓ Approve</option>
                        <option value="reject">✗ Reject</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-white text-sm font-semibold mb-2 block">Evidence IPFS Link</label>
                      <input
                        type="text"
                        value={revealData[candidate.id]?.evidenceIPFS || ''}
                        onChange={(e) => setRevealData({
                          ...revealData,
                          [candidate.id]: { ...revealData[candidate.id], evidenceIPFS: e.target.value }
                        })}
                        placeholder="QmXXX... or ipfs://..."
                        className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-white text-sm font-semibold mb-2 block">Investigation Findings</label>
                      <textarea
                        value={revealData[candidate.id]?.findings || ''}
                        onChange={(e) => setRevealData({
                          ...revealData,
                          [candidate.id]: { ...revealData[candidate.id], findings: e.target.value }
                        })}
                        rows={3}
                        placeholder="Summarize your investigation..."
                        className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-white text-sm font-semibold mb-2 block">Secret Passphrase (same as commit)</label>
                      <input
                        type="password"
                        value={revealData[candidate.id]?.secret || ''}
                        onChange={(e) => setRevealData({
                          ...revealData,
                          [candidate.id]: { ...revealData[candidate.id], secret: e.target.value }
                        })}
                        placeholder="Enter your secret"
                        className="w-full px-3 py-2 rounded-lg bg-white/10 text-white border border-white/20 outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handleReveal(candidate.id)}
                      disabled={!revealData[candidate.id]?.approve || !revealData[candidate.id]?.secret || isRevealing}
                      className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50"
                    >
                      {isRevealing ? 'Revealing...' : 'Reveal Vote & Evidence'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentPhase === 'results' && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Vetting Results</h2>

            <div className="space-y-4">
              {allReports?.map((result, idx) => (
                <div key={idx} className={`rounded-lg p-6 border-2 ${
                  result.isApproved ? 'bg-green-500/10 border-green-500/50' : 'bg-red-500/10 border-red-500/50'
                }`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-white font-bold font-mono">Candidate #{result.candidateId?.toString()}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-green-400 text-sm">
                          ✓ {result.approvalCount?.toString()} Approvals
                        </span>
                        <span className="text-red-400 text-sm">
                          ✗ {result.rejectionCount?.toString()} Rejections
                        </span>
                      </div>
                    </div>
                    
                    <div className={`px-6 py-3 rounded-lg font-bold ${
                      result.isApproved ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                      {result.isApproved ? 'APPROVED' : 'REJECTED'}
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4">
                    <p className="text-white font-semibold mb-2">Approval Rate</p>
                    <div className="relative h-8 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className={`absolute top-0 left-0 h-full ${result.isApproved ? 'bg-green-600' : 'bg-red-600'}`}
                        style={{ width: `${(Number(result.approvalCount) / Number(result.totalReveals)) * 100}%` }}
                      />
                      <p className="absolute inset-0 flex items-center justify-center text-white font-bold">
                        {Math.round((Number(result.approvalCount) / Number(result.totalReveals)) * 100)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isJuror && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <Shield className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Not Selected as Juror</h3>
            <p className="text-purple-200 max-w-md mx-auto">
              You are not part of the vetting jury for this session. 
              Build your reputation through participation to increase selection chances.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Mock ABIs
const vettingJuryAbi = [
  {
    name: 'commitVote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_sessionId', type: 'uint256' },
      { name: '_candidateId', type: 'uint256' },
      { name: '_commitHash', type: 'bytes32' }
    ],
    outputs: []
  },
  {
    name: 'revealVote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_sessionId', type: 'uint256' },
      { name: '_candidateId', type: 'uint256' },
      { name: '_approve', type: 'bool' },
      { name: '_evidenceIPFS', type: 'string' },
      { name: '_findingsSummary', type: 'string' },
      { name: '_secret', type: 'string' }
    ],
    outputs: []
  },
  {
    name: 'getVettingSession',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_sessionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple' }]
  },
  {
    name: 'isJuror',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_sessionId', type: 'uint256' },
      { name: '_address', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'getAllCandidateVettingInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_sessionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple[]' }]
  }
];

export default VettingPortal;