// socchain/packages/nextjs/app/page.tsx
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Vote, Shield, Users, Award, CheckCircle, Settings } from 'lucide-react';

export default function GovernanceLanding() {
  const [activePhase, setActivePhase] = useState('election');

  const phases = [
    { id: 'register', name: 'Register', icon: Users, status: 'complete' as const },
    { id: 'nominations', name: 'Nominate', icon: Vote, status: 'complete' as const },
    { id: 'vetting', name: 'Vetting', icon: Shield, status: 'complete' as const },
    { id: 'election', name: 'Election', icon: Award, status: 'active' as const },
  ];

  const getStatusColor = (status: 'complete' | 'active' | 'upcoming') => {
    switch (status) {
      case 'complete': return 'bg-green-500';
      case 'active': return 'bg-indigo-500';
      default: return 'bg-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-slate-800 mb-4">
            Decentralized Democracy
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            A transparent, tamper-proof election system powered by blockchain
          </p>
        </div>

        <div className="max-w-4xl mx-auto mb-16">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-slate-800 mb-8 text-center">
              Election Progress
            </h2>
            
            <div className="flex items-center justify-between relative">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -translate-y-1/2 z-0">
                <div className="h-full bg-indigo-500 transition-all duration-500" style={{width: '75%'}}></div>
              </div>

              {phases.map((phase) => {
                const Icon = phase.icon;
                return (
                  <div key={phase.id} className="flex flex-col items-center relative z-10" style={{flex: 1}}>
                    <div className={`w-16 h-16 rounded-full ${getStatusColor(phase.status)} 
                      flex items-center justify-center mb-3 transition-all duration-300
                      ${phase.status === 'active' ? 'ring-4 ring-indigo-200 scale-110' : ''}`}>
                      {phase.status === 'complete' ? (
                        <CheckCircle className="w-8 h-8 text-white" />
                      ) : (
                        <Icon className="w-8 h-8 text-white" />
                      )}
                    </div>
                    <span className={`text-sm font-medium ${
                      phase.status === 'active' ? 'text-indigo-600 font-bold' : 'text-slate-600'
                    }`}>
                      {phase.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          <div className="bg-white rounded-2xl shadow-lg p-8 border-t-4 border-indigo-500">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">
                  Election Phase Active
                </h3>
                <p className="text-slate-600">
                  Voters: Cast your vote in the weighted lottery to select the winner
                </p>
              </div>
            </div>

            <div className="bg-indigo-50 rounded-xl p-6 mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold text-indigo-600">5</div>
                  <div className="text-sm text-slate-600">Candidates</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-indigo-600">245</div>
                  <div className="text-sm text-slate-600">Total Votes</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-indigo-600">2d 8h</div>
                  <div className="text-sm text-slate-600">Time Left</div>
                </div>
              </div>
            </div>

            <Link href="/election">
              <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold 
                py-4 rounded-xl transition-colors duration-200 shadow-md hover:shadow-lg">
                Join Election
              </button>
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-800 mb-8 text-center">
            How It Works
          </h2>
          
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: '1',
                title: 'Register',
                description: 'Verify your identity and stake ETH to participate',
                color: 'blue',
                link: '/Identity'
              },
              {
                step: '2',
                title: 'Nominate',
                description: 'Vote for candidates to advance to the vetting stage',
                color: 'purple',
                link: '/nominations'
              },
              {
                step: '3',
                title: 'Vet',
                description: 'Random jurors verify candidate integrity',
                color: 'indigo',
                link: '/vetting'
              },
              {
                step: '4',
                title: 'Elect',
                description: 'Final weighted lottery selects the winner',
                color: 'blue',
                link: '/election'
              }
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-shadow">
                <div className={`w-12 h-12 bg-${item.color}-100 rounded-full flex items-center 
                  justify-center mb-4 text-${item.color}-600 font-bold text-xl`}>
                  {item.step}
                </div>
                <h3 className="font-semibold text-slate-800 mb-2 text-lg">
                  {item.title}
                </h3>
                <p className="text-slate-600 text-sm">
                  {item.description}
                </p>
                {item.link && (
                  <Link href={item.link}>
                    <button className="mt-4 bg-transparent text-indigo-600 hover:text-indigo-800 text-sm font-medium underline">
                      Get Started
                    </button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-4xl mx-auto mt-16 text-center">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-2xl p-12 text-white">
            <h2 className="text-3xl font-bold mb-4">
              Join the Democratic Revolution
            </h2>
            <p className="text-indigo-100 mb-8 text-lg">
              Be part of a transparent, decentralized governance system
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/Identity">
                <button className="bg-white text-indigo-600 font-semibold px-8 py-3 rounded-xl 
                  hover:bg-indigo-50 transition-colors shadow-lg">
                  Register as Voter
                </button>
              </Link>
              <Link href="/nominations">
                <button className="bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl 
                  hover:bg-indigo-800 transition-colors border-2 border-indigo-400 mr-2">
                  Nominate Candidates
                </button>
              </Link>
              <Link href="/vetting">
                <button className="bg-purple-700 text-white font-semibold px-8 py-3 rounded-xl 
                  hover:bg-purple-800 transition-colors border-2 border-purple-400">
                  Join Vetting
                </button>
              </Link>
              <Link href="/election">
                <button className="bg-yellow-700 text-white font-semibold px-8 py-3 rounded-xl 
                  hover:bg-yellow-800 transition-colors border-2 border-yellow-400">
                  Vote in Election
                </button>
              </Link>
              <Link href="/admin">
                <button className="bg-red-700 text-white font-semibold px-8 py-3 rounded-xl 
                  hover:bg-red-800 transition-colors border-2 border-red-400">
                  Admin Panel
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}