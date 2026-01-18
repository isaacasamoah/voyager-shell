"use client";

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AstronautState } from './AstronautState';
import { ComponentRenderer } from '@/components/ui/composition';
import type { InlineComponent } from '@/lib/ui/components';

// Message parts - text or component
export interface MessagePart {
  type: 'text' | 'component'
  text?: string
  component?: InlineComponent
}

interface AssistantMessageProps {
  // Simple string for backwards compatibility
  content?: string;
  // Rich parts for mixed content
  parts?: MessagePart[];
  timestamp?: string;
  isStreaming?: boolean;
  onAction?: (action: string, data?: unknown) => void;
}

export const AssistantMessage = ({
  content,
  parts,
  timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  isStreaming = false,
  onAction,
}: AssistantMessageProps) => {
  // Normalize to parts array
  const messageParts: MessagePart[] = parts ?? (content ? [{ type: 'text', text: content }] : []);

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
            <div className="text-slate-300 leading-relaxed text-sm prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:text-slate-200 prose-headings:font-bold prose-code:text-indigo-300 prose-code:bg-slate-800/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-a:text-indigo-400 prose-strong:text-slate-200 prose-ul:my-2 prose-ol:my-2 prose-li:my-0 space-y-3">
              {messageParts.map((part, i) =>
                part.type === 'text' && part.text ? (
                  <ReactMarkdown key={i}>{part.text}</ReactMarkdown>
                ) : part.type === 'component' && part.component ? (
                  <div key={i} className="not-prose my-3">
                    <ComponentRenderer
                      component={part.component}
                      onAction={onAction}
                    />
                  </div>
                ) : null
              )}
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
