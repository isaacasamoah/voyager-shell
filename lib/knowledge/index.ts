// Knowledge system exports
// Slice 2 Phase 1: Event-Sourced Knowledge Foundation
//
// Philosophy: "Curation is subtraction, not extraction"
// - Messages ARE the knowledge (preserved exactly)
// - Classifications are metadata on source events
// - Quiet the noise, pin the signal

// Event creation (source events, attention events)
export {
  emitMessageEvent,
  createMessageEvent,
  createExplicitEvent,
  quietKnowledge,
  pinKnowledge,
  activateKnowledge,
} from './events'

export type {
  SourceEventType,
  AttentionEventType,
  Classification,
  ActorType,
  SourceType,
} from './events'

// Search and retrieval
export {
  searchKnowledge,
  getKnowledgeByIds,
  getConnectedKnowledge,
  getRecentKnowledge,
  getPinnedKnowledge,
  formatKnowledgeForPrompt,
  keywordGrep,
} from './search'

export type { KnowledgeNode, SearchOptions, GrepOptions, GrepResult } from './search'
