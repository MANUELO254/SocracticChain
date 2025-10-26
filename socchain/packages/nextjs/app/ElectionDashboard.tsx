import React, { useState } from 'react';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { TrendingUp, Clock, CheckSquare, Users, Trophy, Filter } from 'lucide-react';

// Consolidated: Nomination Voting + Leaderboard + Election Explorer
const ElectionDashboard = () => {
  const { address } = useAccount();
  const [selectedElection, setSelectedElection] = useState('1');
  const [selectedCandidates, setSelectedCandidates] = useState([]);
  const [filterPhase, setFilterPhase] = useState('all'); // all, active, upcoming, completed

  // Contract reads
  const { data: election } = useContractRead({
    address: process.env.NEXT_PUBLIC_NOMINATION_VOTING,
    abi: nominationVotingAbi,
    functionName: 'getElection',
    args: [BigInt(selectedElection)],
    watch: true
  });

  const { data: hasVoted } = useContractRead({
    address: process.env.NEXT_PUBLIC_NOMINATION_VOTING,
    abi: nominationVotingAbi,
    functionName: 'hasVoted',
    args: [BigInt(selectedElection), address],
    watch: true
  });

  const { data: leaderboard } = useContractRead({
    address: process.env.NEXT_PUBLIC_NOMINATION_VOTING,
    abi: nominationVotingAbi,
    functionName: 'getTopNLeaderboard',
    args: [BigInt(selectedElection), BigInt(10)],
    watch: true
  });

  const { data: isEligibleVoter } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'isEligibleVoter',
    args: [address]
  });

  // Contract write
  const { write: nominate, data: nominateData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_NOMINATION_VOTING,
    abi: nominationVotingAbi,
    functionName: 'nominate'
  });

  const { isLoading: isNominating } = useWaitForTransaction({ hash: nominateData?.hash });

  const toggleCandidate = (candidateId) => {
    setSelectedCandidates(prev => 
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : prev.length < 10
        ? [...prev, candidateId]
        : prev
    );
  };

  const handleNominate = () => {
    if (selectedCandidates.length === 0) return;
    
    nominate({
      args: [BigInt(selectedElection), selectedCandidates.map(id => BigInt(id))]
    });
  };

  // Calculate time remaining
  const now = Math.floor(Date.now() / 1000);
  const votingStart = Number(election?.[1] || 0);
  const votingEnd = Number(election?.[2] || 0);
  const isActive = now >= votingStart && now < votingEnd;
  const timeRemaining = isActive ? votingEnd - now : 0;

  const formatTimeRemaining = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  // Mock election data (replace with actual contract calls)
  const mockElections = [
    { id: '1', title: 'General Election 2025', phase: 'Nominations', voters: 234, candidates: 45 },
    { id: '2', title: 'Special Council Election', phase: 'Vetting', voters: 156, candidates: 12 },
    { id: '3', title: 'Emergency Vote', phase: 'Voting', voters: 445, candidates: 8 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Election Dashboard</h1>
              <p className="text-orange-200">Community Nominations & Live Results</p>
            </div>
            
            {isActive && (
              <div className="bg-orange-500/20 rounded-lg p-4 text-center">
                <Clock className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                <p className="text-white font-bold text-xl">{formatTimeRemaining(timeRemaining)}</p>
                <p className="text-orange-200 text-sm">Remaining</p>
              </div>
            )}
          </div>

          {/* Phase Indicator */}
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 bg-orange-500 text-white font-bold rounded-full text-sm">
              Phase 1: Community Nominations
            </span>
            <span className="text-orange-200 text-sm">
              {election?.[6]?.toString() || 0} voters participated
            </span>
          </div>
        </div>

        {/* Election Filter */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Active Elections</h2>
            <div className="flex gap-2">
              {['all', 'active', 'upcoming', 'completed'].map(phase => (
                <button
                  key={phase}
                  onClick={() => setFilterPhase(phase)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    filterPhase === phase
                      ? 'bg-orange-600 text-white'
                      : 'bg-white/10 text-orange-200 hover:bg-white/20'
                  }`}
                >
                  {phase.charAt(0).toUpperCase() + phase.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mockElections.map(elec => (
              <button
                key={elec.id}
                onClick={() => setSelectedElection(elec.id)}
                className={`p-4 rounded-lg text-left transition-all ${
                  selectedElection === elec.id
                    ? 'bg-orange-600 border-2 border-orange-400'
                    : 'bg-white/10 border-2 border-white/20 hover:bg-white/20'
                }`}
              >
                <h3 className="text-white font-bold mb-2">{elec.title}</h3>
                <div className="flex items-center gap-4 text-sm text-orange-200">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {elec.voters}
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    {elec.candidates}
                  </span>
                </div>
                <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-semibold ${
                  elec.phase === 'Nominations' ? 'bg-orange-500/30 text-orange-200' :
                  elec.phase === 'Vetting' ? 'bg-purple-500/30 text-purple-200' :
                  'bg-green-500/30 text-green-200'
                }`}>
                  {elec.phase}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Candidate Grid */}
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Candidates</h2>
              <div className="text-right">
                <p className="text-white font-bold">{selectedCandidates.length}/10</p>
                <p className="text-orange-200 text-sm">Selected</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2">
              {leaderboard?.map((candidate, idx) => (
                <div
                  key={idx}
                  onClick={() => !hasVoted && toggleCandidate(candidate.candidateId)}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedCandidates.includes(candidate.candidateId)
                      ? 'bg-orange-600/30 border-orange-400'
                      : 'bg-white/5 border-white/20 hover:bg-white/10'
                  } ${hasVoted ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {/* Checkbox */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                      selectedCandidates.includes(candidate.candidateId)
                        ? 'bg-orange-600 border-orange-400'
                        : 'border-white/30'
                    }`}>
                      {selectedCandidates.includes(candidate.candidateId) && (
                        <CheckSquare className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-bold font-mono text-sm">
                        {candidate.candidateAddress?.slice(0, 6)}...{candidate.candidateAddress?.slice(-4)}
                      </p>
                      <p className="text-orange-300 text-xs">
                        {candidate.nominationCount?.toString() || 0} nominations
                      </p>
                    </div>
                  </div>

                  {/* Platform Summary */}
                  <p className="text-orange-100 text-sm mb-3 line-clamp-3">
                    {candidate.platformSummary || 'No platform summary provided'}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {['Economy', 'Security'].map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-white/20 rounded text-white text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Live Leaderboard */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="text-yellow-400" />
                <h2 className="text-xl font-bold text-white">Top 10 Leaders</h2>
              </div>

              <div className="space-y-2">
                {leaderboard?.slice(0, 10).map((candidate, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      idx === 0 ? 'bg-yellow-500 text-white' :
                      idx === 1 ? 'bg-gray-400 text-white' :
                      idx === 2 ? 'bg-orange-600 text-white' :
                      'bg-white/10 text-orange-200'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-white text-sm font-mono">
                        {candidate.candidateAddress?.slice(0, 8)}...
                      </p>
                      <p className="text-orange-300 text-xs">
                        {candidate.nominationCount?.toString() || 0} votes
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Voting Status */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h3 className="text-white font-bold mb-4">Your Status</h3>

              {hasVoted ? (
                <div className="bg-green-500/20 rounded-lg p-4 text-center">
                  <CheckSquare className="w-12 h-12 text-green-400 mx-auto mb-2" />
                  <p className="text-white font-semibold">Vote Submitted!</p>
                  <p className="text-green-200 text-sm mt-1">Thank you for participating</p>
                </div>
              ) : isEligibleVoter ? (
                <div>
                  <div className="bg-orange-500/20 rounded-lg p-4 mb-4">
                    <p className="text-white text-sm">
                      Select up to 10 candidates and submit your nominations.
                    </p>
                  </div>

                  <button
                    onClick={handleNominate}
                    disabled={selectedCandidates.length === 0 || isNominating}
                    className="w-full py-3 bg-gradient-to-r from-orange-600 to-yellow-600 text-white font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isNominating ? 'Submitting...' : `Submit ${selectedCandidates.length} Nominations`}
                  </button>
                </div>
              ) : (
                <div className="bg-red-500/20 rounded-lg p-4 text-center">
                  <p className="text-red-200 text-sm">
                    You are not eligible to vote. Complete registration requirements.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Mock ABIs
const nominationVotingAbi = [
  {
    name: 'nominate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_electionId', type: 'uint256' },
      { name: '_candidateIds', type: 'uint256[]' }
    ],
    outputs: []
  },
  {
    name: 'getElection',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_electionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple' }]
  },
  {
    name: 'hasVoted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_electionId', type: 'uint256' },
      { name: '_voter', type: 'address' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'getTopNLeaderboard',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: '_electionId', type: 'uint256' },
      { name: '_limit', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'tuple[]' }]
  }
];

const identityRegistryAbi = [
  {
    name: 'isEligibleVoter',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_voter', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  }
];

export default ElectionDashboard;