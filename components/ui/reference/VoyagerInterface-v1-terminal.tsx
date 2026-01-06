"use client";

import React, { useState } from 'react';
import { Terminal, Check, X, Edit2, Search, Activity } from 'lucide-react';

// Astronaut assets
const ASSETS = {
  astroTracer: "/images/astronaut/searching.png", // The "Searching" Astronaut
  astroTick: "/images/astronaut/success.png",     // The "Success" Astronaut
};

interface VoyagerInterfaceProps {
  className?: string;
}

export const VoyagerInterface = ({ className }: VoyagerInterfaceProps) => {
  const [inputValue, setInputValue] = useState("");

  return (
    <div className={`min-h-screen bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 overflow-hidden relative ${className || ''}`}>

      {/* SVG FILTERS (The "Terminal Look" Engine) */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="terminal-dither">
            {/* Convert to grayscale */}
            <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0" />
            {/* Add noise/texture */}
            <feTurbulence type="fractalNoise" baseFrequency="0.80" numOctaves="3" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.2 0" in="noise" result="coloredNoise" />
            <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite" />
            <feBlend mode="multiply" in="composite" in2="SourceGraphic" />
          </filter>
        </defs>
      </svg>

      {/* CONTEXT BAR */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#050505]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-indigo-400 group cursor-pointer">
            <Terminal size={16} className="group-hover:text-indigo-300 transition-colors" />
            <span className="font-bold tracking-wider group-hover:underline decoration-indigo-500/30 underline-offset-4">VOYAGER_SHELL</span>
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-1"></div>

          {/* Context Chips */}
          <div className="flex gap-2">
            <div className="px-2 py-1 rounded-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-indigo-500/20 transition shadow-[0_0_10px_rgba(99,102,241,0.1)]">
              <span className="opacity-50 font-semibold">$CTX:</span> PROJECT_X
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-green-500/80 font-bold tracking-widest uppercase">
          <Activity size={10} className="animate-pulse" />
          <span>System Online</span>
        </div>
      </div>

      {/* THE STREAM */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-12 pb-32">

        {/* User Message */}
        <div className="flex gap-4 opacity-80 hover:opacity-100 transition-opacity">
          <div className="w-12 pt-1 text-right text-slate-600 text-[10px] font-bold tracking-widest">14:02</div>
          <div className="flex-1">
            <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">sarah_k</div>
            <div className="text-slate-200 leading-relaxed">
              Why did we settle on $79 for the Pro tier? I thought we discussed $99 in the strategy sync.
            </div>
          </div>
        </div>

        {/* VOYAGER: GRAPH TRAVERSAL */}
        <div className="flex gap-4">
          <div className="w-12 pt-1 text-right text-indigo-500/50 text-[10px] font-bold tracking-widest">14:02</div>
          <div className="flex-1 space-y-6">

            {/* ASTRONAUT: SEARCHING */}
            <div className="relative pl-2">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative w-16 h-16 grayscale opacity-90 mix-blend-screen">
                   <img
                    src={ASSETS.astroTracer}
                    alt="Voyager Searching"
                    className="w-full h-full object-contain"
                    style={{ filter: 'url(#terminal-dither) contrast(1.2)' }}
                   />
                </div>
                <div className="flex flex-col">
                  <span className="text-indigo-400 text-xs font-bold animate-pulse">TRAVERSING KNOWLEDGE GRAPH...</span>
                  <span className="text-slate-600 text-[10px]">Querying decision vectors &amp; history</span>
                </div>
              </div>

              {/* TRACER VISUALIZATION */}
              <div className="relative pl-4 ml-8 border-l border-indigo-500/20 space-y-6">

                {/* Step 1 */}
                <div className="relative group cursor-pointer">
                  <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#050505] border-2 border-slate-700 group-hover:border-indigo-500 transition-colors"></div>
                  <div className="text-xs text-slate-500">
                    Accessed <span className="text-slate-400">#strategy-sync</span> logs (Nov 12)
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative group cursor-pointer">
                  <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#050505] border-2 border-slate-700 group-hover:border-indigo-500 transition-colors"></div>
                  <div className="text-xs text-slate-500 flex flex-col">
                    <span>Found Document: <span className="text-indigo-300 hover:underline">Market Analysis &apos;24</span></span>
                    <span className="text-slate-600 text-[10px] mt-0.5">&ldquo;Competitor Y dropped to $85&rdquo;</span>
                  </div>
                </div>

                {/* Step 3 (Result) */}
                <div className="relative group cursor-pointer">
                  <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                  <div className="text-xs text-green-400 font-bold mb-1">DECISION FOUND</div>
                  <div className="text-slate-300 bg-white/5 p-3 rounded-sm border-l-2 border-green-500/50 text-xs">
                    &ldquo;Jake approved $79 to aggressively undercut Competitor Y.&rdquo;
                  </div>
                </div>
              </div>
            </div>

            {/* ASTRONAUT: GREEN TICK (The Action) */}
            <div className="mt-8 relative group">
              {/* Background Glow */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded blur opacity-20 group-hover:opacity-40 transition duration-500"></div>

              <div className="relative bg-[#0A0A0A] border border-white/10 rounded overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                  <span className="text-xs text-indigo-300 font-bold flex items-center gap-2">
                    <Edit2 size={12} /> DRAFT_RESPONSE_v1
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">AUTOSAVE: 14:02:05</span>
                </div>

                {/* Body Content */}
                <div className="flex">
                  {/* Left: The Astronaut holding the tick */}
                  <div className="w-24 bg-white/5 border-r border-white/5 flex items-end justify-center p-2 relative overflow-hidden">
                     <img
                      src={ASSETS.astroTick}
                      alt="Voyager Approved"
                      className="w-20 h-20 object-contain animate-[bounce_4s_infinite]"
                      style={{ filter: 'url(#terminal-dither) contrast(1.1)' }}
                     />
                  </div>

                  {/* Right: The Text */}
                  <div className="p-4 flex-1">
                    <p className="text-slate-300 leading-relaxed text-sm">
                      <span className="text-indigo-400 font-bold">@sarah_k</span> We pivoted to <span className="text-green-400 font-bold">$79</span> on Nov 12 to beat Competitor Y. Jake signed off on it here: <span className="underline decoration-slate-700 hover:text-indigo-300 cursor-pointer">[DEC-402]</span>
                    </p>
                  </div>
                </div>

                {/* Footer / Actions */}
                <div className="grid grid-cols-3 border-t border-white/10 divide-x divide-white/10 bg-[#080808]">
                  <button className="flex items-center justify-center gap-2 py-3 text-xs text-slate-500 hover:bg-red-900/10 hover:text-red-400 transition">
                    <X size={14} />
                    <span>Discard</span>
                  </button>
                  <button className="flex items-center justify-center gap-2 py-3 text-xs text-slate-500 hover:bg-white/5 hover:text-white transition">
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                  <button className="flex items-center justify-center gap-2 py-3 text-xs bg-green-900/20 text-green-400 hover:bg-green-500 hover:text-black transition font-bold tracking-wide">
                    <Check size={14} strokeWidth={3} />
                    <span>APPROVE</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* INPUT DECK */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505]/95 backdrop-blur border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {/* Command Hints */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
             {['/catch-up', '/standup', '/draft'].map(cmd => (
               <button key={cmd} className="px-3 py-1 bg-white/5 border border-white/5 rounded text-xs text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition whitespace-nowrap font-mono">
                 {cmd}
               </button>
             ))}
          </div>

          <div className="flex items-center gap-3 group">
            <span className="text-green-500 font-bold animate-pulse">➜</span>
            <span className="text-indigo-400 text-xs font-bold">~/project-x</span>
            <div className="flex-1 relative">
              <input
                type="text"
                className="w-full bg-transparent border-none outline-none text-slate-200 placeholder-slate-700 font-mono text-sm h-6"
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
