# Slice 3: Conversational Auth & Onboarding

**Status:** Implemented (ready for testing)
**Goal:** Real users can sign up, log in, and have their own conversations and knowledge.

## Current State

**What exists (foundation ready):**
- Supabase SSR middleware refreshing sessions
- Database schema with `profiles` table linked to `auth.users`
- Trigger auto-creates profile on signup (`handle_new_user`)
- Conversation service with RLS policies defined (but bypassed via admin client)
- Placeholder user ID hardcoded: `00000000-0000-0000-0000-000000000001`

**What's missing:**
- No magic link flow (send/verify)
- No auth state in UI
- No protected routes
- Admin client bypasses RLS everywhere
- No onboarding conversation

## Design Principles

From the foundation doc:
1. **Interface IS the landing page** - No separate auth pages
2. **Magic links everywhere** - No passwords
3. **Conversational onboarding** - Voyager greets new users
4. **Progressive personalization** - "let's customize" hidden door for enthusiasts

## Implementation Plan

### Phase 1: Wire Up Real Auth

**Files to create/modify:**

```
lib/auth/
  index.ts              # Auth service (send magic link, get user)
  context.tsx           # React auth context provider

app/auth/
  callback/route.ts     # Handle magic link callback

app/layout.tsx          # Wrap with AuthProvider
middleware.ts           # Add auth redirect logic
```

**Step 1.1: Auth Service** (`lib/auth/index.ts`)
```typescript
// Send magic link via Supabase
export const sendMagicLink = async (email: string): Promise<{ success: boolean; error?: string }>

// Get current user from session
export const getCurrentUser = async (): Promise<User | null>

// Sign out
export const signOut = async (): Promise<void>
```

**Step 1.2: Auth Callback** (`app/auth/callback/route.ts`)
- Supabase redirects here after magic link click
- Exchange code for session
- Redirect to main interface

**Step 1.3: Auth Context** (`lib/auth/context.tsx`)
- React context providing: `user`, `isLoading`, `isAuthenticated`
- Wraps app in `app/layout.tsx`
- Subscribes to auth state changes

**Step 1.4: Update Middleware**
- If no user and accessing protected routes → redirect to main page (which will show auth prompt)
- Keep current session refresh logic

### Phase 2: Conversational Auth Commands

**Modify:** `components/ui/VoyagerInterface.tsx`

**Step 2.1: Auth-Aware Welcome**
```
[Not logged in]
Welcome to Voyager - your collaboration co-pilot.

Type /sign-up to get started, or /login if you've been here before.

[Logged in, first visit]
Welcome back! I remember you.

[Logged in, returning]
(normal interface)
```

**Step 2.2: `/sign-up` command**
1. Show input prompt for email
2. Call auth service to send magic link
3. Show "Check your email" message
4. On callback, user is logged in

**Step 2.3: `/login` command**
- Same flow as sign-up (magic links work for both)

**Step 2.4: `/logout` command**
1. Archive current conversation
2. Call signOut
3. Clear local state
4. Show welcome message again

### Phase 3: Switch to User-Scoped Clients

**Modify:**
- `lib/conversation/index.ts` - Use server client, not admin
- `lib/knowledge/index.ts` - Use server client, not admin
- `app/api/chat/route.ts` - Get real user ID from session
- `app/api/conversation/route.ts` - Get real user ID from session

**Key change:**
```typescript
// Before (bypasses RLS)
const getClient = () => getAdminClient()

// After (respects RLS)
const getClient = async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new AuthError('Not authenticated')
  return { supabase, userId: user.id }
}
```

### Phase 4: Onboarding Flow (Optional Enhancement)

**Detect first-time user:**
- Check if profile has personalization set
- If empty, trigger onboarding conversation

**Onboarding conversation:**
```
Voyager: Hey, I'm Voyager. I'm here to help you
         collaborate beautifully. What brings you here?

[User responds]

Voyager: Got it. I'll learn how you like to work as we go.
         [First value in <60 seconds]
```

**Enthusiast path:**
- If user says "let's customize" → deep personalization flow
- Set preferences in profile.personalization JSONB

## Migration Notes

1. **Existing placeholder data** - The `00000000-0000-0000-0000-000000000001` user has test data
   - Option A: Leave it, it's dev data
   - Option B: Create a real dev user, migrate data

2. **RLS policies already defined** - They just need real auth to work
   - No schema changes needed
   - Just stop bypassing RLS with admin client

## Deferred to Later

- **Subscription/billing** (`/subscribe`, `/upgrade`, `/billing`) - After we have users
- **Deep personalization** - Nice to have, not blocking
- **Community context** - Slice 4

## Estimated Work

| Phase | Effort | Files |
|-------|--------|-------|
| 1. Wire up auth | ~2 hours | 5 files |
| 2. Conversational commands | ~1 hour | 1 file (VoyagerInterface) |
| 3. Switch clients | ~1 hour | 4 files |
| 4. Onboarding (optional) | ~1 hour | 2 files |

**Total: ~4-5 hours**

## What Was Built

### Files Created
- `lib/auth/index.ts` - Auth service (magic link, getCurrentUser, getAuthenticatedUserId)
- `lib/auth/context.tsx` - React auth context provider with useAuth hook
- `app/auth/callback/route.ts` - Magic link callback handler
- `components/providers.tsx` - App-level provider wrapper

### Files Modified
- `app/layout.tsx` - Wrapped with AuthProvider
- `components/ui/VoyagerInterface.tsx` - Auth-aware UI, /sign-up, /login, /logout commands
- `app/api/conversation/route.ts` - Uses real user ID
- `app/api/conversation/resume/route.ts` - Uses real user ID
- `app/api/chat/route.ts` - Uses real user ID

### Auth Flow
1. Unauthenticated user sees auth-aware welcome
2. `/sign-up` or `/login` → email input UI
3. Magic link sent via Supabase
4. Click link → /auth/callback → session established
5. Redirect to / with user authenticated
6. All API calls now use real user ID
7. `/logout` → sign out + clear state

## Success Criteria

- [x] User can `/sign-up` with email
- [x] Magic link works, user lands back in interface logged in
- [x] User can `/logout` and session ends
- [x] Conversations are scoped to real user
- [x] Knowledge is scoped to real user
- [x] RLS policies enforced (no cross-user access)
