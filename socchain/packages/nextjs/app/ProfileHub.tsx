import React, { useState, useEffect } from 'react';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { CheckCircle, XCircle, Upload, Award, Users, TrendingUp } from 'lucide-react';

// Consolidated: Registration + Identity Management + Social Attestations
const ProfileHub = () => {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState('overview'); // overview, register, attestations
  const [formData, setFormData] = useState({
    passportScore: '',
    stakeAmount: '0.05',
    attesteeAddress: '',
    evidenceText: ''
  });

  // Contract reads
  const { data: isRegistered } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'identities',
    args: [address],
    watch: true
  });

  const { data: memberProfile } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'getIdentity',
    args: [address],
    enabled: isRegistered
  });

  const { data: stakeUSD } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'getStakeInUSDView',
    args: [address],
    enabled: isRegistered
  });

  const { data: attestations } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'getAttestations',
    args: [address],
    enabled: isRegistered
  });

  // Contract writes
  const { write: register, data: registerData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'register'
  });

  const { write: createAttestation, data: attestData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'createAttestation'
  });

  const { isLoading: isRegistering } = useWaitForTransaction({ hash: registerData?.hash });
  const { isLoading: isAttesting } = useWaitForTransaction({ hash: attestData?.hash });

  const handleRegister = async () => {
    if (!formData.passportScore || !formData.stakeAmount) return;

    // In production, fetch real Gitcoin Passport proof
    const mockProof = '0x'; // Replace with actual proof
    const pythPriceUpdate = []; // Fetch from Pyth Hermes API

    register({
      args: [BigInt(formData.passportScore), mockProof, pythPriceUpdate],
      value: parseEther(formData.stakeAmount)
    });
  };

  const handleAttest = () => {
    if (!formData.attesteeAddress || !formData.evidenceText) return;

    createAttestation({
      args: [formData.attesteeAddress, formData.evidenceText]
    });
  };

  // Eligibility indicators
  const eligibility = {
    voter: memberProfile?.passportScore >= 15 && memberProfile?.stakeAmount >= parseEther('0.001'),
    candidate: memberProfile?.passportScore >= 15 && 
               memberProfile?.stakeAmount >= parseEther('0.001') &&
               attestations?.length >= 2,
    juror: memberProfile?.participationCount >= 2
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">Your Profile Hub</h1>
              <p className="text-purple-200">Identity, Reputation & Community Standing</p>
            </div>
            {isConnected && (
              <div className="text-right">
                <p className="text-purple-200 text-sm">Connected</p>
                <p className="text-white font-mono text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6">
          {['overview', 'register', 'attestations'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white/10 text-purple-200 hover:bg-white/20'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && isRegistered && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Identity Card */}
            <div className="md:col-span-2 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Identity Verification</h2>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-purple-200 text-sm mb-1">Gitcoin Passport Score</p>
                  <p className="text-3xl font-bold text-white">{memberProfile?.passportScore.toString()}</p>
                </div>
                
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-purple-200 text-sm mb-1">ETH Stake</p>
                  <p className="text-3xl font-bold text-white">
                    {formatEther(memberProfile?.stakeAmount || 0n)}
                  </p>
                  <p className="text-purple-300 text-sm mt-1">
                    ≈ ${(Number(stakeUSD || 0n) / 1e18).toFixed(2)} USD
                  </p>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-purple-200 text-sm mb-1">Attestations</p>
                  <p className="text-3xl font-bold text-white">{attestations?.length || 0}</p>
                </div>

                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-purple-200 text-sm mb-1">Participation</p>
                  <p className="text-3xl font-bold text-white">
                    {memberProfile?.participationCount.toString()}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-white font-semibold mb-3">Eligibility Status</h3>
                
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  eligibility.voter ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}>
                  {eligibility.voter ? <CheckCircle className="text-green-400" /> : <XCircle className="text-red-400" />}
                  <span className="text-white">Voting Eligible</span>
                </div>

                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  eligibility.candidate ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}>
                  {eligibility.candidate ? <CheckCircle className="text-green-400" /> : <XCircle className="text-red-400" />}
                  <span className="text-white">Candidacy Eligible</span>
                  {!eligibility.candidate && (
                    <span className="text-purple-300 text-sm ml-auto">
                      Need {2 - (attestations?.length || 0)} more attestations
                    </span>
                  )}
                </div>

                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  eligibility.juror ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}>
                  {eligibility.juror ? <CheckCircle className="text-green-400" /> : <XCircle className="text-red-400" />}
                  <span className="text-white">Juror Eligible</span>
                </div>
              </div>
            </div>

            {/* Attestations Received */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h2 className="text-xl font-bold text-white mb-4">Received Attestations</h2>
              
              {attestations && attestations.length > 0 ? (
                <div className="space-y-3">
                  {attestations.slice(0, 5).map((att, i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Award className="text-purple-400 w-4 h-4" />
                        <p className="text-white text-sm font-mono">
                          {att.attestor.slice(0, 6)}...{att.attestor.slice(-4)}
                        </p>
                      </div>
                      <p className="text-purple-200 text-xs">{att.evidence}</p>
                      <p className="text-purple-300 text-xs mt-1">
                        {new Date(Number(att.timestamp) * 1000).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-purple-300 text-center py-8">No attestations yet</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'register' && !isRegistered && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6">Join the Democracy</h2>
            
            <div className="space-y-6">
              <div>
                <label className="text-white font-semibold mb-2 block">
                  Gitcoin Passport Score
                </label>
                <input
                  type="number"
                  value={formData.passportScore}
                  onChange={e => setFormData({...formData, passportScore: e.target.value})}
                  placeholder="Minimum: 15"
                  className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-purple-400 outline-none"
                />
                <p className="text-purple-300 text-sm mt-2">
                  <a href="https://passport.gitcoin.co" target="_blank" className="underline">
                    Get your score →
                  </a>
                </p>
              </div>

              <div>
                <label className="text-white font-semibold mb-2 block">
                  ETH Stake Amount
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={formData.stakeAmount}
                  onChange={e => setFormData({...formData, stakeAmount: e.target.value})}
                  placeholder="Minimum: 0.001 ETH"
                  className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-purple-400 outline-none"
                />
                <p className="text-purple-300 text-sm mt-2">
                  ≈ $50 USD minimum (live conversion)
                </p>
              </div>

              <div className="bg-purple-500/20 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-2">Requirements Checklist</h3>
                <ul className="space-y-2 text-purple-200 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Passport Score ≥ 15
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Stake ≥ $50 USD
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Connected Wallet
                  </li>
                </ul>
              </div>

              <button
                onClick={handleRegister}
                disabled={isRegistering || !formData.passportScore || !formData.stakeAmount}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegistering ? 'Registering...' : 'Register & Stake'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'attestations' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Give Attestation */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Give Attestation</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-white font-semibold mb-2 block">
                    Member Address
                  </label>
                  <input
                    type="text"
                    value={formData.attesteeAddress}
                    onChange={e => setFormData({...formData, attesteeAddress: e.target.value})}
                    placeholder="0x..."
                    className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-purple-400 outline-none"
                  />
                </div>

                <div>
                  <label className="text-white font-semibold mb-2 block">
                    Evidence / Reason
                  </label>
                  <textarea
                    value={formData.evidenceText}
                    onChange={e => setFormData({...formData, evidenceText: e.target.value})}
                    placeholder="Why are you attesting to this member?"
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-purple-400 outline-none"
                  />
                </div>

                <button
                  onClick={handleAttest}
                  disabled={isAttesting || !formData.attesteeAddress || !formData.evidenceText}
                  className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-all disabled:opacity-50"
                >
                  {isAttesting ? 'Submitting...' : 'Submit Attestation'}
                </button>
              </div>
            </div>

            {/* Search Members */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold text-white mb-4">Find Members</h2>
              
              <input
                type="text"
                placeholder="Search by address..."
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-purple-400 outline-none mb-4"
              />

              <div className="space-y-3">
                {/* Member cards would be dynamically loaded */}
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-mono text-sm">0x1234...5678</p>
                    <span className="text-purple-300 text-sm">Score: 25</span>
                  </div>
                  <p className="text-purple-200 text-xs">3 attestations • 5 participations</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Mock ABI (replace with actual)
const identityRegistryAbi = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: '_passportScore', type: 'uint256' },
      { name: '_proof', type: 'bytes' },
      { name: '_pythPriceUpdate', type: 'bytes[]' }
    ],
    outputs: []
  },
  {
    name: 'getIdentity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_member', type: 'address' }],
    outputs: [{ name: '', type: 'tuple' }]
  },
  {
    name: 'createAttestation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_attestee', type: 'address' },
      { name: '_evidence', type: 'string' }
    ],
    outputs: []
  }
];

export default ProfileHub;