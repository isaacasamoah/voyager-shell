"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Terminal, Activity, Ship, Users, Link2 } from 'lucide-react';
import { UserMessage, AssistantMessage, AstronautState, AgentResultCard, TaskCard, type TaskProgress } from '@/components/chat';
import { useAuth } from '@/lib/auth/context';
import { createClient } from '@/lib/supabase/client';
import { detectIntent, type UIIntent } from '@/lib/ui/intent';
import { log } from '@/lib/debug';
import { getSuggestions, getWelcomeSuggestion, type SuggestionContext } from '@/lib/ui/suggestions';
import {
  createUIMessage,
  createComponent,
  resolveComponent,
  type UIComponentMessage,
  type MessagePart,
} from '@/lib/ui/components';

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

interface VoyagerInterfaceProps {
  className?: string;
}

// Legacy command constants removed - now using natural language intent detection
// Commands still work for backward compatibility but aren't shown in UI

// Personal voyage synonyms for context switching
const PERSONAL_SYNONYMS = ['personal', 'solo', 'default', 'home', 'my', 'mine', ''];

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

// Running task from background worker (in-progress)
interface RunningTask {
  id: string;
  task: string;  // objective
  progress?: TaskProgress;
}

// Agent result from background worker (supports clustered and legacy flat findings)
interface AgentResult {
  id: string;
  task: string;
  result: {
    // Legacy flat findings (backwards compatible)
    findings?: Array<{
      eventId: string;
      content: string;
      similarity?: number;
      isPinned?: boolean;
    }>;
    // New clustered structure
    clusters?: Array<{
      id: string;
      theme: string;
      summary: string;
      confidence: number;
      findings: Array<{
        eventId: string;
        content: string;
        similarity?: number;
        isPinned?: boolean;
      }>;
      representativeId: string;
    }>;
    unclustered?: Array<{
      eventId: string;
      content: string;
      similarity?: number;
      isPinned?: boolean;
    }>;
    totalFindings?: number;
    confidence: number;
    summary?: string;
    type?: string;
  };
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

