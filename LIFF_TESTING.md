# LIFF Lucky Draw Testing Guide

## Testing Environments

### 1. Local Development (with Dev Mode)
**URL**: `http://localhost:3000/liff/lucky-draw?dev=true&userId=U-test-123&name=TestUser`

**Test scenarios:**
- [ ] New user (no profile) → should show phone form
- [ ] User with profile but no phone → should show phone form
- [ ] User with phone → should show spin wheel
- [ ] User who already played → should show previous result

**Commands:**
```bash
npm run dev
# Open: http://localhost:3000/liff/lucky-draw?dev=true&userId=U-new-user
```

### 2. Ngrok Testing (Real LIFF)
**Setup:**
```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000
```

**Steps:**
1. Copy ngrok URL (e.g., `https://abc123.ngrok.io`)
2. Go to LINE Developers Console → LIFF tab
3. Update endpoint to `https://abc123.ngrok.io/liff/lucky-draw`
4. Open LIFF URL from LINE app on phone
5. Test complete flow

### 3. LINE Simulator (Browser Testing)
**URL**: https://developers.line.biz/line-simulator/

**Steps:**
1. Go to LINE Developers Console
2. Select your channel
3. Click "LINE Simulator" in left menu
4. Enter your LIFF URL
5. Test in browser without mobile device

**Note**: LINE Simulator replaced the old LIFF Inspector tool

### 4. Cloudflare Tunnel (Alternative to Ngrok)
**Setup:**
```bash
# Install (one-time)
npm install -g cloudflared

# Run
npm run dev

# In another terminal
cloudflared tunnel --url http://localhost:3000
```

**Advantages over ngrok:**
- Free, no time limits
- More stable connection
- No account required

### 5. Staging Environment
Deploy to Vercel preview deployment:
```bash
git push origin feature/lucky-draw
# Get preview URL from Vercel
# Update LIFF endpoint to preview URL
```

## Test Cases

### Flow 1: New LINE User
- [ ] Open LIFF app
- [ ] LINE login prompt appears
- [ ] After login, phone form appears
- [ ] Submit phone number
- [ ] Spin wheel appears
- [ ] Can spin wheel
- [ ] Prize modal appears with redemption code
- [ ] Close modal → shows "already played" state

### Flow 2: Returning User
- [ ] Open LIFF app
- [ ] Auto-login (already logged in)
- [ ] Shows "already played" screen
- [ ] Can view previous prize

### Flow 3: LINE User Without Phone
- [ ] User exists in DB but no phone_number
- [ ] Phone form appears
- [ ] Submit phone
- [ ] Spin wheel appears

### Flow 4: Error Handling
- [ ] LIFF ID not configured → error message
- [ ] Network error during status check → error message
- [ ] Already played user tries to spin again → prevented
- [ ] Invalid phone number format → validation error

## API Testing

### Check Status API
```bash
# New user
curl "http://localhost:3000/api/liff/check-status?lineUserId=U-new-user"

# Existing user who played
curl "http://localhost:3000/api/liff/check-status?lineUserId=U6f673fcbf0f8244b7387cad7f765aa52"
```

### Save Phone API
```bash
curl -X POST http://localhost:3000/api/liff/save-phone \
  -H "Content-Type: application/json" \
  -d '{"lineUserId":"U-test-123","phoneNumber":"0812345678","displayName":"Test"}'
```

### Spin API
```bash
curl -X POST http://localhost:3000/api/liff/spin \
  -H "Content-Type: application/json" \
  -d '{"lineUserId":"U-test-123"}'
```

## Database Verification

```sql
-- Check if spin was recorded
SELECT * FROM lucky_draw_spins WHERE line_user_id = 'U-test-123';

-- Check profile was created/updated
SELECT * FROM profiles WHERE provider = 'line' AND provider_id = 'U-test-123';

-- View all spins
SELECT
  line_user_id,
  display_name,
  phone_number,
  prize_name,
  redemption_code,
  spin_timestamp
FROM lucky_draw_spins
ORDER BY spin_timestamp DESC;
```

## Prize Probability Testing

Run multiple spins to verify distribution:

```javascript
// Run in browser console
async function testPrizeDistribution(count = 100) {
  const results = {};
  for (let i = 0; i < count; i++) {
    const res = await fetch('/api/liff/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineUserId: `U-test-${i}` })
    });
    const data = await res.json();
    results[data.prize] = (results[data.prize] || 0) + 1;
  }
  console.table(results);
}
```

## QR Code Testing

Generate QR code for LIFF URL:
1. Get LIFF URL from LINE Console
2. Use https://www.qr-code-generator.com/
3. Print and scan with LINE app

## Common Issues

### Issue: LIFF SDK not loading
**Solution**: Check network tab for 403/404 errors on LIFF SDK CDN

### Issue: "LIFF ID not configured"
**Solution**: Ensure `NEXT_PUBLIC_LIFF_ID` is set in `.env.local`

### Issue: Redirect loop on login
**Solution**: Check LIFF endpoint URL matches exactly (no trailing slash)

### Issue: Can't test on desktop
**Solution**: Use LIFF Inspector or mobile device simulator in browser DevTools

### Issue: Different results on phone vs browser
**Solution**: LIFF context differs - always test on actual LINE app before production

## Production Deployment Checklist

- [ ] Update LIFF endpoint to production URL
- [ ] Test with real LINE accounts
- [ ] Verify redemption codes are unique
- [ ] Check prize probability matches requirements
- [ ] Test share functionality
- [ ] Monitor error logs
- [ ] Set up analytics tracking
- [ ] Test on iOS and Android LINE apps
