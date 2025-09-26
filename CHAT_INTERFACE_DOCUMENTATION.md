# LENGOLF Website Chat Interface - Complete Documentation

**Real-time customer support chat system integrated into the LENGOLF booking website**

## 📋 Table of Contents

1. [Overview](#overview)
2. [User Experience](#user-experience)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema](#database-schema)
5. [API Documentation](#api-documentation)
6. [Component Architecture](#component-architecture)
7. [Real-time Features](#real-time-features)
8. [Integration with Backoffice](#integration-with-backoffice)
9. [Security & Privacy](#security--privacy)
10. [Performance Considerations](#performance-considerations)
11. [Deployment & Configuration](#deployment--configuration)
12. [Troubleshooting](#troubleshooting)

## 1. Overview

### What is the Chat Interface?

The LENGOLF Chat Interface is a real-time customer support system that allows website visitors to communicate directly with staff members. It features:

- **Floating chat widget** - Messenger-style button in bottom-right corner
- **Real-time messaging** - Instant message delivery via Supabase subscriptions
- **User persistence** - Messages saved for logged-in users across sessions
- **Staff notifications** - Automatic alerts when customers send messages
- **Mobile responsive** - Works seamlessly on all devices
- **Multi-channel ready** - Designed to integrate with existing LINE chat system

### Key Features

✅ **Anonymous & Authenticated Support** - Works for both guest users and logged-in customers
✅ **Message Persistence** - Conversation history maintained across browser sessions
✅ **Real-time Updates** - Instant message delivery without page refreshes
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
- **Connection**: Reconnection indicators for real-time updates

## 3. Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    LENGOLF Chat Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend (Next.js)              Backend (Supabase)             │
│  ┌─────────────────┐              ┌────────────────────────┐     │
│  │ Chat Widget     │◄─────────────┤ Real-time Subscriptions │     │
│  │ ├─ ChatButton   │              │ ├─ postgres_changes     │     │
│  │ ├─ ChatWindow   │              │ └─ Message broadcasts   │     │
│  │ ├─ ChatMessages │              └────────────────────────┘     │
│  │ └─ ChatInput    │                                            │
│  └─────────────────┘              ┌────────────────────────┐     │
│           │                       │ Database Tables        │     │
│           │                       │ ├─ web_chat_sessions   │     │
│           ▼                       │ ├─ web_chat_conversations│     │
│  ┌─────────────────┐              │ └─ web_chat_messages    │     │
│  │ useChatSession  │◄─────────────┤                        │     │
│  │ Hook            │              └────────────────────────┘     │
│  └─────────────────┘                                            │
│           │                       ┌────────────────────────┐     │
│           ▼                       │ API Routes             │     │
│  ┌─────────────────┐              │ ├─ /api/chat/initialize │     │
│  │ ChatService     │◄─────────────┤ ├─ /api/chat/send       │     │
│  │ (Data Layer)    │              │ └─ /api/chat/mark-read  │     │
│  └─────────────────┘              └────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Message Sending Flow
```
1. User types message in ChatInput
2. ChatInput calls sendMessage() from useChatSession
3. useChatSession sends POST to /api/chat/send
4. API route calls ChatService.sendMessage()
5. ChatService stores message in web_chat_messages table
6. Supabase real-time subscription broadcasts message
7. All connected clients receive message instantly
8. Message appears in sender's and recipient's chat windows
```

#### Session Management Flow
```
1. Component mounts, useChatSession hook initializes
2. Hook calls getSessionId() to determine session identifier
   ├─ For anonymous users: localStorage session ID
   └─ For logged-in users: user_${user.id}
3. Hook calls initializeChat() which posts to /api/chat/initialize
4. API creates or retrieves chat session and conversation
5. Hook loads existing messages and sets up real-time subscription
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
}
```

#### Error Responses
- `400`: Missing required fields or invalid message length
- `500`: Database error creating message

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

## 7. Real-time Features

### Supabase Real-time Subscriptions

The chat system uses Supabase's real-time capabilities for instant message delivery:

```typescript
// Real-time subscription setup
const channel = supabase
  .channel(`chat-${conversationId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'web_chat_messages',
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      const newMessage = payload.new as ChatMessage;
      setMessages(prev => [...prev, newMessage]);

      // Update unread count for staff messages
      if (newMessage.sender_type === 'staff') {
        setUnreadCount(prev => prev + 1);
      }
    }
  )
  .subscribe();
```

### Message Broadcasting

When a message is sent:

1. **Database Insert**: Message stored in `web_chat_messages`
2. **Real-time Trigger**: Supabase broadcasts change to all subscribers
3. **Client Update**: All connected clients receive message instantly
4. **UI Update**: Message appears in chat window without refresh

### Connection Management

```typescript
// Connection state handling
useEffect(() => {
  const handleConnectionChange = () => {
    if (navigator.onLine) {
      // Reconnect and sync messages
      initializeChat();
    } else {
      // Show offline indicator
      setError('Connection lost. Messages will sync when online.');
    }
  };

  window.addEventListener('online', handleConnectionChange);
  window.addEventListener('offline', handleConnectionChange);

  return () => {
    window.removeEventListener('online', handleConnectionChange);
    window.removeEventListener('offline', handleConnectionChange);
  };
}, []);
```

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

  // Real-time subscription automatically delivers to customer
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
// Load messages with pagination to avoid loading entire conversation history
const loadMessages = useCallback(async (conversationId: string, limit = 50) => {
  const { data } = await supabase
    .from('web_chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data?.reverse() || []; // Show newest at bottom
}, []);
```

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
// Supabase connection configuration
const supabaseConfig = {
  db: {
    pooler: {
      poolMode: 'transaction',
      maxConnections: 20
    }
  },
  realtime: {
    maxChannels: 100,
    enableHeartbeats: true
  }
};
```

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
```typescript
// Limit messages in memory to prevent memory leaks
const MAX_MESSAGES_IN_MEMORY = 200;

const addMessage = (newMessage: ChatMessage) => {
  setMessages(prev => {
    const updated = [...prev, newMessage];
    // Keep only recent messages in memory
    return updated.length > MAX_MESSAGES_IN_MEMORY
      ? updated.slice(-MAX_MESSAGES_IN_MEMORY)
      : updated;
  });
};
```

#### Cleanup on Unmount
```typescript
// Proper cleanup of subscriptions and timers
useEffect(() => {
  return () => {
    if (channel) {
      supabase.removeChannel(channel);
    }
    if (typingTimer) {
      clearTimeout(typingTimer);
    }
  };
}, []);
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

#### Real-time Settings
```sql
-- Enable real-time for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE web_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE web_chat_conversations;
```

#### Permissions Setup
```sql
-- Grant necessary permissions for authenticated users
GRANT SELECT, INSERT, UPDATE ON web_chat_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON web_chat_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON web_chat_messages TO authenticated;
```

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
- `/api/chat/send` - Message sending
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

#### 2. **Real-time Updates Not Working**

**Symptoms**: Messages don't appear instantly, require page refresh

**Diagnosis Steps**:
```typescript
// Check Supabase connection
const testRealtimeConnection = async () => {
  const channel = supabase.channel('test-channel');

  channel.on('broadcast', { event: 'test' }, (payload) => {
    console.log('Real-time working:', payload);
  });

  channel.subscribe((status) => {
    console.log('Subscription status:', status);
  });

  // Test broadcast
  channel.send({ type: 'broadcast', event: 'test', payload: { message: 'test' } });
};
```

**Common Fixes**:
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Check Supabase real-time settings
- Ensure RLS policies allow real-time subscriptions
- Verify table is added to `supabase_realtime` publication

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

#### Test Real-time Subscription
```typescript
// Test real-time connection
const testRealtime = () => {
  const channel = supabase
    .channel('test-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'web_chat_messages'
      },
      (payload) => {
        console.log('New message received:', payload.new);
      }
    )
    .subscribe((status) => {
      console.log('Subscription status:', status);
    });

  // Clean up
  setTimeout(() => {
    supabase.removeChannel(channel);
    console.log('Test subscription cleaned up');
  }, 10000);
};
```

## 📞 Support & Maintenance

### Monitoring & Metrics

Track these key metrics for chat system health:

- **Message Delivery Rate**: Percentage of messages successfully delivered
- **Real-time Connection Success**: Rate of successful WebSocket connections
- **Average Response Time**: Time between customer message and staff reply
- **Session Persistence**: Percentage of returning users who see their message history
- **Error Rates**: Database errors, API failures, real-time disconnections

### Regular Maintenance Tasks

1. **Database Cleanup**: Remove old anonymous sessions (>30 days inactive)
2. **Performance Monitoring**: Track query performance and optimize slow queries
3. **Connection Monitoring**: Monitor real-time subscription health
4. **Security Updates**: Regular updates to dependencies and security patches
5. **Backup Verification**: Ensure chat data is included in regular backups

This comprehensive documentation covers all aspects of the LENGOLF website chat interface. The system is designed to be scalable, maintainable, and user-friendly while integrating seamlessly with existing infrastructure.