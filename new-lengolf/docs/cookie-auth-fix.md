# Supabase Auth Cookie Issue Resolution

## The Problem

We encountered an issue with Supabase authentication where the middleware was failing to parse the authentication cookies, resulting in users being redirected to the login page even after successful authentication.

### Error Message
```
Failed to parse cookie string: SyntaxError: Unexpected token 'b', "base64-eyJ"... is not valid JSON
```

### Root Causes

1. **Split Cookies**: 
   - Supabase was splitting the auth token into multiple cookies (`.0` and `.1` suffixes) due to size limitations
   - Example:
     ```
     sb-bisimqmtxjsptehhqpeg-auth-token.0
     sb-bisimqmtxjsptehhqpeg-auth-token.1
     ```

2. **Base64 Encoding**:
   - The cookie values were base64 encoded with a `base64-` prefix
   - The middleware was trying to parse these directly as JSON
   - Example value: `base64-eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU...`

3. **Cookie Handling**:
   - The default Supabase middleware client wasn't handling these split and encoded cookies correctly
   - It expected a single, JSON-parseable cookie value

## The Solution

We implemented a solution that handles both the split cookies and base64 encoding:

1. **Cookie Combination**:
   ```typescript
   // Try to combine split cookies
   const part0 = request.cookies.get('sb-bisimqmtxjsptehhqpeg-auth-token.0')
   const part1 = request.cookies.get('sb-bisimqmtxjsptehhqpeg-auth-token.1')
   
   if (part0 && part1) {
     const combined = part0.value + part1.value
     // Process combined value...
   }
   ```

2. **Base64 Decoding**:
   ```typescript
   function decodeCookieValue(value: string): string | null {
     if (value.startsWith('base64-')) {
       try {
         const base64Value = value.replace('base64-', '')
         return Buffer.from(base64Value, 'base64').toString()
       } catch (error) {
         console.error('Error decoding base64 cookie:', error)
         return null
       }
     }
     return value
   }
   ```

3. **Cookie Pre-processing**:
   - We handle the split cookies before creating the Supabase client
   - Combine and decode the values
   - Set a single, properly formatted cookie that Supabase can read

### Key Implementation Details

```typescript
// Handle split cookies before creating the client
const authCookie = request.cookies.get('sb-bisimqmtxjsptehhqpeg-auth-token')
if (!authCookie) {
  // Try to combine split cookies
  const part0 = request.cookies.get('sb-bisimqmtxjsptehhqpeg-auth-token.0')
  const part1 = request.cookies.get('sb-bisimqmtxjsptehhqpeg-auth-token.1')
  
  if (part0 && part1) {
    const combined = part0.value + part1.value
    const decoded = decodeCookieValue(combined)
    if (decoded) {
      // Set the combined cookie
      res.cookies.set('sb-bisimqmtxjsptehhqpeg-auth-token', decoded, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/'
      })
    }
  }
}
```

## Debugging Process

1. Added detailed logging to track cookie handling:
   ```typescript
   console.log('Initial cookies in middleware:', request.cookies.getAll().map(c => ({
     name: c.name,
     value: c.value.substring(0, 50) + '...'
   })))
   ```

2. Identified the cookie format through logs:
   - Split cookies with `.0` and `.1` suffixes
   - Base64 encoded values with `base64-` prefix

3. Implemented and tested solutions:
   - First tried custom cookie handling in the Supabase client
   - Finally settled on pre-processing cookies before client creation

## Lessons Learned

1. **Cookie Size Limitations**:
   - Large auth tokens may be split into multiple cookies
   - Need to handle recombination properly

2. **Encoding Handling**:
   - Base64 encoding needs to be decoded before JSON parsing
   - Always check for encoding prefixes

3. **Middleware Flow**:
   - Pre-process cookies before creating the auth client
   - Use proper cookie attributes (httpOnly, secure, sameSite)

4. **Debugging Importance**:
   - Detailed logging helped identify the exact issue
   - Step-by-step debugging of cookie handling was crucial

## Future Considerations

1. Monitor cookie sizes and potential splitting
2. Consider implementing cookie compression
3. Keep track of Supabase auth updates that might affect cookie handling
4. Maintain proper security attributes on cookies
5. Consider implementing fallback authentication methods 