"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Terminal, Activity, Ship, Users, Link2 } from 'lucide-react';
import { UserMessage, AssistantMessage, AstronautState } from '@/components/chat';
import { useAuth } from '@/lib/auth/context';

// Voyage types
interface VoyageMembership {
  id: string;
  slug: string;
  name: string;
  role: 'captain' | 'navigator' | 'crew' | 'observer';
  joinedAt: string;
}

interface VoyageDetails {
  id: string;
  slug: string;
  name: string;
  inviteCode?: string;
  inviteUrl?: string;
}

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

// Command hints change based on auth state
const AUTH_COMMANDS = ['/sign-up', '/login'];
const USER_COMMANDS = ['/catch-up', '/draft', '/wrap', '/new', '/resume', '/voyages', '/logout'];

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Auth state
  const { user, isAuthenticated, isLoading: isAuthLoading, sendMagicLink, signOut } = useAuth();

  // Auth UI state
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authMessageType, setAuthMessageType] = useState<'info' | 'success' | 'error'>('info');
  const [isAwaitingMagicLink, setIsAwaitingMagicLink] = useState(false);
  const wasAuthenticatedRef = useRef(isAuthenticated);

  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);

  // Message queue - type while Voyager is thinking
  const [messageQueue, setMessageQueue] = useState<string[]>([]);

  // Resume picker state
  const [showResumePicker, setShowResumePicker] = useState(false);
  const [resumableConversations, setResumableConversations] = useState<ResumableConversation[]>([]);
  const [isLoadingResumable, setIsLoadingResumable] = useState(false);

  // Voyage state
  const [currentVoyage, setCurrentVoyage] = useState<VoyageMembership | null>(null);
  const [voyages, setVoyages] = useState<VoyageMembership[]>([]);
  const [showVoyagePicker, setShowVoyagePicker] = useState(false);
  const [isLoadingVoyages, setIsLoadingVoyages] = useState(false);
  const [showCreateVoyage, setShowCreateVoyage] = useState(false);
  const [newVoyageName, setNewVoyageName] = useState('');
  const [isCreatingVoyage, setIsCreatingVoyage] = useState(false);
  const [voyageInvite, setVoyageInvite] = useState<{ code: string; url: string } | null>(null);

  // Refs to track current state for the transport
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const voyageSlugRef = useRef<string | null>(null);
  voyageSlugRef.current = currentVoyage?.slug ?? null;

  // Create transport with dynamic body that reads current conversationId and voyage
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({
      conversationId: conversationIdRef.current,
      voyageSlug: voyageSlugRef.current,
    }),
  }), []);

  // useChat with transport
  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  });

  // Auto-continue: fetch active conversation on mount and when voyage changes
  useEffect(() => {
    // Don't fetch if not authenticated or still loading auth
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setIsLoadingConversation(false);
      return;
    }

    const fetchActiveConversation = async () => {
      try {
        const voyageSlug = currentVoyage?.slug;
        const url = voyageSlug
          ? `/api/conversation?voyageSlug=${encodeURIComponent(voyageSlug)}`
          : '/api/conversation';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch conversation');

        const data: ConversationResponse = await res.json();
        setConversationId(data.conversation.id);
        setConversationTitle(data.conversation.title);

        // Hydrate messages if any exist
        if (data.messages.length > 0) {
          const uiMessages = data.messages.map(apiMessageToUIMessage);
          setMessages(uiMessages);
        } else {
          setMessages([]);
        }

        console.log('[Voyager] Loaded conversation:', data.conversation.id, 'voyage:', voyageSlug ?? 'personal');
      } catch (error) {
        console.error('[Voyager] Failed to fetch conversation:', error);
      } finally {
        setIsLoadingConversation(false);
      }
    };

    fetchActiveConversation();
  }, [setMessages, isAuthenticated, isAuthLoading, currentVoyage?.slug]);

  // Detect when user just logged in (after magic link)
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && !wasAuthenticatedRef.current) {
      // User just became authenticated
      setAuthMessage(`Welcome${user?.email ? `, ${user.email.split('@')[0]}` : ''}! You're now logged in.`);
      setAuthMessageType('success');
      // Clear after 5 seconds
      setTimeout(() => setAuthMessage(null), 5000);
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, isAuthLoading, user?.email]);

  // Fetch voyages when authenticated
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;

    const fetchVoyages = async () => {
      try {
        const res = await fetch('/api/voyages');
        if (!res.ok) return;

        const data = await res.json();
        setVoyages(data.voyages || []);

        // Check for pending invite from join page
        const pendingInvite = localStorage.getItem('pendingInvite');
        if (pendingInvite) {
          localStorage.removeItem('pendingInvite');
          // Join the voyage
          const joinRes = await fetch(`/api/voyages/join/${pendingInvite}`, { method: 'POST' });
          if (joinRes.ok) {
            const joinData = await joinRes.json();
            // Refresh voyages and switch to the new one
            const refreshRes = await fetch('/api/voyages');
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              setVoyages(refreshData.voyages || []);
              const joined = refreshData.voyages?.find((v: VoyageMembership) => v.slug === joinData.voyage.slug);
              if (joined) {
                setCurrentVoyage(joined);
                setWrapMessage(joinData.alreadyMember
                  ? `You're already a member of ${joinData.voyage.name}!`
                  : `Welcome to ${joinData.voyage.name}!`);
                setTimeout(() => setWrapMessage(null), 3000);
              }
            }
          }
        }

        // Check URL for voyage param
        const urlParams = new URLSearchParams(window.location.search);
        const voyageSlug = urlParams.get('voyage');
        if (voyageSlug && data.voyages) {
          const voyage = data.voyages.find((v: VoyageMembership) => v.slug === voyageSlug);
          if (voyage) {
            setCurrentVoyage(voyage);
          }
        }
      } catch (error) {
        console.error('[Voyager] Failed to fetch voyages:', error);
      }
    };

    fetchVoyages();
  }, [isAuthenticated, isAuthLoading]);

  // Derived state for loading
  const isLoading = status === 'submitted' || status === 'streaming';
  const isStreaming = status === 'streaming';

  // Process queued messages when Voyager finishes responding
  useEffect(() => {
    if (!isLoading && messageQueue.length > 0 && conversationId) {
      const nextMessage = messageQueue[0];
      setMessageQueue(prev => prev.slice(1));
      // Small delay to let the UI settle
      setTimeout(() => {
        sendMessage({ text: nextMessage });
      }, 100);
    }
  }, [isLoading, messageQueue, conversationId, sendMessage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  // Keep input always focused - ready to type from anywhere
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current && !isLoading) {
        inputRef.current.focus();
      }
    };

    // Focus on mount and after messages change
    focusInput();

    // Re-focus when clicking anywhere in the document (except other inputs)
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't steal focus if user has selected text (they might want to copy)
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON') {
        focusInput();
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [messages, isLoading, status]);

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

      const res = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voyageSlug: currentVoyage?.slug }),
      });
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
      const voyageSlug = currentVoyage?.slug;
      const url = voyageSlug
        ? `/api/conversation/resume?limit=10&voyageSlug=${encodeURIComponent(voyageSlug)}`
        : '/api/conversation/resume?limit=10';
      const res = await fetch(url);
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

  // Handle /sign-up or /login command - show email input
  const handleAuthCommand = useCallback((command: 'sign-up' | 'login') => {
    setShowEmailInput(true);
    setAuthMessage(command === 'sign-up'
      ? 'Enter your email to get started:'
      : 'Enter your email to log in:');
    setAuthMessageType('info');
  }, []);

  // Handle email submission for magic link
  const handleEmailSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      setAuthMessage('Please enter a valid email address.');
      return;
    }

    setIsAwaitingMagicLink(true);
    setAuthMessage('Sending magic link...');
    setAuthMessageType('info');

    const result = await sendMagicLink(email);

    if (result.success) {
      setAuthMessage(`Magic link sent to ${email}. Check your inbox!`);
      setAuthMessageType('success');
      setShowEmailInput(false);
      setEmailInput('');
      setIsAwaitingMagicLink(false);
    } else {
      setAuthMessage(result.error || 'Failed to send magic link. Please try again.');
      setAuthMessageType('error');
      setIsAwaitingMagicLink(false);
    }
  }, [emailInput, sendMagicLink]);

  // Handle /logout command
  const handleLogout = useCallback(async () => {
    // Trigger extraction for current conversation before logging out
    if (messages.length >= 2 && !extractedRef.current) {
      extractedRef.current = true;
      triggerExtraction(messages);
    }

    await signOut();
    setConversationId(null);
    setConversationTitle(null);
    setMessages([]);
    setAuthMessage('You\'ve been logged out. See you next time!');
    setIsAwaitingMagicLink(false);
    setTimeout(() => setAuthMessage(null), 3000);
  }, [messages, signOut, setMessages]);

  // Cancel email input
  const handleCancelEmailInput = useCallback(() => {
    setShowEmailInput(false);
    setEmailInput('');
    setAuthMessage(null);
  }, []);

  // Handle /voyages command - show voyage picker
  const handleVoyagesCommand = useCallback(async () => {
    setIsLoadingVoyages(true);
    setShowVoyagePicker(true);

    try {
      const res = await fetch('/api/voyages');
      if (!res.ok) throw new Error('Failed to fetch voyages');

      const data = await res.json();
      setVoyages(data.voyages || []);
    } catch (error) {
      console.error('[Voyager] Failed to fetch voyages:', error);
      setWrapMessage('Failed to load voyages.');
      setTimeout(() => setWrapMessage(null), 3000);
      setShowVoyagePicker(false);
    } finally {
      setIsLoadingVoyages(false);
    }
  }, []);

  // Handle /switch command - switch to a specific voyage
  const handleSwitchVoyage = useCallback((slug: string) => {
    if (slug === 'personal' || slug === '') {
      setCurrentVoyage(null);
      setShowVoyagePicker(false);
      setWrapMessage('Switched to Personal context.');
      setTimeout(() => setWrapMessage(null), 2000);
      return;
    }

    const voyage = voyages.find(v => v.slug === slug);
    if (voyage) {
      setCurrentVoyage(voyage);
      setShowVoyagePicker(false);
      setWrapMessage(`Switched to ${voyage.name}.`);
      setTimeout(() => setWrapMessage(null), 2000);
    } else {
      setWrapMessage(`Voyage "${slug}" not found.`);
      setTimeout(() => setWrapMessage(null), 3000);
    }
  }, [voyages]);

  // Handle /create-voyage command
  const handleCreateVoyageCommand = useCallback(() => {
    setShowCreateVoyage(true);
    setNewVoyageName('');
  }, []);

  // Submit new voyage creation
  const handleCreateVoyageSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newVoyageName.trim();
    if (!name) return;

    setIsCreatingVoyage(true);

    try {
      const res = await fetch('/api/voyages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();

      if (!res.ok) {
        setWrapMessage(data.error || 'Failed to create voyage.');
        setTimeout(() => setWrapMessage(null), 3000);
        return;
      }

      // Refresh voyages list
      const refreshRes = await fetch('/api/voyages');
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setVoyages(refreshData.voyages || []);

        // Switch to the new voyage
        const newVoyage = refreshData.voyages?.find((v: VoyageMembership) => v.slug === data.voyage.slug);
        if (newVoyage) {
          setCurrentVoyage(newVoyage);
        }
      }

      // Show invite link
      setVoyageInvite({
        code: data.voyage.inviteCode,
        url: data.voyage.inviteUrl,
      });

      setShowCreateVoyage(false);
      setNewVoyageName('');
      setWrapMessage(`Created ${data.voyage.name}! Share the invite link to add members.`);
      setTimeout(() => setWrapMessage(null), 5000);
    } catch (error) {
      console.error('[Voyager] Failed to create voyage:', error);
      setWrapMessage('Failed to create voyage.');
      setTimeout(() => setWrapMessage(null), 3000);
    } finally {
      setIsCreatingVoyage(false);
    }
  }, [newVoyageName]);

  // Handle /invite command - show invite link
  const handleInviteCommand = useCallback(async () => {
    if (!currentVoyage) {
      setWrapMessage('Switch to a voyage first with /voyages');
      setTimeout(() => setWrapMessage(null), 3000);
      return;
    }

    if (currentVoyage.role !== 'captain' && currentVoyage.role !== 'navigator') {
      setWrapMessage('Only captains and navigators can view invite links.');
      setTimeout(() => setWrapMessage(null), 3000);
      return;
    }

    try {
      const res = await fetch(`/api/voyages/${currentVoyage.slug}`);
      if (!res.ok) throw new Error('Failed to fetch voyage');

      const data = await res.json();
      if (data.voyage.inviteUrl) {
        setVoyageInvite({
          code: data.voyage.inviteCode,
          url: data.voyage.inviteUrl,
        });
      } else {
        setWrapMessage('No invite link available.');
        setTimeout(() => setWrapMessage(null), 3000);
      }
    } catch (error) {
      console.error('[Voyager] Failed to get invite:', error);
      setWrapMessage('Failed to get invite link.');
      setTimeout(() => setWrapMessage(null), 3000);
    }
  }, [currentVoyage]);

  // Cancel voyage creation
  const handleCancelCreateVoyage = useCallback(() => {
    setShowCreateVoyage(false);
    setNewVoyageName('');
  }, []);

  // Close invite display
  const handleCloseInvite = useCallback(() => {
    setVoyageInvite(null);
  }, []);

  // Copy invite link to clipboard
  const handleCopyInvite = useCallback(async () => {
    if (!voyageInvite) return;
    try {
      await navigator.clipboard.writeText(voyageInvite.url);
      setWrapMessage('Invite link copied!');
      setTimeout(() => setWrapMessage(null), 2000);
    } catch {
      setWrapMessage('Failed to copy.');
      setTimeout(() => setWrapMessage(null), 2000);
    }
  }, [voyageInvite]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

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

    // Handle /sign-up command
    if (trimmed.toLowerCase() === '/sign-up') {
      setInputValue('');
      handleAuthCommand('sign-up');
      return;
    }

    // Handle /login command
    if (trimmed.toLowerCase() === '/login') {
      setInputValue('');
      handleAuthCommand('login');
      return;
    }

    // Handle /logout command
    if (trimmed.toLowerCase() === '/logout') {
      setInputValue('');
      handleLogout();
      return;
    }

    // Handle /voyages command - show voyage picker
    if (trimmed.toLowerCase() === '/voyages') {
      setInputValue('');
      if (!isAuthenticated) {
        setAuthMessage('Please /sign-up or /login first.');
        setTimeout(() => setAuthMessage(null), 3000);
        return;
      }
      handleVoyagesCommand();
      return;
    }

    // Handle /switch command
    if (trimmed.toLowerCase().startsWith('/switch')) {
      setInputValue('');
      if (!isAuthenticated) {
        setAuthMessage('Please /sign-up or /login first.');
        setTimeout(() => setAuthMessage(null), 3000);
        return;
      }
      const slug = trimmed.slice(7).trim();
      if (!slug) {
        handleVoyagesCommand(); // Show picker if no slug provided
      } else {
        handleSwitchVoyage(slug);
      }
      return;
    }

    // Handle /create-voyage command
    if (trimmed.toLowerCase() === '/create-voyage') {
      setInputValue('');
      if (!isAuthenticated) {
        setAuthMessage('Please /sign-up or /login first.');
        setTimeout(() => setAuthMessage(null), 3000);
        return;
      }
      handleCreateVoyageCommand();
      return;
    }

    // Handle /invite command
    if (trimmed.toLowerCase() === '/invite') {
      setInputValue('');
      if (!isAuthenticated) {
        setAuthMessage('Please /sign-up or /login first.');
        setTimeout(() => setAuthMessage(null), 3000);
        return;
      }
      handleInviteCommand();
      return;
    }

    // For authenticated commands, require login
    if (!isAuthenticated) {
      setAuthMessage('Please /sign-up or /login first.');
      setTimeout(() => setAuthMessage(null), 3000);
      setInputValue('');
      return;
    }

    if (!conversationId) {
      console.error('[Voyager] Cannot send - no conversation loaded');
      return;
    }

    if (isLoading) {
      // Queue message while Voyager is thinking
      setMessageQueue(prev => [...prev, trimmed]);
    } else {
      sendMessage({ text: trimmed });
    }
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && conversationId) {
        if (isLoading) {
          // Queue message while Voyager is thinking
          setMessageQueue(prev => [...prev, trimmed]);
          setInputValue('');
        } else {
          // Send immediately
          sendMessage({ text: trimmed });
          setInputValue('');
        }
      }
    }
    // Shift+Enter allows newline (default textarea behavior)
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
    <div className={`min-h-screen bg-[#050505] text-slate-300 font-mono text-sm selection:bg-indigo-500/30 overflow-x-hidden relative ${className || ''}`}>

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

      {/* CONTEXT BAR - Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#050505]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-indigo-400 group cursor-pointer">
            <Terminal size={16} className="group-hover:text-indigo-300 transition-colors" />
            <span className="font-bold tracking-wider group-hover:underline decoration-indigo-500/30 underline-offset-4">VOYAGER_SHELL</span>
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-1"></div>

          {/* Context Chips */}
          <div className="flex gap-2">
            {/* Voyage context chip */}
            {currentVoyage ? (
              <button
                type="button"
                onClick={handleVoyagesCommand}
                className="px-2 py-1 rounded-sm border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-purple-500/20 transition shadow-[0_0_10px_rgba(168,85,247,0.1)]"
              >
                <Ship size={10} />
                <span className="opacity-50 font-semibold">$VOY:</span> {currentVoyage.name.toUpperCase().replace(/\s+/g, '_')}
                <span className="opacity-50 text-[10px]">({currentVoyage.role})</span>
              </button>
            ) : isAuthenticated ? (
              <button
                type="button"
                onClick={handleVoyagesCommand}
                className="px-2 py-1 rounded-sm border border-slate-700 bg-slate-800/50 text-slate-400 text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 transition"
              >
                <Ship size={10} />
                <span className="opacity-50 font-semibold">$VOY:</span> PERSONAL
              </button>
            ) : null}
            {/* Conversation context chip */}
            <div className="px-2 py-1 rounded-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-indigo-500/20 transition shadow-[0_0_10px_rgba(99,102,241,0.1)]">
              <span className="opacity-50 font-semibold">$CTX:</span> {conversationTitle || 'NEW_SESSION'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-green-500/80 font-bold tracking-widest uppercase">
          <Activity size={10} className="animate-pulse" />
          <span>System Online</span>
        </div>
      </div>

      {/* THE STREAM - pt-20 accounts for fixed header */}
      <div className="max-w-2xl mx-auto px-4 pt-20 pb-48 space-y-12">

        {/* Loading conversation state - only show if authenticated */}
        {isLoadingConversation && isAuthenticated && (
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

        {/* Auth loading state - waiting to know if logged in */}
        {isAuthLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AstronautState state="idle" size="lg" />
            <div className="mt-6 space-y-2">
              <h2 className="text-lg text-slate-400 font-bold animate-pulse">Waking up...</h2>
            </div>
          </div>
        )}

        {/* Welcome state - auth-aware */}
        {!isLoadingConversation && !isAuthLoading && messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AstronautState state="idle" size="lg" />
            <div className="mt-6 space-y-2">
              {isAuthenticated ? (
                <>
                  <h2 className="text-lg text-slate-300 font-bold">
                    Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
                  </h2>
                  <p className="text-slate-500 text-sm max-w-md">
                    Your collaboration co-pilot is ready. Ask me anything about your projects,
                    request catch-ups, or draft responses.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg text-slate-300 font-bold">Welcome to Voyager</h2>
                  <p className="text-slate-500 text-sm max-w-md">
                    Your collaboration co-pilot. Type <span className="text-indigo-400">/sign-up</span> to get started,
                    or <span className="text-indigo-400">/login</span> if you&apos;ve been here before.
                  </p>
                </>
              )}
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

        {/* Auth message display */}
        {authMessage && !showEmailInput && (
          <div className="flex gap-4">
            <div className={`w-12 pt-1 text-right text-[10px] font-bold tracking-widest ${
              authMessageType === 'success' ? 'text-green-500/50' :
              authMessageType === 'error' ? 'text-red-500/50' :
              'text-indigo-500/50'
            }`}>
              {authMessageType === 'success' ? 'OK' : authMessageType === 'error' ? 'ERR' : 'AUTH'}
            </div>
            <div className="flex-1">
              <div className={`text-sm p-3 rounded-sm ${
                authMessageType === 'success'
                  ? 'text-green-300 border border-green-500/30 bg-green-500/10'
                  : authMessageType === 'error'
                  ? 'text-red-300 border border-red-500/30 bg-red-500/10'
                  : 'text-indigo-300 border border-indigo-500/30 bg-indigo-500/10'
              }`}>
                {authMessage}
              </div>
            </div>
          </div>
        )}

        {/* Email input for magic link */}
        {showEmailInput && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-indigo-500/50 text-[10px] font-bold tracking-widest">
              AUTH
            </div>
            <div className="flex-1">
              <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-sm overflow-hidden p-3">
                <div className="text-indigo-300 text-sm mb-3">{authMessage}</div>
                <form onSubmit={handleEmailSubmit} className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 bg-black/30 border border-indigo-500/30 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-400"
                    autoFocus
                    disabled={isAwaitingMagicLink}
                  />
                  <button
                    type="submit"
                    disabled={isAwaitingMagicLink || !emailInput.trim()}
                    className="px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 rounded text-indigo-300 text-sm hover:bg-indigo-500/30 transition disabled:opacity-50"
                  >
                    {isAwaitingMagicLink ? 'Sending...' : 'Send Link'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEmailInput}
                    className="px-3 py-2 text-slate-500 hover:text-slate-300 text-sm"
                  >
                    Cancel
                  </button>
                </form>
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

        {/* Voyage Picker */}
        {showVoyagePicker && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-purple-500/50 text-[10px] font-bold tracking-widest">
              <Ship size={12} className="inline" />
            </div>
            <div className="flex-1">
              <div className="border border-purple-500/30 bg-purple-500/5 rounded-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-purple-500/20 flex items-center justify-between">
                  <span className="text-purple-300 text-xs font-bold">Your Voyages</span>
                  <button
                    type="button"
                    onClick={() => setShowVoyagePicker(false)}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    [ESC]
                  </button>
                </div>
                {isLoadingVoyages ? (
                  <div className="px-3 py-4 text-slate-500 text-xs">Loading voyages...</div>
                ) : (
                  <div className="divide-y divide-purple-500/10 max-h-64 overflow-y-auto">
                    {/* Personal context option */}
                    <button
                      type="button"
                      onClick={() => handleSwitchVoyage('personal')}
                      className={`w-full px-3 py-2 text-left hover:bg-purple-500/10 transition-colors ${
                        !currentVoyage ? 'bg-purple-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-slate-300 text-sm flex items-center gap-2">
                          {!currentVoyage && <span className="text-purple-400">→</span>}
                          Personal
                        </div>
                        <span className="text-slate-600 text-[10px]">private</span>
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">Your private space</div>
                    </button>
                    {/* User voyages */}
                    {voyages.map((voyage) => (
                      <button
                        key={voyage.id}
                        type="button"
                        onClick={() => handleSwitchVoyage(voyage.slug)}
                        className={`w-full px-3 py-2 text-left hover:bg-purple-500/10 transition-colors ${
                          currentVoyage?.slug === voyage.slug ? 'bg-purple-500/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-slate-300 text-sm flex items-center gap-2">
                            {currentVoyage?.slug === voyage.slug && <span className="text-purple-400">→</span>}
                            {voyage.name}
                          </div>
                          <span className="text-purple-400 text-[10px]">{voyage.role}</span>
                        </div>
                        <div className="text-slate-600 text-[10px] mt-0.5">/{voyage.slug}</div>
                      </button>
                    ))}
                    {voyages.length === 0 && (
                      <div className="px-3 py-4 text-slate-500 text-xs">
                        No voyages yet. Use <span className="text-purple-400">/create-voyage</span> to start one.
                      </div>
                    )}
                  </div>
                )}
                {/* Create voyage button */}
                <div className="px-3 py-2 border-t border-purple-500/20">
                  <button
                    type="button"
                    onClick={() => {
                      setShowVoyagePicker(false);
                      handleCreateVoyageCommand();
                    }}
                    className="text-purple-400 text-xs hover:text-purple-300 transition"
                  >
                    + Create new voyage
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Voyage Form */}
        {showCreateVoyage && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-purple-500/50 text-[10px] font-bold tracking-widest">
              NEW
            </div>
            <div className="flex-1">
              <div className="border border-purple-500/30 bg-purple-500/5 rounded-sm overflow-hidden p-3">
                <div className="text-purple-300 text-sm mb-3">What would you like to call this voyage?</div>
                <form onSubmit={handleCreateVoyageSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={newVoyageName}
                    onChange={(e) => setNewVoyageName(e.target.value)}
                    placeholder="e.g., Sophiie Team"
                    className="flex-1 bg-black/30 border border-purple-500/30 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-400"
                    autoFocus
                    disabled={isCreatingVoyage}
                  />
                  <button
                    type="submit"
                    disabled={isCreatingVoyage || !newVoyageName.trim()}
                    className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded text-purple-300 text-sm hover:bg-purple-500/30 transition disabled:opacity-50"
                  >
                    {isCreatingVoyage ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCreateVoyage}
                    className="px-3 py-2 text-slate-500 hover:text-slate-300 text-sm"
                  >
                    Cancel
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Invite Link Display */}
        {voyageInvite && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-purple-500/50 text-[10px] font-bold tracking-widest">
              <Link2 size={12} className="inline" />
            </div>
            <div className="flex-1">
              <div className="border border-purple-500/30 bg-purple-500/5 rounded-sm overflow-hidden p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-300 text-xs font-bold">Invite Link</span>
                  <button
                    type="button"
                    onClick={handleCloseInvite}
                    className="text-slate-500 hover:text-slate-300 text-xs"
                  >
                    [×]
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voyageInvite.url}
                    readOnly
                    className="flex-1 bg-black/30 border border-purple-500/30 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded text-purple-300 text-sm hover:bg-purple-500/30 transition"
                  >
                    Copy
                  </button>
                </div>
                <div className="text-slate-500 text-xs mt-2">
                  Share this link to invite people to your voyage.
                </div>
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
          {/* Command Hints - auth-aware */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            {(isAuthenticated ? USER_COMMANDS : AUTH_COMMANDS).map(cmd => (
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

          <form onSubmit={handleSubmit} className="flex items-start gap-3 group">
            <span className={`font-bold mt-1 ${isLoading ? 'text-amber-500' : 'text-green-500 animate-pulse'}`}>&#10132;</span>
            <span className="text-indigo-400 text-xs font-bold mt-1">~/voyager</span>
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                className="w-full bg-transparent border-none outline-none text-slate-200 placeholder-slate-700 font-mono text-sm resize-none min-h-[24px] max-h-32 overflow-y-auto"
                placeholder={isLoading ? "Type to queue message..." : "Type a message..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />
            </div>
            {/* Queue indicator */}
            {messageQueue.length > 0 && (
              <span className="text-amber-400 text-xs font-bold mt-1 animate-pulse">
                {messageQueue.length} queued
              </span>
            )}
            {inputValue.trim() && (
              <button
                type="submit"
                className={`text-xs font-bold transition mt-1 ${isLoading ? 'text-amber-400 hover:text-amber-300' : 'text-indigo-400 hover:text-indigo-300'}`}
              >
                {isLoading ? 'QUEUE' : 'SEND'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
