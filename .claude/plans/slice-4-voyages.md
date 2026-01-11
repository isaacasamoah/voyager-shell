# Slice 4: First Community (Voyages)

**Status:** Planning
**Goal:** Enable team collaboration through shared voyages with community knowledge and customized Voyager behavior.

## Foundation Already Built

**Schema (011_voyages.sql):**
- `voyages` table with slug, name, description, settings (JSONB for VoyageConfig)
- `voyage_members` with roles: captain, navigator, crew, observer
- Helper functions: `get_voyage_role`, `is_voyage_captain`, `get_user_voyages`
- RLS policies for access control

**Prompt System (lib/prompts/types.ts):**
- `VoyageConfig` type ready (character, norms, knowledge, tools)
- Composer supports voyage context

**Session Support:**
- `sessions.community_id` column exists (needs to be used)

## What Needs Building

### Phase 1: Schema Updates (~30min)

**Add invite codes to voyages:**
```sql
ALTER TABLE voyages ADD COLUMN invite_code TEXT UNIQUE;
ALTER TABLE voyages ADD COLUMN created_by UUID REFERENCES profiles(id);

-- Function to generate invite codes
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
  SELECT substr(md5(random()::text), 1, 8);
$$ LANGUAGE SQL;
```

**Add voyage_id to knowledge_events:**
```sql
ALTER TABLE knowledge_events ADD COLUMN voyage_id UUID REFERENCES voyages(id);
CREATE INDEX idx_knowledge_events_voyage ON knowledge_events(voyage_id);
```

### Phase 2: Voyage Service (~2h)

**Create `lib/voyage/index.ts`:**

```typescript
// Core CRUD
export const createVoyage = async (name: string, slug: string, userId: string): Promise<Voyage>
export const getVoyage = async (slug: string): Promise<Voyage | null>
export const getUserVoyages = async (userId: string): Promise<VoyageMembership[]>
export const updateVoyageConfig = async (slug: string, config: Partial<VoyageConfig>): Promise<boolean>

// Membership
export const joinVoyage = async (inviteCode: string, userId: string): Promise<Voyage | null>
export const getVoyageMembers = async (voyageId: string): Promise<Member[]>
export const updateMemberRole = async (voyageId: string, userId: string, role: VoyageRole): Promise<boolean>

// Invite management
export const regenerateInviteCode = async (voyageId: string): Promise<string>
export const getInviteLink = (inviteCode: string): string
```

### Phase 3: API Routes (~1.5h)

```
GET  /api/voyages                    - List user's voyages
POST /api/voyages                    - Create voyage
GET  /api/voyages/[slug]             - Get voyage details + config
PUT  /api/voyages/[slug]             - Update voyage config
GET  /api/voyages/[slug]/members     - List members
POST /api/voyages/join/[code]        - Join via invite code
POST /api/voyages/[slug]/invite      - Regenerate invite code (captain only)
```

### Phase 4: Voyage Context in UI (~2h)

**State Management:**
- Add `currentVoyageSlug` to app state (localStorage + context)
- Show current voyage in context bar: `$CTX: SOPHIIE_TEAM`
- Pass voyage context to API calls

**Commands:**
```
/create-voyage          - Conversational voyage creation
/voyages                - List voyages with switch option
/switch <slug>          - Switch to different voyage
/invite                 - Show/regenerate invite link
/voyage-settings        - Configure voyage (captain only)
```

**UI Components:**
- Voyage switcher in context bar (dropdown or modal)
- Voyage creation flow (name → slug → invite link)
- Member list view
- Settings panel for captains

### Phase 5: Knowledge Scoping (~1.5h)

**Update Retrieval:**
```typescript
// In lib/retrieval/index.ts
export const retrieveKnowledge = async (
  query: string,
  userId: string,
  voyageId?: string,  // NEW: Include voyage knowledge
  options?: RetrievalOptions
): Promise<RetrievalResult>
```

