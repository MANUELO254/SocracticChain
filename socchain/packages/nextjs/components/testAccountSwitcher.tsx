// socchain/packages/nextjs/components/TestAccountSwitcher.tsx
"use client";

import React, { useState } from "react";
import { Check, Copy, ExternalLink, Users, X } from "lucide-react";
import { useAccount } from "wagmi";

import { TEST_ACCOUNTS, getAccountByAddress } from "utils/testAccounts";

export default function TestAccountSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { address } = useAccount();

  const currentAccount = getAccountByAddress(address || "");

  const handleCopyPrivateKey = async (privateKey: string, index: number) => {
    await navigator.clipboard.writeText(privateKey);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleImportToMetaMask = (privateKey: string, role: string) => {
    alert(
      `📋 Steps to Import "${role}" to MetaMask:\n\n` +
        `1. Click MetaMask extension\n` +
        `2. Click account icon (top right)\n` +
        `3. Click "Add account or hardware wallet"\n` +
        `4. Select "Import account"\n` +
        `5. Paste this private key:\n\n${privateKey}\n\n` +
        `6. Click "Import"\n\n` +
        `✅ Make sure you&apos;re on OP Sepolia network!`,
    );
    handleCopyPrivateKey(privateKey, -1);
  };

  // Only show in development or testnet
  const isTestEnvironment =
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_CHAIN_ID === "11155420"; // OP Sepolia

  if (!isTestEnvironment) return null;

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white p-4 rounded-full shadow-2xl z-50 transition-transform hover:scale-110"
        title="Test Account Switcher"
      >
        <Users className="w-6 h-6" />
      </button>

      {/* Current Account Badge */}
      {currentAccount && (
        <div className="fixed bottom-20 right-4 bg-white rounded-lg shadow-lg p-3 z-50 border-2 border-purple-200">
          <div className="text-xs text-slate-500 mb-1">Active Test Account:</div>
          <div className="font-semibold text-purple-700 text-sm">{currentAccount.role}</div>
          <div className="text-xs font-mono text-slate-600">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
        </div>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 flex justify-between items-center rounded-t-2xl">
              <div>
                <h2 className="text-2xl font-bold mb-1">Test Account Manager</h2>
                <p className="text-purple-100 text-sm">Switch between Anvil test accounts on OP Sepolia</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {/* Current Account Alert */}
              {currentAccount && (
                <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                      ✓
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-green-900 mb-1">Currently Connected</p>
                      <p className="text-sm text-green-700">
                        <strong>{currentAccount.role}</strong> - {currentAccount.description}
                      </p>
                      <p className="text-xs font-mono text-green-600 mt-1">{address}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Warning */}
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">⚠️</div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900 mb-1">Testing Accounts Only</p>
                    <ul className="text-xs text-amber-800 space-y-1">
                      <li>✓ These are Anvil&apos;s well-known test accounts</li>
                      <li>✓ Safe to use on OP Sepolia testnet</li>
                      <li>
                        ✗ <strong>NEVER</strong> use these private keys on mainnet
                      </li>
                      <li>
                        ✗ <strong>DO NOT</strong> send real funds to these addresses
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Quick Import Instructions */}
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 mb-6">
                <h3 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Quick Setup Guide
                </h3>
                <ol className="text-sm text-indigo-800 space-y-1 list-decimal list-inside">
                  <li>Click &quot;Import to MetaMask&quot; on any account below</li>
                  <li>Follow the popup instructions to import the account</li>
                  <li>Switch to that account in MetaMask</li>
                  <li>Refresh this page to see the change</li>
                  <li>Your admin should whitelist these accounts first!</li>
                </ol>
              </div>

              {/* Account Grid */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800 text-lg mb-3">Available Test Accounts</h3>

                {TEST_ACCOUNTS.map((account, index) => {
                  const isActive = address?.toLowerCase() === account.address.toLowerCase();

                  return (
                    <div
                      key={account.address}
                      className={`p-4 border-2 rounded-xl transition-all ${
                        isActive
                          ? "border-purple-500 bg-purple-50 shadow-lg"
                          : "border-slate-200 hover:border-indigo-300 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-700">#{index}</span>
                            <span
                              className={`text-sm font-semibold ${
                                isActive ? "text-purple-700" : "text-slate-800"
                              }`}
                            >
                              {account.role}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full">Active</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mb-2">{account.description}</p>
                          <p className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                            {account.address}
                          </p>
                        </div>
                      </div>

                      {!isActive && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleImportToMetaMask(account.privateKey, account.role)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Import to MetaMask
                          </button>
                          <button
                            onClick={() => handleCopyPrivateKey(account.privateKey, index)}
                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 p-2 rounded-lg transition-colors"
                            title="Copy private key"
                          >
                            {copiedIndex === index ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}

                      {/* Private Key Reveal */}
                      <details className="mt-3">
                        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 font-medium">
                          Show Private Key
                        </summary>
                        <div className="mt-2 p-2 bg-slate-900 rounded-lg">
                          <p className="text-xs font-mono text-green-400 break-all">{account.privateKey}</p>
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>

              {/* Network Reminder */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>📡 Network:</strong> Make sure MetaMask is set to <strong>OP Sepolia</strong> testnet before
                  importing accounts!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}