  // Background agent state (running + completed)
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);

  // Success celebration state (shows triumph astronaut briefly after response)
  const [showSuccess, setShowSuccess] = useState(false);

  // UI component messages (ephemeral, in-stream)
  const [uiMessages, setUiMessages] = useState<UIComponentMessage[]>([]);

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

        log.voyage('Loaded conversation', { conversationId: data.conversation.id, voyageSlug: voyageSlug ?? 'personal' });
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
                setFeedbackMessage(joinData.alreadyMember
                  ? `You're already a member of ${joinData.voyage.name}!`
                  : `Welcome to ${joinData.voyage.name}!`);
                setTimeout(() => setFeedbackMessage(null), 3000);
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
        log.voyage('Failed to fetch voyages', { error: String(error) }, 'error');
      }
    };

    fetchVoyages();
  }, [isAuthenticated, isAuthLoading]);

  // Subscribe to background agent tasks (running + completed)
  useEffect(() => {
    if (!conversationId || !isAuthenticated) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`agents:${conversationId}`)
      // New tasks (running)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, unknown>;
          const status = newData.status as string;

          if (status === 'pending' || status === 'running') {
            log.agent('Background task started', { taskId: newData.id });
            setRunningTasks((prev) => [
              ...prev,
              {
                id: newData.id as string,
                task: newData.task as string,
                progress: newData.progress as TaskProgress | undefined,
              },
            ]);
          } else if (status === 'complete' && newData.result) {
            log.agent('Background task completed', { taskId: newData.id });
            setAgentResults((prev) => [
              ...prev,
              {
                id: newData.id as string,
                task: newData.task as string,
                result: newData.result as AgentResult['result'],
              },
            ]);
          }
        }
      )
      // Progress updates
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_tasks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, unknown>;
          const taskId = newData.id as string;
          const status = newData.status as string;

          if (status === 'running') {
            // Update progress
            setRunningTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? { ...t, progress: newData.progress as TaskProgress | undefined }
                  : t
              )
            );
          } else if (status === 'complete') {
            // Move from running to completed
            setRunningTasks((prev) => prev.filter((t) => t.id !== taskId));
            if (newData.result) {
              log.agent('Background task completed', { taskId });
              setAgentResults((prev) => [
                ...prev,
                {
                  id: taskId,
                  task: newData.task as string,
                  result: newData.result as AgentResult['result'],
                },
              ]);
            }
          } else if (status === 'failed') {
            // Remove from running
            setRunningTasks((prev) => prev.filter((t) => t.id !== taskId));
            log.agent('Background task failed', { taskId, error: newData.error });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, isAuthenticated]);

  // Clear agent state when conversation changes
  useEffect(() => {
    setRunningTasks([]);
    setAgentResults([]);
  }, [conversationId]);

  // Derived state for loading
  const isLoading = status === 'submitted' || status === 'streaming';
  const isStreaming = status === 'streaming';
  const prevStatusRef = useRef(status);

  // Show success astronaut briefly when response completes
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === 'streaming';
    const nowReady = status === 'ready';

    if (wasStreaming && nowReady && messages.length > 0) {
      // Just finished streaming - celebrate!
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2500);
      return () => clearTimeout(timer);
    }

    prevStatusRef.current = status;
  }, [status, messages.length]);

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
  // Only scroll on message count change (not every streaming update)
  const messageCount = messages.length;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messageCount]);

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

  // State for command feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Handle /new command - create new conversation
  const handleNewConversation = async () => {
    try {
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

      setFeedbackMessage('New conversation started.');
      setTimeout(() => setFeedbackMessage(null), 2000);
      log.message('Created new conversation', { conversationId: data.conversation.id });
    } catch (error) {
      log.message('Failed to create new conversation', { error: String(error) }, 'error');
      setFeedbackMessage('Failed to start new conversation.');
      setTimeout(() => setFeedbackMessage(null), 3000);
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
      log.message('Failed to fetch resumable conversations', { error: String(error) }, 'error');
      setFeedbackMessage('Failed to load conversations.');
      setTimeout(() => setFeedbackMessage(null), 3000);
      setShowResumePicker(false);
    } finally {
      setIsLoadingResumable(false);
    }
  };

  // Resume a specific conversation
  const handleResumeConversation = async (targetId: string) => {
    try {
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

      setShowResumePicker(false);
      log.message('Resumed conversation', { conversationId: data.conversation.id });
    } catch (error) {
      log.message('Failed to resume conversation', { error: String(error) }, 'error');
      setFeedbackMessage('Failed to resume conversation.');
      setTimeout(() => setFeedbackMessage(null), 3000);
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
    await signOut();
    setConversationId(null);
    setConversationTitle(null);
    setMessages([]);
    setAuthMessage('You\'ve been logged out. See you next time!');
    setIsAwaitingMagicLink(false);
    setTimeout(() => setAuthMessage(null), 3000);
  }, [signOut, setMessages]);

  // Cancel email input
  const handleCancelEmailInput = useCallback(() => {
    setShowEmailInput(false);
    setEmailInput('');
    setAuthMessage(null);
  }, []);

  // Handle /voyages command - inject voyage picker into message stream
  const handleVoyagesCommand = useCallback(async () => {
    log.ui('Injecting voyage picker');
    // Inject a loading message
    const loadingMsg = createUIMessage('Loading your voyages...');
    setUiMessages(prev => [...prev, loadingMsg]);

    try {
      const res = await fetch('/api/voyages');
      if (!res.ok) throw new Error('Failed to fetch voyages');

      const data = await res.json();
      const fetchedVoyages = data.voyages || [];
      setVoyages(fetchedVoyages);

      // Replace loading message with the actual picker
      const pickerComponent = createComponent('voyage_picker', {
        voyages: [
          { slug: 'personal', name: 'Personal', role: 'private' },
          ...fetchedVoyages.map((v: VoyageMembership) => ({
            slug: v.slug,
            name: v.name,
            role: v.role,
          })),
        ],
      });

      const pickerMsg = createUIMessage(
        'Here are your voyages:',
        [pickerComponent],
        true // ephemeral
      );

      // Replace the loading message with the picker
      setUiMessages(prev => prev.map(m => m.id === loadingMsg.id ? pickerMsg : m));
    } catch (error) {
      log.voyage('Failed to fetch voyages for picker', { error: String(error) }, 'error');
      // Replace loading message with error
      setUiMessages(prev => prev.filter(m => m.id !== loadingMsg.id));
      setFeedbackMessage('Failed to load voyages.');
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  }, []);

  // Handle /switch command - switch to a specific voyage
  const handleSwitchVoyage = useCallback((slug: string, fromPicker = false) => {
    if (PERSONAL_SYNONYMS.includes(slug)) {
      log.voyage('Switched', { from: currentVoyage?.slug ?? 'personal', to: 'personal' });
      setCurrentVoyage(null);
      if (!fromPicker) setShowVoyagePicker(false); // Legacy modal support
      setFeedbackMessage('Switched to Personal context.');
      setTimeout(() => setFeedbackMessage(null), 2000);
      return { success: true, name: 'Personal' };
    }

    const voyage = voyages.find(v => v.slug === slug);
    if (voyage) {
      log.voyage('Switched', { from: currentVoyage?.slug ?? 'personal', to: voyage.slug });
      setCurrentVoyage(voyage);
      if (!fromPicker) setShowVoyagePicker(false); // Legacy modal support
      setFeedbackMessage(`Switched to ${voyage.name}.`);
      setTimeout(() => setFeedbackMessage(null), 2000);
      return { success: true, name: voyage.name };
    } else {
      log.voyage('Switch failed - not found', { slug });
      setFeedbackMessage(`Voyage "${slug}" not found.`);
      setTimeout(() => setFeedbackMessage(null), 3000);
      return { success: false, name: null };
    }
  }, [voyages, currentVoyage]);

  // Handle voyage selection from inline picker component
  const handleVoyagePickerSelect = useCallback((slug: string) => {
    const result = handleSwitchVoyage(slug, true);

    // Resolve all voyage_picker components in UI messages
    setUiMessages(prev => prev.map(msg => {
      const hasVoyagePicker = msg.parts.some(
        p => p.type === 'component' && p.component.type === 'voyage_picker'
      );
      if (!hasVoyagePicker) return msg;

      // Find and resolve the picker component
      return {
        ...msg,
        parts: msg.parts.map(part => {
          if (part.type === 'component' && part.component.type === 'voyage_picker') {
            return {
              ...part,
              component: {
                ...part.component,
                state: 'resolved' as const,
                resolution: {
                  action: 'selected',
                  value: slug,
                  label: result.name || slug,
                },
              },
            };
          }
          return part;
        }),
      };
    }));
  }, [handleSwitchVoyage]);

  // Handle /create-voyage command
  const handleCreateVoyageCommand = useCallback(() => {
    setShowCreateVoyage(true);
    setNewVoyageName('');
  }, []);

  // Submit new voyage creation
  // Can be called from form (e = FormEvent) or directly with name string
  const handleCreateVoyageSubmit = useCallback(async (e: React.FormEvent | string) => {
    if (typeof e !== 'string') {
      e.preventDefault();
    }
    const name = typeof e === 'string' ? e.trim() : newVoyageName.trim();
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
        setFeedbackMessage(data.error || 'Failed to create voyage.');
        setTimeout(() => setFeedbackMessage(null), 3000);
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
      setFeedbackMessage(`Created ${data.voyage.name}! Share the invite link to add members.`);
      setTimeout(() => setFeedbackMessage(null), 5000);
    } catch (error) {
      log.voyage('Failed to create voyage', { error: String(error) }, 'error');
      setFeedbackMessage('Failed to create voyage.');
      setTimeout(() => setFeedbackMessage(null), 3000);
    } finally {
      setIsCreatingVoyage(false);
    }
  }, [newVoyageName]);

  // Handle /invite command - show invite link
  const handleInviteCommand = useCallback(async () => {
    if (!currentVoyage) {
      setFeedbackMessage('Switch to a voyage first with /voyages');
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }

    if (currentVoyage.role !== 'captain' && currentVoyage.role !== 'navigator') {
      setFeedbackMessage('Only captains and navigators can view invite links.');
      setTimeout(() => setFeedbackMessage(null), 3000);
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
        setFeedbackMessage('No invite link available.');
        setTimeout(() => setFeedbackMessage(null), 3000);
      }
    } catch (error) {
      log.voyage('Failed to get invite', { error: String(error) }, 'error');
      setFeedbackMessage('Failed to get invite link.');
      setTimeout(() => setFeedbackMessage(null), 3000);
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
      setFeedbackMessage('Invite link copied!');
      setTimeout(() => setFeedbackMessage(null), 2000);
    } catch {
      setFeedbackMessage('Failed to copy.');
      setTimeout(() => setFeedbackMessage(null), 2000);
    }
  }, [voyageInvite]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Try natural language intent detection first
    const intent = detectIntent(trimmed);

    if (intent.type !== 'none') {
      log.intent('Detected', { type: intent.type, input: trimmed.slice(0, 50) });
      setInputValue('');

      switch (intent.type) {
        case 'new_conversation':
          handleNewConversation();
          return;
        case 'resume_conversation':
          handleResume();
          return;
        case 'sign_up':
          handleAuthCommand('sign-up');
          return;
        case 'login':
          handleAuthCommand('login');
          return;
        case 'logout':
          handleLogout();
          return;
        case 'show_voyages':
          if (!isAuthenticated) {
            setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
            setTimeout(() => setAuthMessage(null), 3000);
            return;
          }
          handleVoyagesCommand();
          return;
        case 'switch_voyage':
          if (!isAuthenticated) {
            setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
            setTimeout(() => setAuthMessage(null), 3000);
            return;
          }
          if (intent.voyageSlug) {
            handleSwitchVoyage(intent.voyageSlug);
          } else {
            handleVoyagesCommand();
          }
          return;
        case 'create_voyage':
          if (!isAuthenticated) {
            setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
            setTimeout(() => setAuthMessage(null), 3000);
            return;
          }
          handleCreateVoyageCommand();
          return;
        case 'invite_member':
          if (!isAuthenticated) {
            setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
            setTimeout(() => setAuthMessage(null), 3000);
            return;
          }
          handleInviteCommand();
          return;
      }
    }

    // Fall back to explicit /command handling (backward compatibility)
    if (trimmed.startsWith('/')) {
      const lower = trimmed.toLowerCase();

      if (lower === '/new') {
        setInputValue('');
        handleNewConversation();
        return;
      }
      if (lower === '/resume') {
        setInputValue('');
        handleResume();
        return;
      }
      if (lower === '/sign-up') {
        setInputValue('');
        handleAuthCommand('sign-up');
        return;
      }
      if (lower === '/login') {
        setInputValue('');
        handleAuthCommand('login');
        return;
      }
      if (lower === '/logout') {
        setInputValue('');
        handleLogout();
        return;
      }
      if (lower === '/voyages') {
        setInputValue('');
        if (!isAuthenticated) {
          setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
          setTimeout(() => setAuthMessage(null), 3000);
          return;
        }
        handleVoyagesCommand();
        return;
      }
      if (lower.startsWith('/switch')) {
        setInputValue('');
        if (!isAuthenticated) {
          setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
          setTimeout(() => setAuthMessage(null), 3000);
          return;
        }
        const slug = trimmed.slice(7).trim();
        if (!slug) {
          handleVoyagesCommand();
        } else {
          handleSwitchVoyage(slug);
        }
        return;
      }
      if (lower.startsWith('/create-voyage')) {
        setInputValue('');
        if (!isAuthenticated) {
          setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
          setTimeout(() => setAuthMessage(null), 3000);
          return;
        }
        const voyageName = trimmed.slice(14).trim();
        if (voyageName) {
          handleCreateVoyageSubmit(voyageName);
        } else {
          handleCreateVoyageCommand();
        }
        return;
      }
      if (lower === '/invite') {
        setInputValue('');
        if (!isAuthenticated) {
          setAuthMessage('Say "I want to sign up" or "I want to log in" first.');
          setTimeout(() => setAuthMessage(null), 3000);
          return;
        }
        handleInviteCommand();
        return;
      }
    }

    // Regular chat message - require authentication
    if (!isAuthenticated) {
      setAuthMessage('Say "I want to sign up" or "I want to log in" to get started.');
      setTimeout(() => setAuthMessage(null), 3000);
      setInputValue('');
      return;
    }

    if (!conversationId) {
      log.message('Cannot send - no conversation loaded', undefined, 'error');
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
      // Trigger form submit to go through handleSubmit (which handles commands)
      const form = e.currentTarget.closest('form');
      if (form) {
        form.requestSubmit();
      }
    }
    // Shift+Enter allows newline (default textarea behavior)
  };

  const handleSuggestionClick = (action: string) => {
    setInputValue(action);
    // Focus input after setting suggestion
    inputRef.current?.focus();
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

  // Compute context-aware suggestions
  const suggestionContext: SuggestionContext = useMemo(() => ({
    isAuthenticated,
    hasVoyages: voyages.length > 0,
    currentVoyage: currentVoyage?.slug,
    hasRecentConversations: resumableConversations.length > 0,
    lastMessageRole: messages.length > 0 ? messages[messages.length - 1]?.role : undefined,
    conversationLength: messages.length,
    isLoading,
  }), [isAuthenticated, voyages.length, currentVoyage?.slug, resumableConversations.length, messages, isLoading]);

  const suggestions = useMemo(() => getSuggestions(suggestionContext), [suggestionContext]);
  const welcomeHint = useMemo(() => getWelcomeSuggestion(suggestionContext), [suggestionContext]);

  // Merge chat messages with UI component messages for unified stream
  type MergedMessage =
    | { source: 'chat'; message: UIMessage }
    | { source: 'ui'; message: UIComponentMessage };

  const mergedMessages = useMemo((): MergedMessage[] => {
    const chatMsgs: MergedMessage[] = messages.map(m => ({
      source: 'chat' as const,
      message: m,
    }));
    const uiMsgs: MergedMessage[] = uiMessages.map(m => ({
      source: 'ui' as const,
      message: m,
    }));

    // UI messages append at the end (they're responses to user actions)
    // Chat messages maintain their original order from useChat
    return [...chatMsgs, ...uiMsgs];
  }, [messages, uiMessages]);

  // Handler for component actions in the stream
  const handleComponentAction = useCallback((action: string, data?: unknown) => {
    if (action === 'voyage_select' && typeof data === 'string') {
      handleVoyagePickerSelect(data);
    }
    // Add more action handlers as needed
  }, [handleVoyagePickerSelect]);

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

          {/* Context Chips - only show when authenticated */}
          {isAuthenticated && (
            <>
              <div className="h-4 w-[1px] bg-white/10 mx-1"></div>

              <div className="flex gap-2">
                {/* Voyage context chip */}
                {currentVoyage ? (
                  <button
                    type="button"
                    onClick={handleVoyagesCommand}
                    className="px-2 py-1 rounded-sm border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-purple-500/20 transition shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                  >
                    <Ship size={10} />
                    <span className="opacity-30 font-semibold">$VOY:</span> {currentVoyage.name.toUpperCase().replace(/\s+/g, '_')}
                    <span className="opacity-50 text-[10px]">({currentVoyage.role})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleVoyagesCommand}
                    className="px-2 py-1 rounded-sm border border-slate-700 bg-slate-800/50 text-slate-400 text-xs flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 transition"
                  >
                    <Ship size={10} />
                    <span className="opacity-30 font-semibold">$VOY:</span> PERSONAL
                  </button>
                )}
                {/* Conversation context chip */}
                <div className="px-2 py-1 rounded-sm border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs flex items-center gap-2 cursor-pointer hover:bg-indigo-500/20 transition shadow-[0_0_10px_rgba(99,102,241,0.1)]">
                  <span className="opacity-30 font-semibold">$CTX:</span> {conversationTitle || 'NEW_SESSION'}
                </div>
              </div>
            </>
          )}
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
                    Your collaboration co-pilot is ready. I remember our past conversations
                    and can help you find anything we&apos;ve discussed.
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

        {/* Messages - unified stream of chat + UI messages */}
        {mergedMessages.map((item, index) => {
          const timestamp = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });

          // UI Component Message
          if (item.source === 'ui') {
            const uiMsg = item.message;
            // Convert UIComponentMessage parts to AssistantMessage parts format
            const parts = uiMsg.parts.map(part => {
              if (part.type === 'text') {
                return { type: 'text' as const, text: part.text };
              }
              // Pass component with onSelect wired up
              const componentWithHandler = {
                ...part.component,
                props: {
                  ...part.component.props,
                  onSelect: part.component.type === 'voyage_picker'
                    ? (slug: string) => handleComponentAction('voyage_select', slug)
                    : undefined,
                },
              };
              return { type: 'component' as const, component: componentWithHandler };
            });

            return (
              <AssistantMessage
                key={uiMsg.id}
                parts={parts}
                timestamp={timestamp}
                onAction={handleComponentAction}
              />
            );
          }

          // Regular Chat Message
          const message = item.message;
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
            const isCurrentlyStreaming = isStreaming && index === mergedMessages.length - 1 && item.source === 'chat';
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

        {/* Success celebration (brief triumph after response) */}
        {showSuccess && !isLoading && (
          <div className="flex gap-4 animate-in fade-in duration-300">
            <div className="w-12 pt-1 text-right text-emerald-500/50 text-[10px] font-bold tracking-widest">
              {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <AstronautState state="success" size="md" />
                <div className="flex flex-col">
                  <span className="text-emerald-400 text-xs font-bold">
                    READY
                  </span>
                  <span className="text-slate-600 text-[10px]">
                    Response complete
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

        {feedbackMessage && (
          <div className="flex gap-4">
            <div className="w-12 pt-1 text-right text-green-500/50 text-[10px] font-bold tracking-widest">
              SYS
            </div>
            <div className="flex-1">
              <div className="text-green-400 text-sm p-3 border border-green-500/30 bg-green-500/10 rounded-sm">
                {feedbackMessage}
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

        {/* Voyage Picker - LEGACY MODAL (disabled - now using in-stream component)
        {showVoyagePicker && (
          ...
        )}
        */}

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

        {/* Running Tasks - Show progress */}
        {runningTasks.length > 0 && (
          <div className="space-y-3 max-w-2xl mx-auto py-4">
            {runningTasks.map((task) => (
              <TaskCard
                key={task.id}
                id={task.id}
                objective={task.task}
                progress={task.progress}
              />
            ))}
          </div>
        )}

        {/* Agent Results - Completed background findings */}
        {agentResults.length > 0 && (
          <div className="space-y-3 max-w-2xl mx-auto py-4">
            {agentResults.map((result) => (
              <AgentResultCard
                key={result.id}
                result={result}
                onDismiss={() => {
                  setAgentResults((prev) => prev.filter((r) => r.id !== result.id));
                }}
              />
            ))}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT DECK */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#050505]/95 backdrop-blur border-t border-white/10 p-4 pb-6">
        <div className="max-w-2xl mx-auto">
          {/* Context-Aware Suggestions - replaces static command hints */}
          {suggestions.length > 0 && (
            <div className="flex gap-3 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion.action)}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors whitespace-nowrap"
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          )}

          {/* Welcome hint for empty states */}
          {welcomeHint && messages.length === 0 && (
            <div className="text-xs text-slate-600 mb-3 italic">
              {welcomeHint}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-start gap-3 group">
            <span className={`font-bold mt-1 ${isLoading ? 'text-amber-500' : 'text-green-500 animate-pulse'}`}>&#10132;</span>
            <span className="text-indigo-400 text-xs font-bold mt-1">~/voyager</span>
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                className="w-full bg-transparent border-none outline-none text-slate-200 placeholder-slate-700 font-mono text-sm resize-none min-h-[24px] max-h-32 overflow-y-auto"
                placeholder={isLoading ? "Type to queue message..." : "Just talk to me..."}
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
