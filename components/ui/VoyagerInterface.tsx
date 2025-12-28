"use client";

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Terminal, Activity } from 'lucide-react';
import { UserMessage, AssistantMessage, AstronautState } from '@/components/chat';

// Extract memories when session ends
const triggerExtraction = async (messages: UIMessage[]) => {
  if (messages.length < 2) return;

  // Convert UIMessage to simple format
  const simpleMessages = messages.map((m) => {
    let content = '';
    if (Array.isArray(m.parts)) {
      content = m.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
    }
    return { role: m.role as 'user' | 'assistant', content };
  }).filter((m) => m.content.length > 0);

  if (simpleMessages.length < 2) return;

  try {
    // Fire and forget - don't block
    fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: simpleMessages }),
      // Use keepalive to ensure request completes even if page closes
      keepalive: true,
    });
    console.log('[Voyager] Triggered memory extraction');
  } catch (error) {
    console.error('[Voyager] Extraction trigger failed:', error);
  }
};

interface VoyagerInterfaceProps {
  className?: string;
}

const COMMAND_HINTS = ['/catch-up', '/standup', '/draft', '/wrap'];

// Create a transport that communicates with our API
const transport = new DefaultChatTransport({
  api: '/api/chat',
});

export const VoyagerInterface = ({ className }: VoyagerInterfaceProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  const { messages, sendMessage, status, error } = useChat({
    transport,
  });

  // Derived state for loading
  const isLoading = status === 'submitted' || status === 'streaming';
  const isStreaming = status === 'streaming';

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Track if we've already extracted for this session
  const extractedRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Trigger extraction when user leaves (visibility change or beforeunload)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !extractedRef.current && messagesRef.current.length >= 2) {
        extractedRef.current = true;
        triggerExtraction(messagesRef.current);
      }
    };

    const handleBeforeUnload = () => {
      if (!extractedRef.current && messagesRef.current.length >= 2) {
        extractedRef.current = true;
        triggerExtraction(messagesRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // State for wrap command feedback
  const [wrapMessage, setWrapMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    // Handle /wrap command - end session and extract
    if (trimmed.toLowerCase() === '/wrap') {
      setInputValue('');
      if (messages.length >= 2 && !extractedRef.current) {
        extractedRef.current = true;
        triggerExtraction(messages);
        setWrapMessage('Session wrapped. Memories are being saved...');
        setTimeout(() => setWrapMessage(null), 3000);
      } else if (messages.length < 2) {
        setWrapMessage('Nothing to wrap yet - have a conversation first.');
        setTimeout(() => setWrapMessage(null), 3000);
      } else {
        setWrapMessage('Already wrapped this session.');
        setTimeout(() => setWrapMessage(null), 3000);
      }
      return;
    }

    sendMessage({ text: trimmed });
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isLoading) {
        sendMessage({ text: inputValue.trim() });
        setInputValue('');
      }
    }
  };

  const handleCommandClick = (command: string) => {
    setInputValue(command);
  };

  // Helper to extract text content from UIMessage
  const getMessageText = (message: UIMessage): string => {
    // In AI SDK v6, UIMessage has a 'parts' array
    if (Array.isArray(message.parts)) {
      return message.parts
        .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
        .map(part => part.text)
        .join('');
    }
    return '';
  };

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
              <span className="opacity-50 font-semibold">$CTX:</span> VOYAGER_V2
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-green-500/80 font-bold tracking-widest uppercase">
          <Activity size={10} className="animate-pulse" />
          <span>System Online</span>
        </div>
      </div>

      {/* THE STREAM */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-12 pb-48">

        {/* Welcome state when no messages */}
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AstronautState state="idle" size="lg" />
            <div className="mt-6 space-y-2">
              <h2 className="text-lg text-slate-300 font-bold">Welcome to Voyager</h2>
              <p className="text-slate-500 text-sm max-w-md">
                Your collaboration co-pilot. Ask me anything about your projects,
                request catch-ups, or draft responses.
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message: UIMessage, index: number) => {
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          const content = getMessageText(message);

          if (message.role === 'user') {
            return (
              <UserMessage
                key={message.id}
                content={content}
                timestamp={timestamp}
                username="you"
              />
            );
          }

          if (message.role === 'assistant') {
            const isCurrentlyStreaming = isStreaming && index === messages.length - 1;
            return (
              <AssistantMessage
                key={message.id}
                content={content}
                timestamp={timestamp}
                isStreaming={isCurrentlyStreaming}
              />
            );
          }

          return null;
        })}

        {/* Loading state (before first token) */}
        {status === 'submitted' && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-indigo-500/50 text-[10px] font-bold tracking-widest">
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <AstronautState state="searching" size="md" />
                <div className="flex flex-col">
                  <span className="text-indigo-400 text-xs font-bold animate-pulse">
                    THINKING...
                  </span>
                  <span className="text-slate-600 text-[10px]">
                    Processing your request
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-red-500/50 text-[10px] font-bold tracking-widest">
              ERR
            </div>
            <div className="flex-1">
              <div className="text-red-400 text-sm p-3 border border-red-500/30 bg-red-500/10 rounded-sm">
                {error.message || 'An error occurred. Please try again.'}
              </div>
            </div>
          </div>
        )}

        {wrapMessage && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-green-500/50 text-[10px] font-bold tracking-widest">
              WRAP
            </div>
            <div className="flex-1">
              <div className="text-green-400 text-sm p-3 border border-green-500/30 bg-green-500/10 rounded-sm">
                {wrapMessage}
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT DECK */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505]/95 backdrop-blur border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {/* Command Hints */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            {COMMAND_HINTS.map(cmd => (
              <button
                key={cmd}
                type="button"
                onClick={() => handleCommandClick(cmd)}
                className="px-3 py-1 bg-white/5 border border-white/5 rounded text-xs text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition whitespace-nowrap font-mono"
              >
                {cmd}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-3 group">
            <span className="text-green-500 font-bold animate-pulse">&#10132;</span>
            <span className="text-indigo-400 text-xs font-bold">~/voyager</span>
            <div className="flex-1 relative">
              <input
                type="text"
                className="w-full bg-transparent border-none outline-none text-slate-200 placeholder-slate-700 font-mono text-sm h-6"
                placeholder={isLoading ? "Voyager is thinking..." : "Type a message..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoFocus
              />
            </div>
            {inputValue.trim() && !isLoading && (
              <button
                type="submit"
                className="text-indigo-400 text-xs font-bold hover:text-indigo-300 transition"
              >
                SEND
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
