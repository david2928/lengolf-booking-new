# LENGOLF Website Chat Interface - Complete Documentation

**Customer support chat system integrated into the LENGOLF booking website — near-real-time message delivery via polling**

## 📋 Table of Contents

1. [Overview](#overview)
2. [User Experience](#user-experience)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema](#database-schema)
5. [API Documentation](#api-documentation)
6. [Component Architecture](#component-architecture)
7. [Message Delivery (Polling)](#message-delivery-polling)
8. [Integration with Backoffice](#integration-with-backoffice)
9. [Security & Privacy](#security--privacy)
10. [Performance Considerations](#performance-considerations)
11. [Deployment & Configuration](#deployment--configuration)
12. [Troubleshooting](#troubleshooting)

## 1. Overview

### What is the Chat Interface?

The LENGOLF Chat Interface is a customer support system that allows website visitors to communicate directly with staff members. It features:

- **Floating chat widget** - Messenger-style button in bottom-right corner
- **Near-real-time messaging** - New messages picked up by polling an ownership-checked API route (3s interval while the tab is visible)
- **User persistence** - Messages saved for logged-in users across sessions
- **Staff notifications** - Automatic alerts when customers send messages
- **Mobile responsive** - Works seamlessly on all devices
- **Multi-channel ready** - Designed to integrate with existing LINE chat system

### Key Features

✅ **Anonymous & Authenticated Support** - Works for both guest users and logged-in customers
✅ **Message Persistence** - Conversation history maintained across browser sessions
✅ **Near-real-time Updates** - New messages appear within seconds without page refreshes (polling, no WebSockets)
✅ **Staff Notifications** - Alerts staff via existing notification systems
✅ **Single Conversation per User** - Each logged-in user has exactly one persistent conversation
✅ **Responsive Design** - Optimized for desktop, tablet, and mobile devices
✅ **Typing Indicators** - Shows when staff members are responding
✅ **Read Status** - Tracks message read/unread status
✅ **Character Limits** - 1000 character limit with visual feedback

## 2. User Experience

### For Anonymous Users (Not Logged In)

#### Initial Experience
1. **Chat Button Visibility**: Green floating button (🌐) in bottom-right corner
2. **First Click**: Chat window opens with welcome message
3. **Session Creation**: Browser generates unique session ID stored in localStorage
4. **Messaging**: Can send messages immediately, no registration required

#### Chat Interface
```
┌─────────────────────────────┐
│ LENGOLF Booking        [×]  │
│ Chat with us               │
├─────────────────────────────┤
│                            │
│     How can we help?       │
│   We usually reply in a    │
│     few minutes.           │
│                            │
│ Hello, I need help    [Me] │
│                            │
│ [Staff is typing...]       │
│                            │
├─────────────────────────────┤
│ Type your message...   [→] │
└─────────────────────────────┘
```

#### Limitations for Anonymous Users
- **Session-based**: Messages only persist while browser session is active
- **No cross-device sync**: Messages don't sync across different devices
- **Limited context**: Staff see session ID as customer identifier

### For Authenticated Users (Logged In)

#### Enhanced Experience
1. **Persistent Conversations**: Single conversation maintained across all devices and sessions
2. **Rich User Context**: Staff see real name, email, and VIP status
3. **Cross-device Continuity**: Start conversation on desktop, continue on mobile
4. **Conversation History**: All messages preserved indefinitely

#### User Journey Flow
```
Anonymous User          →    Logs In           →    Authenticated User
├─ Session-based        │    ├─ Account link    │    ├─ Persistent conversation
├─ Browser localStorage │    ├─ Data migration  │    ├─ Cross-device sync
├─ Limited context      │    └─ Context merge   │    └─ Rich user profile
└─ Temporary session    │                      │
                        │                      │
    "chat_1234_abc"     →    User ID detected  →    "user_27585f9f-..."
```

### Chat Widget States

#### 1. **Closed State**
- **Appearance**: Green circular button with messenger icon
- **Size**: 56px diameter (configurable)
- **Icon**: 25px messenger/chat icon
- **Badge**: Red notification badge if unread messages exist
- **Animation**: Subtle hover scale (110%) with smooth transition

#### 2. **Open State**
- **Dimensions**: 320px × 448px (responsive on mobile: calc(100vw - 2rem))
- **Position**: Fixed bottom-right (4px padding on mobile, 6px on desktop)
- **Structure**: Header + Messages + Input sections
- **Animations**: Smooth fade-in and slide-up entrance

#### 3. **Loading States**
- **Initial Load**: Skeleton placeholders for messages
- **Sending**: Disabled input with loading indicator
- **Connection**: Polling silently retries after network errors; a permanent "Chat session ended" error is shown if access to the conversation is lost

## 3. Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    LENGOLF Chat Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend (Next.js)              Backend (Next.js API routes)   │
│  ┌─────────────────┐              ┌────────────────────────┐     │
│  │ Chat Widget     │              │ API Routes             │     │
│  │ ├─ ChatButton   │   HTTP       │ (service-role client,  │     │
│  │ ├─ ChatWindow   │◄────────────►│  ownership-checked)    │     │
│  │ ├─ ChatMessages │              │ ├─ /api/chat/initialize │     │
│  │ └─ ChatInput    │              │ ├─ /api/chat/send       │     │
│  └─────────────────┘              │ ├─ /api/chat/messages   │     │
│           │                       │ └─ /api/chat/mark-read  │     │
│           ▼                       └───────────┬────────────┘     │
│  ┌─────────────────┐                          │                  │
│  │ useChatSession  │                          ▼                  │
│  │ Hook            │              ┌────────────────────────┐     │
│  │ (polling loop:  │              │ Supabase (Postgres)    │     │
│  │  3s visible /   │              │ ├─ web_chat_sessions   │     │
│  │  15s hidden)    │              │ ├─ web_chat_conversations│    │
│  └─────────────────┘              │ └─ web_chat_messages    │     │
│           │                       └────────────────────────┘     │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ lib/chatPolling │  pure merge / diff / unread helpers         │
│  └─────────────────┘                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Message Sending Flow
```
1. User types message in ChatInput
2. ChatInput calls sendMessage() from useChatSession
3. useChatSession sends POST to /api/chat/send
4. API route stores the message in web_chat_messages (service-role client)
5. The /api/chat/send response echoes the persisted message row (plus any
   out-of-hours auto-reply); the hook merges it into local state immediately,
   so the sender's own bubble never waits for a poll
6. Other participants (staff in the backoffice, the customer's other
   tabs/devices) pick the message up on their next poll of /api/chat/messages
```

#### Session Management Flow
```
1. Component mounts, useChatSession hook initializes
2. Hook calls getSessionId() to determine session identifier
   ├─ For anonymous users: localStorage session ID
   └─ For logged-in users: user_${user.id}
3. Hook calls initializeChat() which posts to /api/chat/initialize
4. API creates or retrieves chat session and conversation
5. Hook loads existing messages via POST /api/chat/messages and starts
   the polling loop for the conversation
6. Chat widget displays with conversation history
```

## 4. Database Schema

### Table Relationships

```sql
profiles (NextAuth users)
    ├─ id (uuid) ──┐
    └─ ...         │
                   │
web_chat_sessions  │
    ├─ id (uuid, PK) ──┐
    ├─ session_id (text, unique) -- Browser session identifier
    ├─ user_id (uuid) ─┼──── References profiles.id
    ├─ customer_id (uuid) -- CRM customer reference
    ├─ display_name (text)
    ├─ email (text)
    ├─ last_seen_at (timestamp)
    └─ created_at (timestamp)
                   │
web_chat_conversations
    ├─ id (uuid, PK) ──┐
    ├─ session_id (uuid) ─┼──── References web_chat_sessions.id
    ├─ user_id (uuid) ────┼──── References profiles.id (denormalized)
    ├─ is_active (boolean)
    ├─ last_message_at (timestamp)
    ├─ last_message_text (text)
    ├─ unread_count (integer)
    └─ created_at (timestamp)
                   │
web_chat_messages  │
    ├─ id (uuid, PK)
    ├─ conversation_id (uuid) ─┼──── References web_chat_conversations.id
    ├─ session_id (text) ────────── References web_chat_sessions.session_id
    ├─ message_text (text)
    ├─ sender_type ('customer' | 'staff' | 'bot')
    ├─ sender_name (text, optional)
    ├─ is_read (boolean)
    └─ created_at (timestamp)
```

### Database Constraints

#### Unique Constraints
```sql
-- Only one active conversation per user (enforced at DB level)
CREATE UNIQUE INDEX idx_unique_active_conversation_per_user
ON web_chat_conversations (user_id)
WHERE is_active = true AND user_id IS NOT NULL;

-- Unique session identifier per session
ALTER TABLE web_chat_sessions ADD CONSTRAINT unique_session_id UNIQUE (session_id);
```

#### Foreign Key Relationships
```sql
-- Sessions reference user profiles
web_chat_sessions.user_id → profiles.id

-- Conversations reference sessions
web_chat_conversations.session_id → web_chat_sessions.id

-- Messages reference conversations
web_chat_messages.conversation_id → web_chat_conversations.id
```

### Row Level Security (RLS)

All tables implement Supabase Row Level Security policies:

```sql
-- Users can only access their own chat sessions
CREATE POLICY "Users can view own sessions" ON web_chat_sessions
FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

-- Users can only access their own conversations
CREATE POLICY "Users can view own conversations" ON web_chat_conversations
FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

-- Users can only access messages from their conversations
CREATE POLICY "Users can view own messages" ON web_chat_messages
FOR SELECT USING (
  conversation_id IN (
    SELECT id FROM web_chat_conversations
    WHERE user_id = auth.uid() OR user_id IS NULL
  )
);
```

## 5. API Documentation

### POST /api/chat/initialize

**Purpose**: Initialize or retrieve existing chat session and conversation

#### Request Body
```typescript
{
  sessionId: string;           // Browser session ID or user-based ID
  userInfo?: {                 // Optional user context (if authenticated)
    userId?: string;           // NextAuth user ID
    displayName?: string;      // User's display name
    email?: string;            // User's email
    customerId?: string;       // CRM customer ID (if VIP)
  }
}
```

#### Response
```typescript
{
  success: true;
  session: ChatSession;        // Created or updated session
  conversation: ChatConversation; // Active conversation for this user
}
```

#### Error Responses
- `400`: Missing sessionId
- `500`: Database error creating session/conversation

### POST /api/chat/send

**Purpose**: Send a new message in the conversation

#### Request Body
```typescript
{
  conversationId: string;      // Target conversation UUID
  sessionId: string;           // Session identifier
  message: string;             // Message content (max 1000 chars)
  senderType?: 'customer' | 'staff'; // Default: 'customer'
  senderName?: string;         // Optional sender name (for staff)
}
```

#### Response
```typescript
{
  success: true;
  message: ChatMessage;        // Created message object
  autoReply?: ChatMessage;     // Out-of-hours auto-reply, if one was generated
}
```

The widget merges `message` (and `autoReply`) into local state directly from
this response, so the sender's own bubble appears without waiting for the
next poll.

#### Error Responses
- `400`: Missing required fields or invalid message length
- `500`: Database error creating message

### POST /api/chat/messages

**Purpose**: Fetch messages for a conversation with ownership checks. This is
the route the widget polls for new messages (see
[Message Delivery (Polling)](#message-delivery-polling)).

#### Request Body
```typescript
{
  conversationId: string;      // Conversation UUID
  sessionId?: string;          // Required for anonymous users (ownership proof)
}
```

#### Authorization
- **Authenticated users** (NextAuth session present): the conversation's
  `user_id` must match the logged-in user.
- **Anonymous users**: the supplied `sessionId` must match the
  `web_chat_sessions.session_id` of the conversation's session.

#### Response
```typescript
{
  success: true;
  messages: ChatMessage[];     // The LATEST 50 messages, ascending by created_at
}
```

The route fetches the newest 50 rows descending, then reverses them, so long
conversations always include the newest replies. (An ascending query with a
limit would return the *oldest* 50 and hide new replies — fatal for the
polling widget.)

#### Error Responses
- `400`: Missing conversationId, or missing sessionId for anonymous users
- `403`: Conversation not found, belongs to a different user, or session
  mismatch — the widget treats this as permanent and stops polling
- `500`: Transient database error — deliberately distinct from 403 so the
  widget's poll loop retries instead of stopping

### POST /api/chat/mark-read

**Purpose**: Mark messages as read and reset unread count

#### Request Body
```typescript
{
  conversationId: string;      // Conversation to mark as read
}
```

#### Response
```typescript
{
  success: true;
}
```

## 6. Component Architecture

### Component Hierarchy

```
ChatWidget (Main Container)
├─ ChatButton (Floating Button)
│  └─ Badge (Unread Count)
└─ ChatWindow (Chat Interface)
   ├─ Header (Title + Close Button)
   ├─ ChatMessages (Message Display)
   │  ├─ MessageBubble (Individual Messages)
   │  ├─ TypingIndicator (Staff Typing)
   │  └─ EmptyState (Welcome Message)
   └─ ChatInput (Message Input)
      ├─ Input Field
      ├─ Send Button
      └─ Character Counter
```

### Component Props & State

#### ChatWidget
```typescript
interface ChatWidgetProps {
  // No props - self-contained component
}

interface ChatWidgetState {
  isOpen: boolean;             // Chat window visibility
}
```

#### ChatButton
```typescript
interface ChatButtonProps {
  onClick: () => void;         // Open chat window handler
  unreadCount: number;         // Number of unread messages
}
```

#### ChatWindow
```typescript
interface ChatWindowProps {
  onClose: () => void;         // Close chat window handler
  chatSession: ChatSession;    // Current session data
  messages: ChatMessage[];     // Array of messages
  isLoading: boolean;          // Loading state
  error: string | null;        // Error state
  isTyping: boolean;           // Staff typing indicator
  sendMessage: (message: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  initializeChat: () => Promise<void>;
}
```

#### ChatMessages
```typescript
interface ChatMessagesProps {
  messages: ChatMessage[];     // Messages to display
  isLoading: boolean;          // Show loading skeletons
  isTyping: boolean;           // Show typing indicator
  error: string | null;        // Display error state
}
```

#### ChatInput
```typescript
interface ChatInputProps {
  onSendMessage: (message: string) => Promise<void>;
  disabled?: boolean;          // Disable input during loading
}
```

### Hook Architecture - useChatSession

The `useChatSession` hook manages all chat state and operations:

```typescript
interface ChatSessionHook {
  // Session State
  chatSession: ChatSession;    // Current session info
  isLoading: boolean;          // Overall loading state
  error: string | null;        // Error messages

  // Messages
  messages: ChatMessage[];     // Current conversation messages
  unreadCount: number;         // Unread message count
  isTyping: boolean;           // Typing indicator state

  // Actions
  sendMessage: (message: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  initializeChat: () => Promise<void>;
}
```

## 7. Message Delivery (Polling)

### Why polling, not realtime

Until July 2026 the widget held a Supabase realtime subscription
(`postgres_changes` on `web_chat_messages`) opened with the browser anon-key
client. The 2026-07 Supabase security hardening revoked anon SELECT on
`web_chat_messages`, which both broke that subscription and closed the
security surface it depended on. As of PR #75 (merged 2026-07-20, commit
`64fab50`), the widget instead polls the ownership-checked
`POST /api/chat/messages` route, which runs server-side with the service-role
client and verifies conversation ownership on every request. The browser
never queries the chat tables directly — do not re-grant anon/authenticated
access to them.

### The polling loop (`hooks/useChatSession.ts`)

A `useEffect` keyed on the conversation ID runs a self-scheduling loop:

- **Interval**: 3 seconds while the tab is visible, 15 seconds while hidden
  (`document.visibilityState`). The next tick is scheduled via `setTimeout`
  *after* the previous response completes, so ticks never overlap (an
  `inFlight` guard covers re-entry).
- **Catch-up on tab return**: a `visibilitychange` listener fires an
  immediate poll when the tab becomes visible again, so returning users
  don't wait out a 15-second hidden-tab interval.
- **Merging**: each poll response (latest 50 messages) is merged into local
  state with the pure helpers in `lib/chatPolling.ts` — nothing is blindly
  appended, so the sent-message echo and poll results never duplicate.
- **Typing indicator**: `isTyping` is set while a send is in flight and
  cleared when a `bot` message arrives via poll.
- **Unread count**: recomputed from the poll response via `countUnread`
  (unread bot/staff messages; the customer's own messages never count).

### Terminal vs transient failures

- **401 / 403 / 404** → polling stops **permanently** and the widget shows
  "Chat session ended". These mean access is gone for good (conversation
  deactivated or deleted, or session mismatch after logout); each further
  tick would cost the server 2–3 DB queries with an answer that won't change.
- **5xx and network errors** → silently retried on the next tick. The
  `/api/chat/messages` route deliberately returns 500 (not 403) on transient
  DB failures so a blip can't kill the loop.

### Pure merge helpers (`lib/chatPolling.ts`)

```typescript
// Union prev + incoming by id (server copy wins), sorted by created_at
// ascending (ties broken by id).
mergeMessages(prev, incoming): ChatMessage[]

// Incoming messages whose id is not already in prev — used to detect
// whether a poll actually delivered anything new.
diffNew(prev, incoming): ChatMessage[]

// Unread messages from bot/staff (customer's own messages never count).
countUnread(messages): number
```

These are side-effect-free and unit-testable; the hook owns all state and
scheduling.

### Sent-message echo

`POST /api/chat/send` returns the persisted message row (and any
out-of-hours auto-reply) in its response. The hook merges those rows into
state immediately via `mergeMessages`, so the sender's own bubble appears
without waiting for the next poll — and when the poll later returns the same
rows, the id-based merge dedupes them.

### Delivery latency

| Scenario | Latency |
|---|---|
| Sender's own message | Immediate (echoed from the send response) |
| Staff/bot reply, tab visible | ≤ 3 seconds |
| Staff/bot reply, tab hidden | ≤ 15 seconds |
| Tab returns to foreground | Immediate catch-up poll |

## 8. Integration with Backoffice

### Unified Chat Architecture

The website chat is designed to integrate seamlessly with the existing LINE chat system through unified database views:

```sql
-- Unified conversations view combining LINE and website chats
CREATE VIEW unified_conversations AS
SELECT
  'website' as channel_type,
  id,
  session_id as channel_user_id,
  user_id,
  last_message_at,
  last_message_text,
  unread_count,
  is_active,
  created_at,
  jsonb_build_object(
    'session_id', session_id,
    'display_name', (SELECT display_name FROM web_chat_sessions WHERE id = session_id),
    'email', (SELECT email FROM web_chat_sessions WHERE id = session_id)
  ) as channel_metadata
FROM web_chat_conversations

UNION ALL

SELECT
  'line' as channel_type,
  id,
  line_user_id as channel_user_id,
  (SELECT user_id FROM line_users WHERE line_user_id = line_conversations.line_user_id) as user_id,
  last_message_at,
  last_message_text,
  unread_count,
  is_active,
  created_at,
  jsonb_build_object(
    'line_user_id', line_user_id,
    'display_name', (SELECT display_name FROM line_users WHERE line_user_id = line_conversations.line_user_id),
    'picture_url', (SELECT picture_url FROM line_users WHERE line_user_id = line_conversations.line_user_id)
  ) as channel_metadata
FROM line_conversations;
```

### Staff Dashboard Integration

The existing staff dashboard can be enhanced to show both LINE and website conversations:

```typescript
// Staff dashboard conversation list
const { data: conversations } = await supabase
  .from('unified_conversations')
  .select('*')
  .eq('is_active', true)
  .order('last_message_at', { ascending: false });

// Display with channel indicators
conversations.map((conv) => (
  <div key={conv.id} className="conversation-item">
    <div className="channel-indicator">
      {conv.channel_type === 'line' ? '💚' : '🌐'}
      <span>{conv.channel_type.toUpperCase()}</span>
    </div>
    <div className="customer-info">
      {conv.channel_type === 'line'
        ? conv.channel_metadata.display_name
        : `Website User (${conv.channel_metadata.email})`
      }
    </div>
    <div className="last-message">{conv.last_message_text}</div>
  </div>
));
```

### Staff Response Handling

Staff can reply to website conversations through the unified interface:

```typescript
// Staff reply handler
const replyToWebsiteChat = async (conversationId: string, message: string) => {
  // Insert staff message into web_chat_messages
  await supabase
    .from('web_chat_messages')
    .insert({
      conversation_id: conversationId,
      session_id: session.id,
      message_text: message,
      sender_type: 'staff',
      sender_name: staffMember.name
    });

  // The customer's widget picks this up on its next poll of
  // /api/chat/messages (≤3s when their tab is visible)
};
```

## 9. Security & Privacy

### Data Protection

#### Anonymous Users
- **Limited Data Collection**: Only session ID, IP address, and message content
- **No PII Storage**: No personal information stored unless voluntarily provided in messages
- **Session Isolation**: Each browser session is completely isolated
- **Data Retention**: Anonymous sessions can be cleaned up after inactivity period

#### Authenticated Users
- **User Consent**: Chat history linked to user account with clear privacy policy
- **Data Minimization**: Only essential data stored (user ID, messages, timestamps)
- **User Control**: Users can delete their chat history through account settings
- **GDPR Compliance**: Data handling follows GDPR guidelines for user data

### Security Measures

#### Row Level Security (RLS)
```sql
-- Prevent users from accessing other users' data
CREATE POLICY "Users access own data only" ON web_chat_messages
FOR ALL USING (
  session_id IN (
    SELECT session_id FROM web_chat_sessions
    WHERE user_id = auth.uid() OR user_id IS NULL
  )
);
```

#### Input Validation
```typescript
// Server-side message validation
const validateMessage = (message: string): boolean => {
  if (!message || typeof message !== 'string') return false;
  if (message.trim().length === 0) return false;
  if (message.length > 1000) return false;
  return true;
};
```

#### Rate Limiting
```typescript
// Prevent message spam
const RATE_LIMIT = {
  MESSAGES_PER_MINUTE: 10,
  MESSAGES_PER_HOUR: 100
};

const checkRateLimit = async (sessionId: string): Promise<boolean> => {
  const recentMessages = await supabase
    .from('web_chat_messages')
    .select('created_at')
    .eq('session_id', sessionId)
    .gte('created_at', new Date(Date.now() - 60000).toISOString());

  return recentMessages.length < RATE_LIMIT.MESSAGES_PER_MINUTE;
};
```

#### Content Sanitization
```typescript
// Sanitize message content
import DOMPurify from 'dompurify';

const sanitizeMessage = (message: string): string => {
  // Remove HTML tags and potentially dangerous content
  return DOMPurify.sanitize(message, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
};
```

## 10. Performance Considerations

### Frontend Optimization

#### Component Optimization
```typescript
// Memoized message components to prevent unnecessary re-renders
const MessageBubble = React.memo(({ message }: { message: ChatMessage }) => {
  return (
    <div className={`message ${message.sender_type}`}>
      <p>{message.message_text}</p>
      <span className="timestamp">{formatTime(message.created_at)}</span>
    </div>
  );
});
```

#### Efficient Message Loading
```typescript
// Server-side, in /api/chat/messages: fetch the LATEST 50 rows descending,
// then reverse so the response is ascending. Ascending+limit would return
// the OLDEST 50 and hide new replies in long conversations — fatal for the
// polling widget.
const { data: messages } = await supabase
  .from('web_chat_messages')
  .select('*')
  .eq('conversation_id', conversationId)
  .order('created_at', { ascending: false })
  .limit(50);

return NextResponse.json({ success: true, messages: (messages || []).reverse() });
```

The 50-message window also bounds every poll's payload and the widget's
in-memory state — the widget never accumulates an unbounded history.

#### Optimistic Updates
```typescript
// Add message to UI immediately, then sync with server
const sendMessage = async (messageText: string) => {
  const optimisticMessage = {
    id: `temp_${Date.now()}`,
    message_text: messageText,
    sender_type: 'customer',
    created_at: new Date().toISOString(),
    is_read: false
  };

  // Add to UI immediately
  setMessages(prev => [...prev, optimisticMessage]);

  try {
    // Send to server
    await api.sendMessage(messageText);
  } catch (error) {
    // Remove optimistic message on error
    setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
    setError('Failed to send message');
  }
};
```

### Backend Optimization

#### Database Indexing
```sql
-- Optimize message queries
CREATE INDEX idx_messages_conversation_created ON web_chat_messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_user_active ON web_chat_conversations(user_id, is_active, last_message_at DESC);
CREATE INDEX idx_sessions_user_active ON web_chat_sessions(user_id, last_seen_at DESC);
```

#### Connection Pooling
```typescript
// Supabase connection configuration (server-side service-role client)
const supabaseConfig = {
  db: {
    pooler: {
      poolMode: 'transaction',
      maxConnections: 20
    }
  }
};
```

Each poll costs the server 2–3 queries (conversation ownership check,
optional anonymous-session check, message fetch) — this is why the widget
permanently stops polling once access is confirmed lost (401/403/404).

#### Query Optimization
```sql
-- Efficient conversation loading with user context
SELECT
  wcc.*,
  wcs.display_name,
  wcs.email,
  (SELECT COUNT(*) FROM web_chat_messages WHERE conversation_id = wcc.id) as message_count
FROM web_chat_conversations wcc
LEFT JOIN web_chat_sessions wcs ON wcc.session_id = wcs.id
WHERE wcc.user_id = $1 AND wcc.is_active = true
ORDER BY wcc.last_message_at DESC;
```

### Memory Management

#### Message History Limits

Message state is bounded by construction: every poll returns at most the
latest 50 messages, and `mergeMessages` unions by id, so in-memory state only
grows past 50 by the handful of just-sent messages echoed from
`/api/chat/send` before they fall out of the window. No separate cap or
eviction logic is needed.

#### Cleanup on Unmount
```typescript
// The polling effect cancels its loop, clears the pending timer, and
// removes the visibilitychange listener on unmount / conversation change
useEffect(() => {
  // ...polling loop...
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}, [skip, chatSession.conversationId, chatSession.sessionId]);
```

## 11. Deployment & Configuration

### Environment Variables

```env
# Required for chat functionality
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: For enhanced features
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-nextauth-secret

# Optional: For staff notifications
LINE_CHANNEL_ACCESS_TOKEN=your-line-token
LINE_GROUP_ID=your-line-group-id
```

### Database Migration

```sql
-- Run these migrations to set up the chat system
-- 1. Create chat tables
CREATE TABLE web_chat_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id text UNIQUE NOT NULL,
  user_id uuid REFERENCES profiles(id),
  customer_id uuid,
  display_name text,
  email text,
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE web_chat_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES web_chat_sessions(id),
  user_id uuid REFERENCES profiles(id),
  is_active boolean DEFAULT true,
  last_message_at timestamptz DEFAULT now(),
  last_message_text text,
  unread_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE web_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES web_chat_conversations(id),
  session_id text NOT NULL,
  message_text text NOT NULL,
  sender_type text CHECK (sender_type IN ('customer', 'staff', 'bot')) DEFAULT 'customer',
  sender_name text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Create indexes
CREATE INDEX idx_chat_sessions_user ON web_chat_sessions(user_id);
CREATE INDEX idx_chat_conversations_session ON web_chat_conversations(session_id);
CREATE INDEX idx_chat_conversations_user_active ON web_chat_conversations(user_id, is_active);
CREATE INDEX idx_chat_messages_conversation ON web_chat_messages(conversation_id, created_at);

-- 3. Create unique constraint (one active conversation per user)
CREATE UNIQUE INDEX idx_unique_active_conversation_per_user
ON web_chat_conversations (user_id)
WHERE is_active = true AND user_id IS NOT NULL;

-- 4. Enable RLS
ALTER TABLE web_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_chat_messages ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies
-- (Add appropriate RLS policies based on your auth setup)
```

### Supabase Configuration

#### No realtime publication needed

The customer widget does **not** use Supabase realtime — message delivery is
polling via `/api/chat/messages`. The chat tables do not need to be in the
`supabase_realtime` publication for the widget to work.

#### Permissions Setup

All widget access goes through server-side API routes using the service-role
key; the browser never queries the chat tables directly. Anon SELECT on
`web_chat_messages` was revoked in the 2026-07 Supabase security hardening —
**do not re-grant anon or authenticated table access for the widget**. New
chat features should follow the same pattern: an API route with
`createServerClient()` plus an explicit ownership check.

### Next.js Configuration

#### Component Integration
```typescript
// Add ChatWidget to your root layout
// app/layout.tsx
import ChatWidget from '@/components/chat/ChatWidget';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>
          {children}
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
```

#### API Route Registration
Ensure these API routes are available:
- `/api/chat/initialize` - Session initialization
- `/api/chat/send` - Message sending (response echoes the persisted row)
- `/api/chat/messages` - Message fetch (polled by the widget)
- `/api/chat/mark-read` - Mark messages as read

## 12. Troubleshooting

### Common Issues & Solutions

#### 1. **Messages Not Appearing After Page Refresh**

**Symptoms**: Logged-in user's messages disappear on page reload

**Cause**: Session ID mismatch between frontend and database

**Solution**:
```typescript
// Check session ID generation
const getSessionId = useCallback(() => {
  if (session?.user?.id) {
    return `user_${session.user.id}`; // Consistent for logged-in users
  }

  let sessionId = localStorage.getItem('chat_session_id');
  if (!sessionId) {
    sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('chat_session_id', sessionId);
  }
  return sessionId;
}, [session?.user?.id]);
```

#### 2. **New Messages Not Appearing (Polling Issues)**

**Symptoms**: Staff replies don't show up in the widget, or only appear after
reopening the chat

**Diagnosis Steps**:
1. Open the browser Network tab and confirm `POST /api/chat/messages` fires
   roughly every 3 seconds while the chat is open and the tab is visible
   (every 15 seconds when the tab is hidden).
2. Check the response status:
   - **200 but stale content** — verify the reply row actually landed in
     `web_chat_messages` with the right `conversation_id`. Also remember the
     route returns only the **latest 50** messages; a "missing" old message
     may simply have fallen out of the window.
   - **401 / 403 / 404** — the widget stops polling permanently and shows
     "Chat session ended". Expected after logout (session mismatch), or if
     the conversation was deactivated or deleted. Reopening/reinitializing
     the chat creates a fresh conversation context.
   - **500** — transient; the loop retries on the next tick. Investigate
     only if it persists (check server logs for the Supabase error).
3. If no polls fire at all, verify `chatSession.conversationId` is set
   (initialization succeeded) and the page isn't a LIFF page (the hook is
   skipped there via the `skip` option).

**Common Fixes**:
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
  (the messages route uses the service-role client server-side)
- For anonymous users, confirm `chat_session_id` in localStorage matches the
  session the conversation was created under

#### 3. **Database Connection Errors**

**Symptoms**: API routes returning 500 errors, database operations failing

**Check List**:
```typescript
// Test database connection
const testDatabaseConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('web_chat_sessions')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Database error:', error);
      return false;
    }

    console.log('Database connection working');
    return true;
  } catch (err) {
    console.error('Connection failed:', err);
    return false;
  }
};
```

#### 4. **Foreign Key Constraint Errors**

**Symptoms**: Error creating sessions: "violates foreign key constraint"

**Solution**: Remove or fix foreign key constraints
```sql
-- Check for problematic constraints
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'web_chat_sessions';

-- Drop problematic constraint if needed
ALTER TABLE web_chat_sessions DROP CONSTRAINT IF EXISTS web_chat_sessions_user_id_fkey;
```

#### 5. **Chat Widget Not Appearing**

**Symptoms**: Chat button doesn't show on website

**Check List**:
- Verify `<ChatWidget />` is added to layout
- Check CSS z-index conflicts
- Verify component imports are correct
- Check browser console for JavaScript errors

#### 6. **Performance Issues with Many Messages**

**Symptoms**: Chat becomes slow with long conversation history

**Optimization**:
```typescript
// Implement message pagination
const loadMessages = async (conversationId: string, offset = 0, limit = 50) => {
  const { data } = await supabase
    .from('web_chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  return data?.reverse() || [];
};

// Load older messages on scroll
const loadOlderMessages = () => {
  if (messagesOffset > 0) {
    loadMessages(conversationId, messagesOffset, 20);
    setMessagesOffset(prev => prev + 20);
  }
};
```

### Debug Commands

#### Check Chat Session Status
```sql
-- View all sessions for a user
SELECT
  wcs.session_id,
  wcs.user_id,
  wcs.display_name,
  wcs.created_at,
  wcc.id as conversation_id,
  wcc.is_active,
  COUNT(wcm.id) as message_count
FROM web_chat_sessions wcs
LEFT JOIN web_chat_conversations wcc ON wcs.id = wcc.session_id
LEFT JOIN web_chat_messages wcm ON wcc.id = wcm.conversation_id
WHERE wcs.user_id = 'user-uuid-here'
GROUP BY wcs.session_id, wcs.user_id, wcs.display_name, wcs.created_at, wcc.id, wcc.is_active;
```

#### Check Message Flow
```sql
-- View recent messages with context
SELECT
  wcm.message_text,
  wcm.sender_type,
  wcm.created_at,
  wcs.display_name,
  wcc.is_active
FROM web_chat_messages wcm
JOIN web_chat_conversations wcc ON wcm.conversation_id = wcc.id
JOIN web_chat_sessions wcs ON wcc.session_id = wcs.id
WHERE wcs.user_id = 'user-uuid-here'
ORDER BY wcm.created_at DESC
LIMIT 20;
```

#### Test the Polled Messages Endpoint
```typescript
// From the browser console on the site (authenticated users need their
// NextAuth cookie, which fetch sends automatically; anonymous users must
// supply the sessionId from localStorage)
const testMessagesEndpoint = async (conversationId) => {
  const response = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      sessionId: localStorage.getItem('chat_session_id'),
    }),
  });
  console.log('Status:', response.status); // 403/404 => widget stops polling
  console.log(await response.json());      // latest 50 messages, ascending
};
```

## 📞 Support & Maintenance

### Monitoring & Metrics

Track these key metrics for chat system health:

- **Message Delivery Rate**: Percentage of messages successfully delivered
- **Polling Success Rate**: Share of `/api/chat/messages` polls returning 200 (watch for sustained 500s or unexpected 403s)
- **Average Response Time**: Time between customer message and staff reply
- **Session Persistence**: Percentage of returning users who see their message history
- **Error Rates**: Database errors, API failures, permanently-stopped poll loops ("Chat session ended")

### Regular Maintenance Tasks

1. **Database Cleanup**: Remove old anonymous sessions (>30 days inactive)
2. **Performance Monitoring**: Track query performance and optimize slow queries
3. **Polling Health**: Monitor `/api/chat/messages` volume and error rates (each open, visible widget polls every 3s)
4. **Security Updates**: Regular updates to dependencies and security patches
5. **Backup Verification**: Ensure chat data is included in regular backups

This comprehensive documentation covers all aspects of the LENGOLF website chat interface. The system is designed to be scalable, maintainable, and user-friendly while integrating seamlessly with existing infrastructure.