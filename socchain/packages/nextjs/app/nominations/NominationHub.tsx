"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Crown, FileText, Upload, CheckCircle, AlertCircle, Loader2, Tag, RefreshCw } from 'lucide-react';

const CANDIDACY_ADDRESS = '0x18dE7B71bb81B8140cD44B36aF0A669cc4e0F2Ca';
const NOMINATION_ADDRESS = '0x2519A217755e7E31d4FDC6075079Ae15769ffE8a';

const CANDIDACY_ABI = [
  {
    "inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"},{"internalType": "string","name": "_platformIPFS","type": "string"},{"internalType": "string","name": "_platformSummary","type": "string"},{"internalType": "string[]","name": "_tags","type": "string[]"}],
    "name": "mintCandidacy",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {"inputs": [],"name": "cooldownPeriod","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "address","name": "","type": "address"}],"name": "lastMintTimestamp","outputs": [{"internalType": "uint96","name": "","type": "uint96"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "address","name": "","type": "address"}],"name": "activeCandidacyId","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"}],"name": "getActiveCandidatesForElection","outputs": [{"internalType": "uint256[]","name": "","type": "uint256[]"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_tokenId","type": "uint256"}],"name": "getCandidateProfile","outputs": [{"components": [{"internalType": "uint256","name": "tokenId","type": "uint256"},{"internalType": "address","name": "candidate","type": "address"},{"internalType": "uint256","name": "electionId","type": "uint256"},{"internalType": "bool","name": "isActive","type": "bool"},{"internalType": "string","name": "platformIPFS","type": "string"},{"internalType": "string","name": "platformSummary","type": "string"},{"internalType": "string[]","name": "tags","type": "string[]"},{"internalType": "uint96","name": "mintedAt","type": "uint96"},{"internalType": "uint256","name": "attestationCount","type": "uint256"}],"internalType": "struct CandidacyNFT.CandidateProfile","name": "","type": "tuple"}],"stateMutability": "view","type": "function"}
];

const NOMINATION_ABI = [
  {"inputs": [],"name": "electionCounter","outputs": [{"internalType": "uint256","name": "","type": "uint256"}],"stateMutability": "view","type": "function"},
  {"inputs": [{"internalType": "uint256","name": "_electionId","type": "uint256"}],"name": "getElection","outputs": [{"internalType": "uint96","name": "nominationStart","type": "uint96"},{"internalType": "uint96","name": "nominationEnd","type": "uint96"},{"internalType": "uint256","name": "topN","type": "uint256"},{"internalType": "uint256","name": "minimumNominations","type": "uint256"},{"internalType": "bool","name": "isFinalized","type": "bool"},{"internalType": "uint256","name": "totalVoters","type": "uint256"},{"internalType": "bool","name": "autoFinalizationEnabled","type": "bool"}],"stateMutability": "view","type": "function"}
];

