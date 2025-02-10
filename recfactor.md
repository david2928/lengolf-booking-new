# LENGOLF Booking App Refactor

This document shows how to move the current LENGOLF booking system to TypeScript, Next.js 15 (App Router), Tailwind CSS, and Supabase. It also explains how to deploy to Google Cloud Run.

---

## 1. Overview

### Project Description
LENGOLF is a booking system with multiple login providers (Google, Facebook, LINE, and guest) and many external API calls. We will replace the old setup with Next.js 15, TypeScript, Tailwind CSS, and Supabase.

### Goals
- Use Next.js 15 App Router instead of custom Express.
- Convert all JavaScript to TypeScript.
- Use Supabase for auth and database (instead of Firebase and Google Sheets).
- Use Tailwind CSS for styling.
- Keep the same user-facing features but improve code quality.

### Current vs. New Stack

| Current Stack                       | New Stack                                  |
|------------------------------------|--------------------------------------------|
| Node.js, Express                   | Next.js 15 (App Router)                    |
| Plain JavaScript                   | TypeScript                                 |
| Firebase, Firestore, Google Sheets | Supabase (DB + Auth)                      |
| Custom CSS + Bootstrap             | Tailwind CSS                               |
| Deployed on GCP (Cloud Run)        | Deployed again on GCP (Cloud Run)          |

---

## 2. Existing System Analysis

### Current Folders
- `/config/`
- `/controllers/`
- `/middlewares/`
- `/public/` (includes index.html, css, js, images)
- `/routes/`
- `/services/`
- `/utils/`
- `index.js` (Express entry)

### Key Components
- **index.js**: Express-based server start.
- **controllers**: Booking, auth, events, etc.
- **services**: Calls to Google Calendar, Sheets, etc.
- **public**: HTML, css, main.js for front-end.
- **middlewares**: auth checks, validation, error handling.
- **routes**: Express routers.

### Key Dependencies
- Google APIs
- Facebook SDK
- LINE
- Firebase Admin
- Node-Cache
- Winston logs

### Auth & DB
- Multiple logins (Google, Facebook, LINE, guest).
- Firestore + Google Sheets for data storage.

---

## 3. Step-by-Step Migration Plan

### Step 1: Create New Next.js, TypeScript, Tailwind, Supabase App

1. **New repo**: Make `lengolf-refactor`.
2. **Initialize Next.js**:
   ```bash
   npx create-next-app@latest lengolf-refactor --use-npm --example with-tailwindcss
   cd lengolf-refactor
   npm install --save-dev typescript @types/node @types/react
   npm install @supabase/supabase-js
   ```

3. **Configure tsconfig.json**:
   ```json
   {
     "compilerOptions": {
       "target": "esnext",
       "lib": ["dom", "dom.iterable", "esnext"],
       "allowJs": true,
       "skipLibCheck": true,
       "strict": true,
       "forceConsistentCasingInFileNames": true,
       "noEmit": true,
       "esModuleInterop": true,
       "module": "esnext",
       "moduleResolution": "node",
       "resolveJsonModule": true,
       "isolatedModules": true,
       "jsx": "preserve"
     },
     "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
     "exclude": ["node_modules"]
   }
   ```

4. **Add .env.local with Supabase info**:
   ```ini
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

5. **New Folder Structure Example**:
   ```
   lengolf-refactor/
    ┣ app/
      ┣ (public)/page.tsx        // Landing page
      ┣ auth/...
      ┣ api/...
      ┣ layout.tsx
    ┣ components/
    ┣ lib/ (e.g. supabaseClient.ts)
    ┣ public/
    ┣ styles/
    ┣ tsconfig.json
    ┗ ...
   ```

### Step 2: Migrate Landing Page

Old: `public/index.html`, `public/css/styles.css`
New: `app/(public)/page.tsx`

Steps:
1. Copy HTML from public/index.html into page.tsx.
2. Convert HTML to JSX.
3. Replace old CSS with Tailwind classes.

Example:
```tsx
// app/(public)/page.tsx
export default function HomePage() {
  return (
    <main className="flex items-center justify-center h-screen bg-gray-100">
      <h1 className="text-4xl font-bold">Welcome to LENGOLF</h1>
    </main>
  );
}
```

### Step 3: Migrate Auth to Supabase

Old: `controllers/authController.js` plus `routes/api/authRoutes.js`
New: Next.js Route Handlers in `app/api/auth/...`

Steps:
1. Create `lib/supabaseClient.ts`:
   ```typescript
   import { createClient } from '@supabase/supabase-js';

   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
   );

   export default supabase;
   ```
2. For Google/Facebook/LINE, set up Supabase's social logins or custom code.
3. Replace references to Firebase or Google Sheets in the old code.

### Step 4: Migrate API Calls to Supabase

Old: `services/bookingService.js`, `services/customerService.js`
New: `app/api/bookings/`, `app/api/customers/`

Example Route Handler:
```typescript
// app/api/bookings/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  const { userId, date, startTime } = await req.json();
  const { data, error } = await supabase
    .from('bookings')
    .insert({ user_id: userId, date, start_time: startTime });
  if (error) return NextResponse.json({ success: false, error }, { status: 400 });
  return NextResponse.json({ success: true, data });
}
```

### Step 5: Refactor UI Components

Old: `public/js/main.js` (includes ~1051 lines)
New: React components in `components/`

Steps:
1. Extract UI segments (buttons, forms) into .tsx files.
2. Use Tailwind classes for styling.
3. Make sure all props and states have TypeScript definitions.

### Step 6: Testing & Validation

1. Run `npx tsc --noEmit` to ensure no TS errors.
2. Add test files if needed (Jest or other).
3. Make sure each page loads properly in dev.
4. Prepare for production build with `npm run build`.

---

## 4. Final Deliverables

- Next.js 15 codebase in TypeScript.
- Tailwind CSS for all styling.
- Supabase-based auth and database (replacing old data stores).
- Verified flows for booking, user data, etc.
- Able to deploy on Google Cloud Run.

---

## 5. Deployment on Google Cloud Run

### 5.1 Prerequisites
- Google Cloud account with billing.
- gcloud CLI installed.
- Docker if you prefer local builds.

### 5.2 Dockerfile

Create a Dockerfile at the root:
```dockerfile
# Using Node 18 as an example
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Build
RUN npm run build

EXPOSE 8080
CMD ["npm", "run", "start"]
```

### 5.3 Build & Deploy

Option A: Build locally then push:
```bash
docker build -t gcr.io/PROJECT_ID/lengolf-refactor:v1 .
docker push gcr.io/PROJECT_ID/lengolf-refactor:v1
gcloud run deploy lengolf-refactor \
  --image gcr.io/PROJECT_ID/lengolf-refactor:v1 \
  --platform managed \
  --region REGION_NAME \
  --allow-unauthenticated
```

Option B: Use gcloud build:
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/lengolf-refactor:v1
gcloud run deploy lengolf-refactor \
  --image gcr.io/PROJECT_ID/lengolf-refactor:v1 \
  --platform managed \
  --region REGION_NAME \
  --allow-unauthenticated
```

You'll get a Cloud Run URL, and your app should be live.