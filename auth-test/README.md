# Next.js Supabase Auth Test Project

## Objective
This project serves as a minimal test environment for debugging and implementing Supabase authentication in a Next.js application. It was created to isolate authentication issues and provide a clean implementation using the latest best practices.

### Key Goals
- Test Supabase authentication flow in isolation
- Implement proper session handling and persistence
- Handle OAuth redirects correctly
- Manage cookies and session state properly
- Provide a clean reference implementation

## Technologies Used
- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- Supabase Auth (@supabase/ssr)
- Server Components

## Project Structure

```
auth-test/
├── app/
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts    # OAuth callback handler
│   └── page.tsx            # Home page with login button
├── components/
│   └── LoginButton.tsx     # Login component
├── lib/
│   └── supabase.ts         # Supabase client configuration
├── middleware.ts           # Auth middleware
└── .env.local             # Environment variables
```

## Key Features
1. **Modern Authentication Setup**
   - Uses the new `@supabase/ssr` package
   - Proper cookie handling in middleware
   - Session persistence
   - Type-safe implementation

2. **OAuth Implementation**
   - Google OAuth support
   - Secure callback handling
   - PKCE flow support
   - Error handling

3. **Middleware Protection**
   - Route protection
   - Session validation
   - Cookie management
   - Public routes allowlist

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Create `.env.local` with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

3. **Supabase Configuration**
   - Set up a Supabase project
   - Configure OAuth providers (Google, etc.)
   - Set up redirect URLs

4. **Development**
   ```bash
   npm run dev
   ```

## Implementation Details

### 1. Supabase Client Setup
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
    }
  }
)
```

### 2. OAuth Flow
- User clicks login button
- Redirects to OAuth provider
- Provider redirects back to callback URL
- Callback exchanges code for session
- Session stored in cookies
- User redirected to home page

### 3. Middleware Protection
```typescript
export async function middleware(request: NextRequest) {
  // Create Supabase client
  const supabase = createServerClient(...)

  // Validate session
  await supabase.auth.getSession()

  // Handle cookies
  return response
}
```

## Common Issues Addressed

1. **Session Persistence**
   - Proper cookie configuration
   - Session storage in browser
   - Server-side validation

2. **OAuth Redirect Issues**
   - Correct callback URL configuration
   - Error handling in callback route
   - State parameter validation

3. **Cookie Management**
   - Secure cookie settings
   - Cookie persistence
   - Cross-domain considerations

## Testing the Implementation

1. **Authentication Flow**
   - Click the login button
   - Complete OAuth process
   - Verify redirect back to application
   - Check session persistence

2. **Protected Routes**
   - Attempt to access protected route
   - Verify redirect to login
   - Verify access after authentication

3. **Session Management**
   - Check session persistence across refreshes
   - Verify cookie storage
   - Test session expiration

## Best Practices Implemented

1. **Security**
   - PKCE flow for OAuth
   - Secure cookie settings
   - Environment variable protection
   - Type safety

2. **Error Handling**
   - Comprehensive error catching
   - User-friendly error messages
   - Logging for debugging

3. **Code Organization**
   - Clean component structure
   - Separation of concerns
   - Type definitions
   - Middleware organization

## Contributing
Feel free to use this project as a reference or starting point for your own Supabase authentication implementation. Issues and pull requests are welcome.

## License
MIT
