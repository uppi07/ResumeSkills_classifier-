# GPT Prompt Console

Web UI that lets you send a prompt to GPT through a Next.js API route and display the reply.

## Setup
1) Duplicate `.env.local.example` to `.env.local` and add your `OPENAI_API_KEY`.
2) Install deps and start the dev server:
```bash
npm install
npm run dev
```
3) Open `http://localhost:3000` and send a prompt.

## How it works
- The UI lives in `app/page.tsx` and posts prompts to `/api/generate`.
- `app/api/generate/route.ts` calls the OpenAI Chat Completions endpoint (`gpt-4o-mini`) and returns the text reply.
- Your API key stays on the server; the browser never sees it.
