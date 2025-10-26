import React, { useState } from 'react';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { Star, TrendingUp, Sparkles, Trophy, Dice5 } from 'lucide-react';

// Consolidated: Weighted Lottery Voting + Distribution Visualization + Winner Reveal
const FinalElection = () => {
  const { address } = useAccount();
  const [selectedElection, setSelectedElection] = useState('1');
  const [selectedCandidates, setSelectedCandidates] = useState([]);

  // Contract reads
  const { data: election } = useContractRead({
    address: process.env.NEXT_PUBLIC_WEIGHTED_LOTTERY,
    abi: weightedLotteryAbi,
    functionName: 'getElection',
    args: [BigInt(selectedElection)],
    watch: true
  });

  const { data: hasVoted } = useContractRead({
    address: process.env.NEXT_PUBLIC_WEIGHTED_LOTTERY,
    abi: weightedLotteryAbi,
    functionName: 'hasVoted',
    args: [BigInt(selectedElection), address],
    watch: true
  });

  const { data: voteDistribution } = useContractRead({
    address: process.env.NEXT_PUBLIC_WEIGHTED_LOTTERY,
    abi: weightedLotteryAbi,
    functionName: 'getVoteDistribution',
    args: [BigInt(selectedElection)],
    watch: true
  });

  const { data: isEligibleVoter } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'isEligibleVoter',
    args: [address]
  });

  // Contract write
  const { write: vote, data: voteData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_WEIGHTED_LOTTERY,
    abi: weightedLotteryAbi,
    functionName: 'vote'
  });

  const { isLoading: isVoting } = useWaitForTransaction({ hash: voteData?.hash });

  const toggleCandidate = (candidateId) => {
    setSelectedCandidates(prev => 
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const handleVote = () => {
    if (selectedCandidates.length === 0) return;
    
    vote({
      args: [BigInt(selectedElection), selectedCandidates.map(id => BigInt(id))]
    });
  };

  // Check if election is finalized
  const isFinalized = election?.[4]; // isFinalized
  const winner = election?.[5]; // winner tokenId
  const totalVotes = Number(election?.[6] || 0);

  // Calculate max probability for scaling
  const maxProbability = Math.max(...(voteDistribution?.map(d => Number(d.probabilityBasisPoints)) || [0]));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Final Election</h1>
              <p className="text-green-200">Weighted Lottery Selection from Vetted Candidates</p>
            </div>
            
            <div className="text-right">
              <Dice5 className="w-12 h-12 text-green-400 mx-auto mb-2" />
              <p className="text-white font-bold">{totalVotes} Votes</p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-green-400/30">
          <h2 className="text-xl font-bold text-white mb-3">🎲 How Weighted Lottery Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white/10 rounded-lg p-4">
              <p className="text-green-300 font-semibold mb-1">1. Vote for Multiple</p>
              <p className="text-white/80">Select any number of candidates you support</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <p className="text-green-300 font-semibold mb-1">2. Weight Increases</p>
              <p className="text-white/80">Each vote increases that candidate's selection probability</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <p className="text-green-300 font-semibold mb-1">3. Random Selection</p>
              <p className="text-white/80">Chainlink VRF picks winner based on weighted probabilities</p>
            </div>
          </div>
        </div>

        {isFinalized ? (
          /* Winner Announcement */
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-lg rounded-2xl p-12 mb-6 border-2 border-yellow-400/50 text-center">
            <Sparkles className="w-20 h-20 text-yellow-400 mx-auto mb-4 animate-pulse" />
            <h2 className="text-4xl font-bold text-white mb-2">Winner Selected! 🎉</h2>
            <p className="text-yellow-200 text-lg mb-6">The Chainlink VRF has spoken</p>
            
            <div className="bg-white/10 rounded-xl p-8 max-w-2xl mx-auto">
              <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
              <p className="text-white font-bold text-2xl font-mono mb-2">
                Candidate #{winner?.toString()}
              </p>
              <p className="text-yellow-200">
                Selected from {totalVotes} weighted votes using provably fair randomness
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Vote Distribution Visualization */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Live Probability Distribution</h2>
              <p className="text-green-200 text-sm mb-6">
                Real-time chances of selection based on vote weights
              </p>

              <div className="space-y-3">
                {voteDistribution?.map((candidate, idx) => {
                  const probability = (Number(candidate.probabilityBasisPoints) / 100).toFixed(2);
                  const barWidth = maxProbability > 0 
                    ? (Number(candidate.probabilityBasisPoints) / maxProbability) * 100 
                    : 0;

                  return (
                    <div key={idx} className="bg-white/5 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-white font-bold">#{idx + 1}</span>
                          <p className="text-white font-mono text-sm">
                            {candidate.candidateAddress?.slice(0, 8)}...{candidate.candidateAddress?.slice(-6)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 font-bold text-lg">{probability}%</p>
                          <p className="text-green-300 text-xs">
                            {candidate.voteWeight?.toString()} votes
                          </p>
                        </div>
                      </div>

                      {/* Probability Bar */}
                      <div className="relative h-6 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-600 to-blue-600 transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      <p className="text-white/70 text-xs mt-2 line-clamp-1">
                        {candidate.platformSummary}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Candidate Selection */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">Vote for Candidates</h2>
                  <p className="text-green-200">
                    {selectedCandidates.length} selected
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {voteDistribution?.map((candidate, idx) => (
                    <div
                      key={idx}
                      onClick={() => !hasVoted && toggleCandidate(candidate.candidateId)}
                      className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${
                        selectedCandidates.includes(candidate.candidateId)
                          ? 'bg-green-600/30 border-green-400 shadow-lg shadow-green-500/20'
                          : 'bg-white/5 border-white/20 hover:bg-white/10'
                      } ${hasVoted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          selectedCandidates.includes(candidate.candidateId)
                            ? 'bg-green-600'
                            : 'bg-white/10'
                        }`}>
                          <Star className={`w-5 h-5 ${
                            selectedCandidates.includes(candidate.candidateId)
                              ? 'text-white fill-white'
                              : 'text-green-400'
                          }`} />
                        </div>
                        <div>
                          <p className="text-white font-bold font-mono text-sm">
                            {candidate.candidateAddress?.slice(0, 8)}...
                          </p>
                          <p className="text-green-300 text-xs">
                            Current: {(Number(candidate.probabilityBasisPoints) / 100).toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <p className="text-white/80 text-sm line-clamp-2 mb-3">
                        {candidate.platformSummary}
                      </p>

                      <div className="flex items-center gap-2 text-xs text-green-300">
                        <TrendingUp className="w-4 h-4" />
                        <span>{candidate.voteWeight?.toString()} current votes</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Voting Panel */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                <h3 className="text-xl font-bold text-white mb-4">Your Vote</h3>

                {hasVoted ? (
                  <div className="bg-green-500/20 rounded-lg p-6 text-center">
                    <Star className="w-12 h-12 text-