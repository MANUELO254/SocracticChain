"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Vote, CheckCircle, AlertCircle, Loader2, Users, Clock, Award } from 'lucide-react';

const NOMINATION_ADDRESS = '0x2519A217755e7E31d4FDC6075079Ae15769ffE8a';
const CANDIDACY_ADDRESS = '0x18dE7B71bb81B8140cD44B36aF0A669cc4e0F2Ca';

const NOMINATION_ABI = [
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"},{"internalType": "uint256[]","name": "_candidateIds","type": "uint256[]"}],"name": "nominate","outputs": [],"stateMutability": "nonpayable","type": "function"},
  {"inputs": [],"name": "electionCounter","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"}],"name": "getElection","outputs": [{"internalType": "uint96","name": "nominationStart","type": "uint96"},{"internalType": "uint96","name": "nominationEnd","type": "uint96"},{"internalType": "uint256","name": "topN","type": "uint256"},{"internalType": "uint256","name": "minimumNominations","type": "uint256"},{"internalType": "bool","name": "isFinalized","type": "bool"},{"internalType": "uint256","name": "totalVoters","type": "uint256"},{"internalType": "bool","name": "autoFinalizationEnabled","type": "bool"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"},{"internalType": "address","name": "_voter","type": "address"}],"name": "hasVoted","outputs": [{"internalType": "bool","name": "","type": "bool"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"},{"internalType": "address","name": "_voter","type": "address"}],"name": "getVoterNominations","outputs": [{"internalType": "uint256[]","name": "","type": "uint256[]"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"},{"internalType": "uint256","name": "_limit","type": "uint256"}],"name": "getTopNLeaderboard","outputs": [{"components": [{"internalType": "uint256","name": "candidateId","type": "uint256"},{"internalType": "uint256","name": "nominationCount","type": "uint256"},{"internalType": "address","name": "candidateAddress","type": "address"},{"internalType": "string","name": "platformSummary","type": "string"},{"internalType": "bool","name": "isActive","type": "bool"}],"internalType": "struct NominationVoting.LeaderboardEntry[]","name": "","type": "tuple[]"}],"stateMutability": "view","type": "function"}
];

const CANDIDACY_ABI = [
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"}],"name": "getActiveCandidatesForElection","outputs": [{"internalType": "uint256[]","name": "","type": "uint256[]"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256[]","name": "_tokenIds","type": "uint256[]"}],"name": "getBatchCandidateProfiles","outputs": [{"components": [{"internalType": "uint256","name": "tokenId","type": "uint256"},{"internalType": "address","name": "candidate","type": "address"},{"internalType": "uint256","name": "electionId","type": "uint256"},{"internalType": "bool","name": "isActive","type": "bool"},{"internalType": "string","name": "platformIPFS","type": "string"},{"internalType": "string","name": "platformSummary","type": "string"},{"internalType": "string[]","name": "tags","type": "string[]"},{"internalType": "uint96","name": "mintedAt","type": "uint96"},{"internalType": "uint256","name": "attestationCount","type": "uint256"}],"internalType": "struct CandidacyNFT.CandidateProfile[]","name": "","type": "tuple[]"}],"stateMutability": "view","type": "function"}
];

