"use client";

import React, { useRef, useEffect, useState, useMemo } from 'react';
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

const COMMAND_HINTS = ['/catch-up', '/standup', '/draft', '/wrap', '/new', '/resume'];

// API response types
interface ConversationData {
  id: string;
  title: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

interface ConversationResponse {
  conversation: ConversationData;
  messages: MessageData[];
}

interface ResumableConversation {
  id: string;
  title: string | null;
  status: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  preview: string | null;
}

interface ResumableResponse {
  conversations: ResumableConversation[];
}

// Convert API message to UIMessage format for useChat
const apiMessageToUIMessage = (msg: MessageData): UIMessage => ({
  id: msg.id,
  role: msg.role,
  parts: [{ type: 'text' as const, text: msg.content }],
});

export const VoyagerInterface = ({ className }: VoyagerInterfaceProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);

  // Resume picker state
  const [showResumePicker, setShowResumePicker] = useState(false);
  const [resumableConversations, setResumableConversations] = useState<ResumableConversation[]>([]);
  const [isLoadingResumable, setIsLoadingResumable] = useState(false);

  // Ref to track current conversationId for the transport
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  // Create transport with dynamic body that reads current conversationId
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({ conversationId: conversationIdRef.current }),
  }), []);

  // useChat with transport
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });

  // Auto-continue: fetch active conversation on mount
  useEffect(() => {
    const fetchActiveConversation = async () => {
      try {
        const res = await fetch('/api/conversation');
        if (!res.ok) throw new Error('Failed to fetch conversation');

        const data: ConversationResponse = await res.json();
        setConversationId(data.conversation.id);
        setConversationTitle(data.conversation.title);

        // Hydrate messages if any exist
        if (data.messages.length > 0) {
          const uiMessages = data.messages.map(apiMessageToUIMessage);
          setMessages(uiMessages);
        }

        console.log('[Voyager] Loaded conversation:', data.conversation.id);
      } catch (error) {
        console.error('[Voyager] Failed to fetch conversation:', error);
      } finally {
        setIsLoadingConversation(false);
      }
    };

    fetchActiveConversation();
  }, [setMessages]);

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

  // Handle /new command - create new conversation
  const handleNewConversation = async () => {
    try {
      // Trigger extraction for current conversation before creating new
      if (messages.length >= 2 && !extractedRef.current) {
        extractedRef.current = true;
        triggerExtraction(messages);
      }

      const res = await fetch('/api/conversation', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create new conversation');

      const data: ConversationResponse = await res.json();
      setConversationId(data.conversation.id);
      setConversationTitle(data.conversation.title);
      setMessages([]);
      extractedRef.current = false; // Reset extraction flag for new conversation

      setWrapMessage('New conversation started.');
      setTimeout(() => setWrapMessage(null), 2000);
      console.log('[Voyager] Created new conversation:', data.conversation.id);
    } catch (error) {
      console.error('[Voyager] Failed to create new conversation:', error);
      setWrapMessage('Failed to start new conversation.');
      setTimeout(() => setWrapMessage(null), 3000);
    }
  };

  // Handle /resume command - show picker or resume specific conversation
  const handleResume = async () => {
    setIsLoadingResumable(true);
    setShowResumePicker(true);

    try {
      const res = await fetch('/api/conversation/resume?limit=10');
      if (!res.ok) throw new Error('Failed to fetch resumable conversations');

      const data: ResumableResponse = await res.json();
      setResumableConversations(data.conversations);
    } catch (error) {
      console.error('[Voyager] Failed to fetch resumable conversations:', error);
      setWrapMessage('Failed to load conversations.');
      setTimeout(() => setWrapMessage(null), 3000);
      setShowResumePicker(false);
    } finally {
      setIsLoadingResumable(false);
    }
  };

  // Resume a specific conversation
  const handleResumeConversation = async (targetId: string) => {
    try {
      // Trigger extraction for current conversation before resuming
      if (messages.length >= 2 && !extractedRef.current) {
        extractedRef.current = true;
        triggerExtraction(messages);
      }

      const res = await fetch('/api/conversation/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: targetId }),
      });

      if (!res.ok) throw new Error('Failed to resume conversation');

      const data: ConversationResponse = await res.json();
      setConversationId(data.conversation.id);
      setConversationTitle(data.conversation.title);

      // Hydrate messages
      if (data.messages.length > 0) {
        const uiMessages = data.messages.map(apiMessageToUIMessage);
        setMessages(uiMessages);
      } else {
        setMessages([]);
      }

      extractedRef.current = false; // Reset extraction flag
      setShowResumePicker(false);
      console.log('[Voyager] Resumed conversation:', data.conversation.id);
    } catch (error) {
      console.error('[Voyager] Failed to resume conversation:', error);
      setWrapMessage('Failed to resume conversation.');
      setTimeout(() => setWrapMessage(null), 3000);
    }
  };

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

    // Handle /new command - start new conversation
    if (trimmed.toLowerCase() === '/new') {
      setInputValue('');
      handleNewConversation();
      return;
    }

    // Handle /resume command - show conversation picker
    if (trimmed.toLowerCase() === '/resume') {
      setInputValue('');
      handleResume();
      return;
    }

    if (!conversationId) {
      console.error('[Voyager] Cannot send - no conversation loaded');
      return;
    }
    sendMessage({ text: trimmed });
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isLoading && conversationId) {
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
              <span className="opacity-50 font-semibold">$CTX:</span> {conversationTitle || 'VOYAGER_V2'}
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

        {/* Loading conversation state */}
        {isLoadingConversation && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AstronautState state="searching" size="lg" />
            <div className="mt-6 space-y-2">
              <h2 className="text-lg text-slate-400 font-bold animate-pulse">Loading...</h2>
              <p className="text-slate-600 text-sm">
                Fetching your conversation
              </p>
            </div>
          </div>
        )}

        {/* Welcome state when no messages */}
        {!isLoadingConversation && messages.length === 0 && !isLoading && (
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
              SYS
            </div>
            <div className="flex-1">
              <div className="text-green-400 text-sm p-3 border border-green-500/30 bg-green-500/10 rounded-sm">
                {wrapMessage}
              </div>
            </div>
          </div>
        )}

        {/* Resume Picker */}
        {showResumePicker && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-indigo-500/50 text-[10px] font-bold tracking-widest">
              PICK
            </div>
            <div className="flex-1">
              <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-indigo-500/20 flex items-center justify-between">
                  <span className="text-indigo-300 text-xs font-bold">Select conversation to resume</span>
                  <button
                    type="button"
                    onClick={() => setShowResumePicker(false)}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    [ESC]
                  </button>
                </div>
                {isLoadingResumable ? (
                  <div className="px-3 py-4 text-slate-500 text-xs">Loading conversations...</div>
                ) : resumableConversations.length === 0 ? (
                  <div className="px-3 py-4 text-slate-500 text-xs">No previous conversations found.</div>
                ) : (
                  <div className="divide-y divide-indigo-500/10 max-h-64 overflow-y-auto">
                    {resumableConversations.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => handleResumeConversation(conv.id)}
                        className="w-full px-3 py-2 text-left hover:bg-indigo-500/10 transition-colors"
                      >
                        <div className="text-slate-300 text-sm">
                          {conv.title || 'Untitled conversation'}
                        </div>
                        {conv.preview && (
                          <div className="text-slate-500 text-xs mt-0.5 truncate">
                            {conv.preview}
                          </div>
                        )}
                        <div className="text-slate-600 text-[10px] mt-1">
                          {conv.messageCount} messages - {new Date(conv.lastMessageAt).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
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
