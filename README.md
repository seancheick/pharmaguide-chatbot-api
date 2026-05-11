# PharmaGuide AI Chatbot - Complete Deployment Guide

## 🎯 Overview

This is a complete AI chatbot solution for PharmaGuide.io featuring:
- **Backend**: Vercel serverless function with a **multi-provider LLM chain** — **Gemini 2.5 Flash (primary)** with **Groq Llama 3.3 70B (fallback)** and a deterministic degraded-response final layer.
- **Frontend**: Premium glassmorphism chat widget
- **Safety Engine**: Deterministic risk routing, symptom triage, and post-response validation
- **Infrastructure**: Upstash Redis rate limiting, response caching, and per-provider circuit breakers
- **Why Gemini primary**: stronger clinical reasoning (~80% MMLU, beats Llama on FACTS / GPQA / medication interaction reasoning). Quality is the right tradeoff for a YMYL chatbot at low/medium traffic.
- **Why Groq fallback**: when Gemini hits its rate limit or upstream errors, Groq Llama 3.3 70B picks up — fast inference (~2 s), still strong on supplement-domain queries.

### Free-tier capacity (as of 2026-05)

| Provider | Free RPM | Free RPD | Notes |
|---|---|---|---|
| Gemini 2.5 Flash | 10 | 250 | Primary. Free content may be used by Google for product improvement; paid tier opts out. |
| Gemini 2.5 Flash-Lite | 15 | 1,000 | Available for routing low-risk wellness queries later. |
| Groq Llama 3.3 70B | 30 | 1,000 | Fallback. TPM 12K / TPD 100K caps token throughput. |

