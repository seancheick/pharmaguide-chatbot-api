# PharmaGuide AI Chatbot - Complete Deployment Guide

## 🎯 Overview

This is a complete AI chatbot solution for PharmaGuide.io featuring:
- **Backend**: Vercel serverless function using Groq's high-speed API (Llama 3.3 70B)
- **Frontend**: Premium glassmorphism chat widget
- **Safety Engine**: Deterministic risk routing, symptom triage, and post-response validation
- **Infrastructure**: Upstash Redis rate limiting, response caching, and circuit breakers
- **Free Tier**: ~6,000 requests/day on Groq's generous free tier

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
   vercel env add GROQ_API_KEY
   vercel env add UPSTASH_REDIS_REST_URL
   vercel env add UPSTASH_REDIS_REST_TOKEN
   ```
   *Note: Provide your Groq API key for the AI to function. The Upstash Redis variables are for multi-region rate limiting. If omitted, the API will safely fall back to an in-memory rate limiter.*
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
     - `GROQ_API_KEY` (Required for AI responses)
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

### Groq Free Tier Limits
- ~6,000 requests per day
- 6,000 tokens per minute
- Llama 3.3 70B model

### Check Your Usage
1. Go to: https://console.groq.com
2. Login with your account
3. View usage in the dashboard

### If You Hit Limits
The API will return a 429 error, and users will see:
"Too many requests. Please wait a moment and try again."

---

## 🛡️ Security Notes

1. **API Key Security**: Your Groq API key is stored securely in Vercel's environment variables, never exposed to the frontend.

2. **Rate Limiting**: Built-in protection against abuse.

3. **CORS**: The API accepts requests from any origin. To restrict:
   - Update the CORS headers in `api/chat.js`

4. **Input Validation**: Messages are limited to 2000 characters.

---

## 🐛 Troubleshooting

### "Connection error" in chat
- Check if API is deployed: visit `https://pharmaguideai.vercel.app/api/health`
- Verify GROQ_API_KEY is set in Vercel

### Chat bubble doesn't appear
- Check browser console for JavaScript errors
- Verify the widget code was inserted correctly
- Try clearing browser cache

### Slow responses
- This is rare with Groq (it's very fast)
- Check your internet connection
- Groq may be experiencing high traffic

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
  "model": "llama-3.3-70b-versatile",
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  }
}
```

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