**Knowledge Layers:**
1. Personal knowledge (user's own, always included)
2. Voyage knowledge (if in voyage context)
3. Pinned knowledge (personal + voyage pinned items)

**Emit Events with Voyage:**
```typescript
// When in voyage context, knowledge events get voyage_id
await emitMessageEvent({
  userId,
  voyageId,  // NEW
  content,
  conversationId,
});
```

### Phase 6: Session Scoping (~1h)

**Update Conversation Service:**
- `getOrCreateActiveSession` accepts optional `voyageId`
- Sessions in voyage context set `community_id`
- `/resume` shows voyage-scoped conversations when in voyage

**Update Chat Route:**
- Load voyage config from settings JSONB
- Pass to prompt composer
- Include voyage knowledge in retrieval

## User Flows

### Create Voyage
```
User: /create-voyage
Voyager: What would you like to call this voyage?

User: Sophiie Team
Voyager: Great! I'll create the Sophiie Team voyage.
         Slug: sophiie-team (this is the URL identifier)

         ✓ Voyage created

         Invite link: https://voyager.app/join/a8f3b2c1
         Share this with your team to let them join.

         Want me to customize how I behave for this team?

User: No, defaults are fine
Voyager: Perfect. You're now in the Sophiie Team voyage.
         Everything you share here stays with this team.
```

### Join Voyage
```
[User clicks invite link: /join/a8f3b2c1]
[If not logged in → sign up flow → redirect back]

Voyager: Welcome to Sophiie Team! 🚀

         You've joined as a crew member.

         This voyage has 3 other members:
         - Isaac (captain)
         - Sarah (navigator)
         - Mike (crew)

         What would you like to work on?
```

### Switch Context
```
User: /voyages
Voyager: Your voyages:

         → sophiie-team (current, captain)
           Sophiie AI voice agent development

         ○ side-project (crew)
           Weekend hack project

         ○ Personal (always available)
           Your private space

         Type /switch <name> to change context.

User: /switch personal
Voyager: Switched to Personal context.
         This is your private space - nothing shared here.
```

## Implementation Order

| Phase | Effort | Dependency |
|-------|--------|------------|
| 1. Schema updates | 30min | None |
| 2. Voyage service | 2h | Phase 1 |
| 3. API routes | 1.5h | Phase 2 |
| 4. UI commands & context | 2h | Phase 3 |
| 5. Knowledge scoping | 1.5h | Phase 2 |
| 6. Session scoping | 1h | Phases 2, 5 |

**Total: ~8.5 hours**

**MVP (first community possible): Phases 1-4 (~6h)**
- Can create voyage, invite members, switch context
- Knowledge scoping can follow

## What Can Wait (Slice 4.5+)

- Deep voyage customization UI (character personality sliders)
- Member role management UI
- Voyage deletion/archival
- Voyage analytics
- Public/discoverable voyages
- Cross-voyage knowledge sharing

## Success Criteria

- [ ] User can `/create-voyage` and get an invite link
- [ ] User can click invite link and join voyage
- [ ] User can `/switch` between voyages
- [ ] Conversations are scoped to current voyage
- [ ] Knowledge emitted in voyage context stays in voyage
- [ ] Voyage config (settings JSONB) affects Voyager's behavior
- [ ] Captain can `/invite` to get/regenerate invite link

## Files to Create

```
lib/voyage/
  index.ts              - Voyage service
  types.ts              - TypeScript types

app/api/voyages/
  route.ts              - List/create voyages
  [slug]/
    route.ts            - Get/update voyage
    members/route.ts    - List members
    invite/route.ts     - Regenerate invite
  join/
    [code]/route.ts     - Join via invite code

app/join/
  [code]/page.tsx       - Invite landing page

supabase/migrations/
  014_voyage_updates.sql - Schema updates

components/voyage/
  VoyageSwitcher.tsx    - Context bar dropdown
  VoyageCreator.tsx     - Creation flow
  VoyageSettings.tsx    - Config panel (captain)
```

## Notes

**Naming:**
- "Voyage" = the community/team container
- "Captain" = admin/creator
- "Navigator" = trusted member (can manage some things)
- "Crew" = regular member
- "Observer" = read-only (future)

**The nautical theme extends the Voyager metaphor - you're going on a voyage together.**
