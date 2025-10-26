import React, { useState } from 'react';
import { useAccount, useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { CheckCircle, XCircle, Upload, FileText, Tag, Award } from 'lucide-react';

// Consolidated: Candidacy Declaration + Platform Management
const CandidacyCenter = () => {
  const { address } = useAccount();
  const [formData, setFormData] = useState({
    electionId: '1',
    manifestoIPFS: '',
    platformSummary: '',
    selectedTags: []
  });
  const [uploadStatus, setUploadStatus] = useState('');

  const availableTags = [
    'Economy', 'Security', 'Healthcare', 'Education', 
    'Environment', 'Technology', 'Justice', 'Infrastructure'
  ];

  // Check eligibility
  const { data: isEligible } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'isEligibleCandidate',
    args: [address],
    watch: true
  });

  const { data: identity } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'getIdentity',
    args: [address]
  });

  const { data: attestationCount } = useContractRead({
    address: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: 'getActiveAttestationCount',
    args: [address]
  });

  const { data: activeCandidacy } = useContractRead({
    address: process.env.NEXT_PUBLIC_CANDIDACY_NFT,
    abi: candidacyNftAbi,
    functionName: 'activeCandidacyId',
    args: [address]
  });

  // Contract write
  const { write: mintCandidacy, data: mintData } = useContractWrite({
    address: process.env.NEXT_PUBLIC_CANDIDACY_NFT,
    abi: candidacyNftAbi,
    functionName: 'mintCandidacy'
  });

  const { isLoading: isMinting } = useWaitForTransaction({ hash: mintData?.hash });

  const handleFileUpload = async (file) => {
    // Upload to IPFS (using web3.storage, Pinata, or similar)
    setUploadStatus('Uploading to IPFS...');
    
    try {
      // Mock upload - replace with actual IPFS service
      const formData = new FormData();
      formData.append('file', file);
      
      // const response = await fetch('/api/upload-ipfs', {
      //   method: 'POST',
      //   body: formData
      // });
      // const { cid } = await response.json();
      
      const mockCid = 'QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      setFormData(prev => ({ ...prev, manifestoIPFS: mockCid }));
      setUploadStatus('Upload successful!');
    } catch (error) {
      setUploadStatus('Upload failed');
    }
  };

  const handleDeclare = () => {
    if (!formData.electionId || !formData.manifestoIPFS || !formData.platformSummary) return;

    mintCandidacy({
      args: [
        BigInt(formData.electionId),
        formData.manifestoIPFS,
        formData.platformSummary,
        formData.selectedTags
      ]
    });
  };

  const toggleTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter(t => t !== tag)
        : [...prev.selectedTags, tag]
    }));
  };

  const eligibilityChecks = {
    passportScore: identity?.passportScore >= 15,
    stake: identity?.stakeAmount >= parseEther('0.001'),
    tenure: identity?.registeredAt && 
            (Date.now() / 1000 - Number(identity.registeredAt)) >= (7 * 24 * 60 * 60),
    attestations: Number(attestationCount || 0) >= 2
  };

  const allEligible = Object.values(eligibilityChecks).every(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-6 border border-white/20">
          <h1 className="text-4xl font-bold text-white mb-2">Candidacy Center</h1>
          <p className="text-blue-200">Declare your candidacy and share your vision</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-6">Declare Your Candidacy</h2>

            {!allEligible && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
                <p className="text-white font-semibold mb-2">⚠️ Eligibility Requirements Not Met</p>
                <p className="text-red-200 text-sm">Complete all requirements below to declare candidacy</p>
              </div>
            )}

            <div className="space-y-6">
              {/* Election Selector */}
              <div>
                <label className="text-white font-semibold mb-2 block">
                  Election
                </label>
                <select
                  value={formData.electionId}
                  onChange={e => setFormData({...formData, electionId: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-blue-400 outline-none"
                >
                  <option value="1">General Election 2025</option>
                  <option value="2">Special Election Q1</option>
                </select>
              </div>

              {/* Manifesto Upload */}
              <div>
                <label className="text-white font-semibold mb-2 block">
                  Campaign Manifesto (IPFS)
                </label>
                <div className="border-2 border-dashed border-white/30 rounded-lg p-8 text-center hover:border-blue-400 transition-all cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.md,.txt"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                    <p className="text-white mb-1">Drop manifesto file or click to upload</p>
                    <p className="text-blue-300 text-sm">PDF, Markdown, or Text (Max 5MB)</p>
                  </label>
                </div>
                {formData.manifestoIPFS && (
                  <div className="mt-2 flex items-center gap-2 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>Uploaded: {formData.manifestoIPFS.slice(0, 12)}...</span>
                  </div>
                )}
                {uploadStatus && (
                  <p className="mt-2 text-blue-300 text-sm">{uploadStatus}</p>
                )}
              </div>

              {/* Platform Summary */}
              <div>
                <label className="text-white font-semibold mb-2 block">
                  Platform Summary (Max 500 chars)
                </label>
                <textarea
                  value={formData.platformSummary}
                  onChange={e => setFormData({...formData, platformSummary: e.target.value})}
                  maxLength={500}
                  rows={5}
                  placeholder="Summarize your key policy positions and vision..."
                  className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-blue-400 outline-none resize-none"
                />
                <p className="text-blue-300 text-sm mt-1">
                  {formData.platformSummary.length}/500 characters
                </p>
              </div>

              {/* Tags */}
              <div>
                <label className="text-white font-semibold mb-3 block">
                  Policy Focus Areas (Select up to 5)
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      disabled={formData.selectedTags.length >= 5 && !formData.selectedTags.includes(tag)}
                      className={`px-4 py-2 rounded-full font-medium transition-all ${
                        formData.selectedTags.includes(tag)
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/10 text-blue-200 hover:bg-white/20'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Tag className="inline w-4 h-4 mr-1" />
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* NFT Preview */}
              {formData.platformSummary && (
                <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                  <h3 className="text-white font-semibold mb-3">NFT Preview</h3>
                  <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg p-6">
                    <p className="text-white text-sm mb-2">DDSP Candidacy #{formData.electionId}</p>
                    <p className="text-white font-bold text-lg mb-3">{address?.slice(0, 8)}...{address?.slice(-6)}</p>
                    <p className="text-blue-100 text-sm mb-3">{formData.platformSummary.slice(0, 100)}...</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.selectedTags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-1 bg-white/20 rounded text-white text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleDeclare}
                disabled={!allEligible || isMinting || !formData.manifestoIPFS || !formData.platformSummary}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMinting ? 'Minting Candidacy NFT...' : 'Mint Candidacy NFT'}
              </button>
            </div>
          </div>

          {/* Eligibility Sidebar */}
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-4">Eligibility Status</h2>

            <div className="space-y-3">
              <div className={`flex items-start gap-3 p-3 rounded-lg ${
                eligibilityChecks.passportScore ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {eligibilityChecks.passportScore ? 
                  <CheckCircle className="text-green-400 w-5 h-5 mt-0.5" /> : 
                  <XCircle className="text-red-400 w-5 h-5 mt-0.5" />
                }
                <div>
                  <p className="text-white font-semibold">Passport Score</p>
                  <p className="text-sm text-white/70">
                    {identity?.passportScore || 0}/15 required
                  </p>
                </div>
              </div>

              <div className={`flex items-start gap-3 p-3 rounded-lg ${
                eligibilityChecks.stake ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {eligibilityChecks.stake ? 
                  <CheckCircle className="text-green-400 w-5 h-5 mt-0.5" /> : 
                  <XCircle className="text-red-400 w-5 h-5 mt-0.5" />
                }
                <div>
                  <p className="text-white font-semibold">Minimum Stake</p>
                  <p className="text-sm text-white/70">
                    {formatEther(identity?.stakeAmount || 0n)} ETH
                  </p>
                </div>
              </div>

              <div className={`flex items-start gap-3 p-3 rounded-lg ${
                eligibilityChecks.attestations ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {eligibilityChecks.attestations ? 
                  <CheckCircle className="text-green-400 w-5 h-5 mt-0.5" /> : 
                  <XCircle className="text-red-400 w-5 h-5 mt-0.5" />
                }
                <div>
                  <p className="text-white font-semibold">Attestations</p>
                  <p className="text-sm text-white/70">
                    {attestationCount?.toString() || '0'}/2 required
                  </p>
                </div>
              </div>

              <div className={`flex items-start gap-3 p-3 rounded-lg ${
                eligibilityChecks.tenure ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {eligibilityChecks.tenure ? 
                  <CheckCircle className="text-green-400 w-5 h-5 mt-0.5" /> : 
                  <XCircle className="text-red-400 w-5 h-5 mt-0.5" />
                }
                <div>
                  <p className="text-white font-semibold">Member Tenure</p>
                  <p className="text-sm text-white/70">
                    7+ days required
                  </p>
                </div>
              </div>
            </div>

            {activeCandidacy > 0 && (
              <div className="mt-6 bg-blue-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="text-blue-400" />
                  <p className="text-white font-semibold">Active Candidacy</p>
                </div>
                <p className="text-blue-200 text-sm">
                  You already have an active candidacy NFT. 
                  Wait for cooldown period before declaring again.
                </p>
              </div>
            )}

            {allEligible && !activeCandidacy && (
              <div className="mt-6 bg-green-500/20 rounded-lg p-4">
                <p className="text-green-100 text-sm">
                  ✅ All requirements met! You can declare your candidacy.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Mock ABIs
const identityRegistryAbi = [
  {
    name: 'isEligibleCandidate',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_candidate', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'getIdentity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_member', type: 'address' }],
    outputs: [{ name: '', type: 'tuple' }]
  },
  {
    name: 'getActiveAttestationCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '_member', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
];

const candidacyNftAbi = [
  {
    name: 'mintCandidacy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_electionId', type: 'uint256' },
      { name: '_platformIPFS', type: 'string' },
      { name: '_platformSummary', type: 'string' },
      { name: '_tags', type: 'string[]' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'activeCandidacyId',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
];

export default CandidacyCenter;