# Image Support for Website Chat

## User-Facing Website (This Application)

### Database Migration
```sql
ALTER TABLE web_chat_messages
ADD COLUMN message_type VARCHAR(20) DEFAULT 'text',
ADD COLUMN image_url TEXT;
```

### Code Changes

**1. Update TypeScript Interface** (`lib/chatService.ts`):
- Add `message_type?: 'text' | 'image'`
- Add `image_url?: string`

**2. Update Message Display** (`components/chat/ChatMessages.tsx`):
- Check if `message.message_type === 'image'`
- Render `<img>` tag for image messages
- Keep text rendering for regular messages

**3. Simple Image Display:**
```tsx
{message.message_type === 'image' ? (
  <img src={message.image_url} className="max-w-xs rounded-lg" />
) : (
  <p>{message.message_text}</p>
)}
```

---

## Backoffice Admin Application

### New Feature Required: Image Sending to Website Chat

**1. Add Image Upload Button** in existing chat interface:
- Upload image to existing storage
- Get public URL after upload

**2. Create Send Image Method:**
```javascript
// Using existing Supabase service client
async function sendImageToWebsiteChat(conversationId, imageUrl) {
  await supabase
    .from('web_chat_messages')
    .insert({
      conversation_id: conversationId,
      message_type: 'image',
      image_url: imageUrl,
      sender_type: 'staff',
      sender_name: currentStaff.name,
      is_read: false
    });
}
```

**3. UI Requirements:**
- Image picker/upload button in chat interface
- Show upload progress
- Preview before sending
- Success/error feedback

That's it! Minimal changes for MVP image support.