Sources: [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits), [console.groq.com rate limits](https://console.groq.com).

### Model lifecycle

- `gemini-2.5-flash` shutdown date: **October 16, 2026** — plan migration before then.
- `gemini-2.5-flash-lite` shutdown date: October 16, 2026.
- `gemini-2.0-flash` shutdown date: **June 1, 2026** — do not migrate to this.
- For production launch, **enable Gemini paid billing** before opening to real traffic. Free tier is acceptable for beta only.

---

## 📁 Project Structure

```text
pharmaguide-chatbot/
├── api/
│   ├── chat.js          # Main chat endpoint
│   └── health.js        # Health check endpoint
├── src/
│   ├── config/          # Policy, prompts, and synonyms
│   ├── core/            # Normalization, entity extraction, risk router
│   ├── gates/           # Safety gate detection and static replies
│   ├── infra/           # Analytics, circuit breaker, rate limit, cache, memory
│   └── postprocess/     # Output validation and response shaping
├── scripts/             # CI/CD deployment release gates
├── test/                # Test suites (unit and golden traces)
├── chatbot-widget.html  # Frontend widget (copy to WordPress)
├── package.json         # Dependencies and build scripts
├── vercel.json          # Vercel configuration
└── README.md            # This file
```

---

## 🚀 STEP-BY-STEP DEPLOYMENT

### Step 1: Deploy Backend to Vercel

#### Option A: Using Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not installed):
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Navigate to project folder and deploy**:
   ```bash
   cd pharmaguide-chatbot
   vercel
   ```

4. **Follow the prompts**:
   - Link to existing project? → Yes → select `pharmaguideai`
   - Or create new project with name `pharmaguideai`

5. **Set environment variables**:
   ```bash
   vercel env add GEMINI_API_KEY   # primary LLM (required for first-tier responses)
   vercel env add GROQ_API_KEY     # fallback LLM (required — used when Gemini fails or rate-limits)
   vercel env add UPSTASH_REDIS_REST_URL
   vercel env add UPSTASH_REDIS_REST_TOKEN
   ```
   *Notes:* Both `GEMINI_API_KEY` and `GROQ_API_KEY` are required for the multi-provider chain. If only one is set the chain still works but loses redundancy. The Upstash Redis variables are for multi-region rate limiting; if omitted, the API safely falls back to an in-memory rate limiter.
   Select: Production, Preview, Development (all three)

6. **Redeploy with the environment variable**:
   ```bash
   vercel --prod
   ```

#### Option B: Using Vercel Dashboard (No CLI needed)

1. **Go to**: https://vercel.com/dashboard

2. **Import Project**:
   - Click "Add New" → "Project"
   - Choose "Import Git Repository" OR
   - Upload the folder directly

3. **Configure Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add the following keys:
     - `GEMINI_API_KEY` (Required — primary LLM)
     - `GROQ_API_KEY` (Required — fallback LLM, used when Gemini fails or rate-limits)
     - `UPSTASH_REDIS_REST_URL` (Required/Recommended for multi-region rate limiting)
     - `UPSTASH_REDIS_REST_TOKEN` (Required/Recommended for multi-region rate limiting)
   - Check all environments (Production, Preview, Development)

4. **Deploy**:
   - Click "Deploy"
   - Wait for deployment to complete

5. **Your API will be available at**:
   ```
   https://pharmaguideai.vercel.app/api/chat
   https://pharmaguideai.vercel.app/api/health
   ```

### Step 2: Test Your API

Open a terminal and run:

```bash
curl -X POST https://pharmaguideai.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is magnesium good for?"}'
```

You should get a JSON response with the AI's answer.

Or test the health endpoint:
```bash
curl https://pharmaguideai.vercel.app/api/health
```

### Step 3: Install Widget on WordPress

#### Method A: Using WPCode Plugin (Recommended)

1. **Install WPCode Plugin**:
   - WordPress Dashboard → Plugins → Add New
   - Search "WPCode"
   - Install & Activate "WPCode – Insert Headers and Footers"

2. **Add the Chatbot Widget**:
   - Go to Code Snippets → + Add Snippet
   - Choose "Add Your Custom Code (New Snippet)"
   - Name it: "PharmaGuide AI Chatbot"
   - Code Type: "HTML Snippet"
   - Paste the entire contents of `chatbot-widget.html`
   - Location: "Site Wide Footer"
   - Status: Active
   - Save

#### Method B: Using Elementor

1. **Edit your page** with Elementor
2. **Drag an HTML widget** to the page (anywhere works)
3. **Paste the contents** of `chatbot-widget.html`
4. **Update/Publish**

#### Method C: Theme Footer (Advanced)

1. Go to Appearance → Theme File Editor
2. Edit `footer.php`
3. Paste the widget code before `</body>`
4. Save

### Step 4: Verify Installation

1. Visit your website: https://pharmaguide.io
2. Look for the teal chat bubble in the bottom-right corner
3. Click it to open the chat
4. Try asking: "What supplements help with sleep?"

---

## 🔧 Configuration Options

### Updating the API Endpoint

In `chatbot-widget.html`, find this line (around line 480):

```javascript
const API_ENDPOINT = 'https://pharmaguideai.vercel.app/api/chat';
```

Update it if your Vercel URL is different.

### Customizing Quick Actions

Find this array in the widget code:

```javascript
const QUICK_ACTIONS = [
    "Check an interaction",
    "Supplement timing tips",
    "Vitamin D info"
];
```

Change these to whatever starter prompts you prefer.

### Rate Limiting

The API includes advanced rate limiting via **Upstash Redis** (Sliding Window: 10 requests / 1 minute / IP).
- If Upstash variables (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) are provided in Vercel, it uses distributed Redis for global limit tracking.
- If they are missing or the connection fails, it safely falls back to a fast, per-instance in-memory rate limiter.

---

## 📊 Monitoring & Limits

### Free-tier ceilings (as of 2026-05)

**Gemini 2.5 Flash (primary)**
- 10 requests / minute
- 250 requests / day per project
- 250K tokens / minute
- Free-tier content may be used by Google for product improvement; enable paid billing to opt out.
- Console: [aistudio.google.com](https://aistudio.google.com)

**Groq Llama 3.3 70B Versatile (fallback)**
- 30 requests / minute
- 1,000 requests / day
- 12K tokens / minute
- 100K tokens / day
- Console: [console.groq.com](https://console.groq.com)

### What happens when limits hit

1. Gemini returns 429 → per-provider circuit-breaker tracks the failure
2. Provider router transparently falls back to Groq Llama 3.3 70B
3. If Groq also fails or rate-limits → user sees the deterministic `system:degraded` reply with provider/911/Poison-Control guidance
4. `/api/health` exposes per-provider `configured` + `circuit` state for monitoring
5. `console.warn("[PROVIDER]")` logs in Vercel show each failure with model + error message

### Production planning
- For real user traffic, enable **paid Gemini billing** in Google Cloud Console — opts out of training-data use and lifts the 250 RPD ceiling to 1,000 RPD on Tier 1 paid (and higher on Tier 2/3).
- Groq's paid tier (Dev/Production) lifts the 1,000 RPD ceiling significantly.

---

## 🛡️ Security Notes

1. **API Key Security**: Your `GEMINI_API_KEY` and `GROQ_API_KEY` are stored in Vercel's environment variables, never exposed to the frontend bundle. The chat handler reads them server-side only.

2. **Rate Limiting**: Built-in protection against abuse.

3. **CORS**: The API accepts requests from any origin. To restrict:
   - Update the CORS headers in `api/chat.js`

4. **Input Validation**: Messages are limited to 2000 characters.

---

## 🐛 Troubleshooting

### "Connection error" in chat
- Check if API is deployed: visit `/api/health` — it returns per-provider `configured` + `circuit` state
- Verify BOTH `GEMINI_API_KEY` and `GROQ_API_KEY` are set in Vercel (chain needs the primary AND the fallback)

### `system:degraded` reply when both should be healthy
- Hit `/api/health` and read the `providers` block — confirms each provider's `configured` flag and circuit state
- Check Vercel function logs for `[PROVIDER]` warnings — each upstream failure logs with the provider name + error message
- Common causes: stale env var after rotating a key (redeploy after env-var change), per-project Gemini RPD ceiling hit, or Groq key invalid

### Chat bubble doesn't appear
- Check browser console for JavaScript errors
- Verify the widget code was inserted correctly
- Try clearing browser cache

### Slow responses
- Gemini typically responds in ~1.5–2.5 s, Groq in ~0.3–0.8 s
- If responses suddenly slow → Gemini circuit may be flapping; check `/api/health`
- Outright timeouts after 12 s → upstream is genuinely unhealthy, fallback to Groq should kick in

### 429 "Too many requests"
- Wait 60 seconds and try again
- This is rate limiting protecting your API

---

## 📞 API Reference

### POST /api/chat

Send a message to the AI.

**Request:**
```json
{
  "message": "What is vitamin D good for?",
  "history": [
    {"role": "user", "content": "Hi"},
    {"role": "assistant", "content": "Hello! How can I help?"}
  ]
}
```

**Response:**
```json
{
  "reply": "Vitamin D is essential for...",
  "model": "gemini-2.5-flash",
  "confidence": "moderate",
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  }
}
```

The `model` field reflects which provider actually answered:
- `gemini-2.5-flash` — Gemini answered (primary)
- `llama-3.3-70b-versatile` — Groq fallback answered (Gemini was unavailable/rate-limited)
- `system:degraded` — both providers failed, deterministic graceful reply
- `system:<route>` — a deterministic safety gate answered (no LLM call), e.g. `system:nitrate-vasodilator`
- `cache` — answer served from the in-memory response cache

(The website-side proxy strips `model` and `_state` from responses sent to the browser to keep the engine opaque under the "PharmaGuide AI" brand.)

### GET /api/health

Check API status.

**Response:**
```json
{
  "status": "ok",
  "service": "PharmaGuide AI Chatbot",
  "timestamp": "2024-12-22T18:30:00.000Z",
  "version": "1.0.0"
}
```

---

## 🎨 Customization

### Colors
The widget uses CSS variables. To customize, add this before the widget:

```html
<style>
  :root {
    --pgchat-teal-500: #YOUR_COLOR;
    --pgchat-teal-600: #YOUR_DARKER_COLOR;
  }
</style>
```

### Position
To move the button to the left side:
```css
.pgchat-toggle {
  right: auto;
  left: 24px;
}
.pgchat-window {
  right: auto;
  left: 24px;
}
```

## 🧪 CI/CD & Testing

The project uses built-in automated safeguards before deployment:

### Local Testing
```bash
npm run test
```
Runs the entire local test suite, including semantic golden traces, gate behavior, analytics PHI guards, and circuit breaker constraints.

### Release Gate
```bash
npm run build
```
Vercel automatically triggers this during deployment. It executes `scripts/check_release.js` which blocks the release if documentation drift, unresolved policy claims, or trace test failures are detected.

---

## ✅ Checklist

- [ ] Add `GROQ_API_KEY` to Vercel
- [ ] Add `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN` (Optional but recommended)
- [ ] Deploy API to Vercel (Release gate will run automatically)
- [ ] Test API with curl
- [ ] Install widget on WordPress
- [ ] Test chat on live site
- [ ] Verify mobile responsiveness

---

## 🆘 Support

If you encounter issues:
1. Check browser console for errors
2. Check Vercel function logs
3. Verify API key is correct
4. Test API endpoint directly

Your Groq Console: https://console.groq.com
Your Vercel Dashboard: https://vercel.com/dashboard

---

Made with ❤️ for PharmaGuide
