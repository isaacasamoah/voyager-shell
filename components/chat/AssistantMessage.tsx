"use client";

import React from 'react';
import { AstronautState } from './AstronautState';

interface AssistantMessageProps {
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
}

export const AssistantMessage = ({
  content,
  timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  isStreaming = false
}: AssistantMessageProps) => {
  return (
    <div className="flex gap-4">
      <div className="w-12 pt-1 text-right text-indigo-500/50 text-[10px] font-bold tracking-widest">
        {timestamp}
      </div>
      <div className="flex-1 space-y-4">
        <div className="relative pl-2">
          <div className="flex items-center gap-4 mb-4">
            <AstronautState
              state={isStreaming ? 'searching' : 'success'}
              size="md"
            />
            <div className="flex flex-col">
              {isStreaming ? (
                <>
                  <span className="text-indigo-400 text-xs font-bold animate-pulse">
                    PROCESSING...
                  </span>
                  <span className="text-slate-600 text-[10px]">
                    Generating response
                  </span>
                </>
              ) : (
                <>
                  <span className="text-green-400 text-xs font-bold">
                    VOYAGER
                  </span>
                  <span className="text-slate-600 text-[10px]">
                    Response complete
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Response Content */}
          <div className="ml-0 pl-4 border-l border-indigo-500/20">
            <div className="text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">
              {content}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-indigo-400 ml-1 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