export default function NominationVotingPage() {
  const { address } = useAccount();
  const searchParams = useSearchParams();
  const electionParam = searchParams?.get('election');
  const [electionId, setElectionId] = useState(electionParam ? parseInt(electionParam) : 1);
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);

  // Get total election count
  const { data: electionCounter } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'electionCounter',
  });

  const { data: electionData } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'getElection',
    args: [BigInt(electionId)],
  });

  const { data: hasVoted } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'hasVoted',
    args: address ? [BigInt(electionId), address] : undefined,
  });

  const { data: voterNominations } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'getVoterNominations',
    args: address ? [BigInt(electionId), address] : undefined,
  });

  const { data: activeCandidateIds } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: 'getActiveCandidatesForElection',
    args: [BigInt(electionId)],
  });

  const { data: candidateProfiles } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: 'getBatchCandidateProfiles',
    args: activeCandidateIds && activeCandidateIds.length > 0 ? [activeCandidateIds] : undefined,
  });

  const { data: leaderboard } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'getTopNLeaderboard',
    args: [BigInt(electionId), 20n],
  });

  const { writeContract, data: txHash, isPending: isVoting } = useWriteContract();
  const { isSuccess: voteSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const election = electionData ? {
    nominationStart: Number(electionData[0]),
    nominationEnd: Number(electionData[1]),
    topN: Number(electionData[2]),
    minimumNominations: Number(electionData[3]),
    isFinalized: electionData[4],
    totalVoters: Number(electionData[5]),
  } : null;

  const now = Math.floor(Date.now() / 1000);
  const isActive = election && now >= election.nominationStart && now < election.nominationEnd && !election.isFinalized;

  const handleToggleCandidate = (candidateId: number) => {
    if (selectedCandidates.includes(candidateId)) {
      setSelectedCandidates(prev => prev.filter(id => id !== candidateId));
    } else {
      if (selectedCandidates.length < 10) {
        setSelectedCandidates(prev => [...prev, candidateId]);
      } else {
        alert('Maximum 10 nominations allowed');
      }
    }
  };

  const handleNominate = () => {
    if (selectedCandidates.length === 0) return;
    writeContract({
      address: NOMINATION_ADDRESS,
      abi: NOMINATION_ABI,
      functionName: 'nominate',
      args: [BigInt(electionId), selectedCandidates.map(id => BigInt(id))],
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link href="/nominations" className="inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600 mb-4">
            ← Back to Candidacy Hub
          </Link>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Nomination Voting</h1>
          <p className="text-slate-600">Vote to nominate candidates for the vetting phase</p>
        </div>

        {/* Election Selector */}
        <div className="bg-indigo-50 border-2 border-indigo-400 rounded-xl p-4 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-medium text-indigo-900">Select Election:</span>
              <select
                value={electionId}
                onChange={(e) => setElectionId(parseInt(e.target.value))}
                className="px-4 py-2 border border-indigo-300 rounded-lg bg-white font-medium"
              >
                {electionCounter && Array.from({ length: Number(electionCounter) }, (_, i) => i + 1).map(id => (
                  <option key={id} value={id}>Election #{id}</option>
                ))}
              </select>
            </div>
            {election && (
              <div className="flex items-center gap-2">
                {isActive ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    ● Voting Active
                  </span>
                ) : election.isFinalized ? (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                    ● Finalized
                  </span>
                ) : now < election.nominationStart ? (
                  <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                    ● Not Started
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                    ● Ended
                  </span>
                )}
              </div>
            )}
          </div>
          {election && (
            <div className="mt-3 text-sm text-indigo-800 space-y-1">
              <div>Start: {new Date(election.nominationStart * 1000).toLocaleString()}</div>
              <div>End: {new Date(election.nominationEnd * 1000).toLocaleString()}</div>
              <div>Current time: {new Date(now * 1000).toLocaleString()}</div>
            </div>
          )}
        </div>

        {election && (
          <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-indigo-500 mb-8">
            <div className="flex items-start gap-6 mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <Vote className="w-8 h-8 text-indigo-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Election #{electionId} Nomination Phase</h3>
                <p className="text-slate-600 mb-2">Select up to 10 candidates to nominate for vetting</p>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>
                      {election.isFinalized ? 'Finalized' : isActive ? 'Active' : now < election.nominationStart ? 'Not Started' : 'Ended'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{election.totalVoters} voters</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Award className="w-4 h-4" />
                    <span>Top {election.topN} advance</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-indigo-600">{activeCandidateIds?.length || 0}</div>
                <div className="text-sm text-slate-600">Candidates</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-indigo-600">{election.totalVoters}</div>
                <div className="text-sm text-slate-600">Voters</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-indigo-600">{election.topN}</div>
                <div className="text-sm text-slate-600">Will Advance</div>
              </div>
            </div>
          </div>
        )}

        {!address ? (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded mb-8">
            <AlertCircle className="w-5 h-5 inline mr-2 text-yellow-600" />
            <span className="text-yellow-800">Connect your wallet to nominate candidates</span>
          </div>
        ) : !election ? (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded mb-8">
            <AlertCircle className="w-5 h-5 inline mr-2 text-amber-600" />
            <span className="text-amber-800">Loading election data...</span>
          </div>
        ) : !isActive ? (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded mb-8">
            <AlertCircle className="w-5 h-5 inline mr-2 text-red-600" />
            <span className="text-red-800">
              {election.isFinalized ? 'Nomination phase has ended and been finalized' : 
               now < election.nominationStart ? `Nomination phase starts ${new Date(election.nominationStart * 1000).toLocaleString()}` :
               'Nomination phase has ended'}
            </span>
          </div>
        ) : hasVoted ? (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded mb-8">
            <CheckCircle className="w-5 h-5 inline mr-2 text-green-600" />
            <span className="text-green-800">
              You nominated candidates: {voterNominations?.map(id => `#${id}`).join(', ')}
            </span>
          </div>
        ) : null}

        {isActive && !hasVoted && address && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-8">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Vote className="w-5 h-5 text-indigo-600" />
              Cast Your Nominations ({selectedCandidates.length}/10 selected)
            </h3>
            
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {candidateProfiles && candidateProfiles.length > 0 ? (
                candidateProfiles.map((profile: any) => (
                  <label
                    key={profile.tokenId.toString()}
                    className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedCandidates.includes(Number(profile.tokenId))
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCandidates.includes(Number(profile.tokenId))}
                      onChange={() => handleToggleCandidate(Number(profile.tokenId))}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">
                        Candidate #{profile.tokenId.toString()}
                        <span className="text-sm text-slate-500 ml-2">
                          ({profile.candidate.slice(0, 6)}...{profile.candidate.slice(-4)})
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{profile.platformSummary}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {profile.tags.map((tag: string, idx: number) => (
                          <span key={idx} className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Attestations: {profile.attestationCount.toString()}
                      </div>
                    </div>
                  </label>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No active candidates for this election yet. Candidates must declare their candidacy first!
                </div>
              )}
            </div>

            <button
              onClick={handleNominate}
              disabled={selectedCandidates.length === 0 || isVoting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {isVoting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Nominating...
                </>
              ) : (
                <>
                  <Vote className="w-4 h-4" />
                  Nominate {selectedCandidates.length} Candidate{selectedCandidates.length !== 1 ? 's' : ''}
                </>
              )}
            </button>

            {voteSuccess && (
              <div className="mt-4 p-3 bg-green-100 rounded text-green-700 text-sm">
                ✓ Nominations cast successfully!
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-600" />
            Nomination Leaderboard
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Rank</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Candidate</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Summary</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Nominations</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard && leaderboard.length > 0 ? (
                  leaderboard.map((entry: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-800">#{idx + 1}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">Candidate #{entry.candidateId.toString()}</div>
                        <div className="text-xs text-slate-500">
                          {entry.candidateAddress.slice(0, 6)}...{entry.candidateAddress.slice(-4)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{entry.platformSummary}</td>
                      <td className="py-3 px-4 text-lg font-bold text-indigo-600">
                        {entry.nominationCount.toString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No nominations yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}