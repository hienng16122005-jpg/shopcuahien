<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5640c766-7398-4b4d-804b-c187eb9adb86

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Firebase admin claim (free tier)

This project can use Firebase custom claim `admin: true` to unlock write permissions in `firestore.rules`.

### 1) Prerequisites

- Firebase Auth account must already exist (email/password is free on Spark plan)
- Env vars must be configured:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
  - `FIREBASE_WEB_API_KEY` (for login/register by email-password)

### 2) Set admin claim

Run one of these commands:

- `npm run firebase:set-admin -- --email=admin@example.com`
- `npm run firebase:set-admin -- --uid=YOUR_FIREBASE_UID`

After success, the user should sign out and sign in again to refresh token claims.

## Notes about free tier

- This setup uses Firebase Auth + Firestore in Spark/free plan.
- No paid service (like Cloud Functions) is required for this flow.