export default function NominationHub() {
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState('overview');
  const [electionId, setElectionId] = useState('1');
  const [ipfsHash, setIpfsHash] = useState('');
  const [summary, setSummary] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  // Get total election count
  const { data: electionCounter } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'electionCounter',
  });

  // Get election details for current selection
  const { data: electionData } = useReadContract({
    address: NOMINATION_ADDRESS,
    abi: NOMINATION_ABI,
    functionName: 'getElection',
    args: [BigInt(electionId)],
  });

  // Demo: Hardcode cooldown to 5 minutes (300 seconds)
  const cooldown = 300n;

  const { data: lastMint } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: 'lastMintTimestamp',
    args: address ? [address] : undefined,
  });

  const { data: activeId } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: 'activeCandidacyId',
    args: address ? [address] : undefined,
  });

  const { data: activeCandidates } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: 'getActiveCandidatesForElection',
    args: [BigInt(electionId)],
  });

  const { data: profile } = useReadContract({
    address: CANDIDACY_ADDRESS,
    abi: CANDIDACY_ABI,
    functionName: 'getCandidateProfile',
    args: activeId && activeId > 0n ? [activeId] : undefined,
  });

  const now = Math.floor(Date.now() / 1000);
  const cooldownElapsed = lastMint ? now - Number(lastMint) : Infinity;
  const hasActive = activeId && activeId > 0n;
  const isEligible = !hasActive && cooldownElapsed >= Number(cooldown || 0n);

  // Parse election data
  const election = electionData ? {
    nominationStart: Number(electionData[0]),
    nominationEnd: Number(electionData[1]),
    topN: Number(electionData[2]),
    minimumNominations: Number(electionData[3]),
    isFinalized: electionData[4],
    totalVoters: Number(electionData[5]),
  } : null;

  const isElectionActive = election && now >= election.nominationStart && now < election.nominationEnd && !election.isFinalized;

  const { writeContract, data: txHash, isPending: isMinting } = useWriteContract();
  const { isSuccess: mintSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {}
        throw new Error(`Upload failed (${response.status}): ${errorMessage}`);
      }

      const result = await response.json();
      setIpfsHash(result.cid);
      alert(`File uploaded successfully! CID: ${result.cid}`);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + (error as Error).message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleMint = () => {
    if (!ipfsHash || !summary || !tagsInput.trim()) return;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t);
    writeContract({
      address: CANDIDACY_ADDRESS,
      abi: CANDIDACY_ABI,
      functionName: 'mintCandidacy',
      args: [BigInt(electionId), ipfsHash, summary, tags],
    });
  };

  const Overview = () => (
    <div className="space-y-6">
      {/* Election Selector */}
      <div className="bg-indigo-50 border-2 border-indigo-400 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-medium text-indigo-900">Select Election:</span>
            <select
              value={electionId}
              onChange={(e) => setElectionId(e.target.value)}
              className="px-4 py-2 border border-indigo-300 rounded-lg bg-white font-medium"
            >
              {electionCounter && Array.from({ length: Number(electionCounter) }, (_, i) => i + 1).map(id => (
                <option key={id} value={id}>Election #{id}</option>
              ))}
            </select>
          </div>
          {election && (
            <div className="flex items-center gap-2">
              {isElectionActive ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  ● Active
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
            <div>Top {election.topN} candidates will advance • Min {election.minimumNominations} nominations required</div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-purple-500">
        <div className="flex items-start gap-6 mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
            <Crown className="w-8 h-8 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Election #{electionId} - Candidacy Declaration</h3>
            <p className="text-slate-600 mb-2">Mint your Candidacy NFT to declare your intent to run</p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>Cooldown: 5 minutes</span>
              <span>Active Candidates: {activeCandidates?.length || 0}</span>
            </div>
          </div>
        </div>

        {!address ? (
          <div className="p-4 bg-yellow-50 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
            <p className="text-yellow-800">Connect wallet to check eligibility</p>
          </div>
        ) : !isElectionActive ? (
          <div className="p-4 bg-amber-50 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-amber-600 mx-auto mb-2" />
            <p className="text-amber-800 font-medium">
              {!election ? 'Loading election data...' :
               election.isFinalized ? 'This election has been finalized' :
               now < election.nominationStart ? `Election starts ${new Date(election.nominationStart * 1000).toLocaleString()}` :
               'Nomination period has ended'}
            </p>
          </div>
        ) : hasActive ? (
          <div className="p-4 bg-blue-50 rounded-xl text-center">
            <Crown className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <p className="text-blue-700 font-medium mb-3">You have active candidacy #{activeId?.toString()}</p>
            <button onClick={() => setActiveTab('declare')} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              View Details
            </button>
          </div>
        ) : isEligible ? (
          <div className="p-4 bg-green-50 rounded-xl text-center">
            <CheckCircle className="w-6 h-6 text-green-600 mx-auto mb-2" />
            <p className="text-green-700 font-medium mb-3">You are eligible to declare candidacy!</p>
            <button onClick={() => setActiveTab('declare')} className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700">
              Declare Now
            </button>
          </div>
        ) : (
          <div className="p-4 bg-red-50 rounded-xl text-center">
            <AlertCircle className="w-6 h-6 text-red-600 mx-auto mb-2" />
            <p className="text-red-700">Cooldown active. Eligible in {Math.ceil((Number(cooldown || 0n) - cooldownElapsed) / 60)} minutes</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h4 className="font-semibold text-slate-800 mb-4">Next Steps</h4>
        <Link href={`/nominationsvote?election=${electionId}`}>
          <div className="p-4 border-2 border-purple-200 rounded-lg hover:border-purple-500 cursor-pointer">
            <h5 className="font-medium text-purple-600">→ Nomination Voting</h5>
            <p className="text-sm text-slate-600">Vote to nominate candidates for vetting</p>
          </div>
        </Link>
      </div>
    </div>
  );

  const DeclareTab = () => (
    <div className="space-y-6">
      {/* Election Info */}
      {election && (
        <div className={`border-2 rounded-xl p-4 ${
          isElectionActive ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400'
        }`}>
          <div className="flex items-start gap-2">
            {isElectionActive ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            )}
            <div className={`text-sm ${isElectionActive ? 'text-green-800' : 'text-amber-800'}`}>
              {isElectionActive ? (
                <>
                  <strong>Election #{electionId} is active!</strong> You can declare your candidacy now.
                  <br />Nomination period ends: {new Date(election.nominationEnd * 1000).toLocaleString()}
                </>
              ) : (
                <>
                  <strong>Election #{electionId} is not accepting declarations.</strong>
                  {election.isFinalized ? ' This election has been finalized.' :
                   now < election.nominationStart ? ` Starts: ${new Date(election.nominationStart * 1000).toLocaleString()}` :
                   ' Nomination period has ended.'}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {!address ? (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <AlertCircle className="w-5 h-5 inline mr-2 text-yellow-600" />
          <span className="text-yellow-800">Connect your wallet to declare candidacy</span>
        </div>
      ) : hasActive ? (
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-purple-600" />
            Your Active Candidacy #{activeId?.toString()}
          </h3>
          {profile && (
            <div className="space-y-4">
              <div><span className="text-sm text-slate-600">Election:</span> <span className="font-medium">#{profile.electionId.toString()}</span></div>
              <div><span className="text-sm text-slate-600">Summary:</span> <p className="font-medium">{profile.platformSummary}</p></div>
              <div><span className="text-sm text-slate-600">IPFS:</span> <a href={`https://ipfs.io/ipfs/${profile.platformIPFS}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{profile.platformIPFS.slice(0, 20)}...</a></div>
              <div><span className="text-sm text-slate-600">Tags:</span> <div className="flex flex-wrap gap-1 mt-1">{profile.tags.map((tag: string, i: number) => <span key={i} className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">{tag}</span>)}</div></div>
              <div className="text-sm text-slate-500">Minted: {new Date(Number(profile.mintedAt) * 1000).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      ) : !isEligible ? (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <AlertCircle className="w-5 h-5 inline mr-2 text-red-600" />
          <span className="text-red-800">Cooldown active or you don't meet requirements</span>
        </div>
      ) : !isElectionActive ? (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
          <AlertCircle className="w-5 h-5 inline mr-2 text-amber-600" />
          <span className="text-amber-800">Cannot declare candidacy - election is not in nomination phase</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <h3 className="font-semibold text-slate-800 mb-4">Declare Your Candidacy</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Election ID</label>
            <input type="number" value={electionId} onChange={(e) => setElectionId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" min="1" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Upload Manifesto (PDF/Markdown)</label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
              <input type="file" onChange={handleFileUpload} className="hidden" id="file-upload" accept=".pdf,.md,.txt" />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Click to upload your platform document</p>
                {uploadingFile && <Loader2 className="w-4 h-4 animate-spin mx-auto mt-2" />}
              </label>
            </div>
            {ipfsHash && (
              <div className="mt-2 p-2 bg-green-50 rounded text-sm text-green-700">
                ✓ Uploaded: {ipfsHash}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IPFS Hash (or paste manually)</label>
            <input type="text" placeholder="Qm..." value={ipfsHash} onChange={(e) => setIpfsHash(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Platform Summary (280 chars)</label>
            <textarea placeholder="Brief summary of your platform" value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg h-20" maxLength={280} />
            <p className="text-xs text-slate-500 mt-1">{summary.length}/280</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma-separated, max 5)</label>
            <input type="text" placeholder="governance, sustainability, innovation" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          <button type="button" onClick={handleMint} disabled={!ipfsHash || !summary || !tagsInput.trim() || isMinting} className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
            {isMinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
            {isMinting ? 'Minting...' : 'Declare Candidacy'}
          </button>

          {mintSuccess && (
            <div className="p-3 bg-green-100 rounded text-green-700 text-sm">
              ✓ Candidacy declared! Your NFT has been minted.
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 py-12">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-purple-600 mb-4">← Back to Home</Link>
          <h1 className="text-4xl font-bold text-slate-800 mb-2">Candidacy Declaration</h1>
          <p className="text-slate-600">Mint your Candidacy NFT to enter the election process</p>
        </div>

        <div className="mb-6">
          <div className="flex gap-2 bg-white rounded-xl p-2 shadow-md">
            {[{id: 'overview', label: 'Overview'}, {id: 'declare', label: 'Declare Candidacy'}].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${activeTab === tab.id ? 'bg-purple-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          {activeTab === 'overview' && <Overview />}
          {activeTab === 'declare' && <DeclareTab />}
        </div>
      </div>
    </div>
  );
}