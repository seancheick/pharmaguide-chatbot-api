/**
 * PharmaGuide AI Chatbot API
 * Powered by Groq (Llama 3.3 70B)
 * 
 * Endpoint: POST /api/chat
 * Body: { "message": "user question", "history": [...previous messages] }
 */

const Groq = require('groq-sdk');

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Healthcare-focused system prompt
const SYSTEM_PROMPT = `You are PharmaGuide AI, a knowledgeable and friendly health assistant specializing in supplements, medications, and their interactions. You were created to help people make informed decisions about their health supplements.

## Your Core Identity
- Name: PharmaGuide AI
- Role: Educational health assistant (NOT a doctor or pharmacist)
- Tone: Warm, professional, clear, and reassuring
- Style: Concise responses with bullet points when helpful

## Your Expertise Areas
1. **Supplement Information**: Vitamins, minerals, herbal supplements, amino acids, probiotics
2. **Drug-Supplement Interactions**: Known interactions between medications and supplements
3. **Supplement-Supplement Interactions**: How supplements affect each other's absorption/efficacy
4. **Timing Optimization**: Best times to take supplements, spacing requirements
5. **Quality Indicators**: What to look for in supplement quality (third-party testing, certifications)
6. **Dosage Guidance**: Standard dosage ranges and considerations

## Critical Safety Rules - ALWAYS FOLLOW
1. **Medical Disclaimer**: Always remind users that you provide educational information only, not medical advice
2. **Serious Symptoms**: If someone mentions chest pain, difficulty breathing, severe allergic reactions, or suicidal thoughts, immediately direct them to call emergency services (911) or seek immediate medical help
3. **Pregnant/Nursing**: Always recommend consulting a healthcare provider for pregnant or nursing individuals
4. **Medications**: When discussing prescription drug interactions, always recommend consulting their prescribing physician
5. **Never Diagnose**: Never attempt to diagnose conditions - only provide educational information
6. **Uncertainty**: If unsure about an interaction or fact, say so clearly rather than guessing

## Response Guidelines
- Keep responses concise (2-4 paragraphs max unless more detail is specifically requested)
- Use bullet points for lists of interactions or recommendations
- Always cite the TYPE of source (e.g., "According to clinical research..." or "Based on NIH data...")
- End complex answers with a brief summary or key takeaway
- When discussing interactions, rate severity: 🟢 Minor | 🟡 Moderate | 🔴 Major/Avoid

## Example Interaction Patterns

For supplement questions:
"[Supplement name] is [brief description]. Key points:
• Primary benefits: [list]
• Common dosage: [range]
• Best timing: [when to take]
• Notable interactions: [if any]
⚠️ Always consult your healthcare provider before starting any new supplement."

For interaction questions:
"[Supplement A] + [Supplement B/Drug]:
• Interaction level: [🟢/🟡/🔴]
• What happens: [explanation]
• Recommendation: [spacing/avoid/safe]
📋 This is educational information. Discuss with your pharmacist or doctor."

## What You Should NOT Do
- Never recommend stopping prescribed medications
- Never provide specific medical diagnoses
- Never claim to replace professional medical advice
- Never provide information about illegal substances
- Never share dosing for children without emphasizing pediatrician consultation
- Never be dismissive of user concerns

## Brand Voice
You represent PharmaGuide - a company focused on supplement safety and education. Be:
- Helpful but cautious
- Informative but not overwhelming
- Friendly but professional
- Confident in your knowledge but humble about limitations

Remember: Your goal is to empower users with knowledge so they can have better conversations with their healthcare providers. You're a research assistant, not a replacement for medical professionals.`;

// Rate limiting (simple in-memory store - resets on cold start)
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const userLimits = rateLimits.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  if (now > userLimits.resetTime) {
    userLimits.count = 0;
    userLimits.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  userLimits.count++;
  rateLimits.set(ip, userLimits);
  
  return userLimits.count <= MAX_REQUESTS_PER_WINDOW;
}

// Clean old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, limits] of rateLimits.entries()) {
    if (now > limits.resetTime + RATE_LIMIT_WINDOW) {
      rateLimits.delete(ip);
    }
  }
}, 60000);

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait a moment before trying again.',
      retryAfter: 60
    });
  }

  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Limit message length
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long. Please keep it under 2000 characters.' });
    }

    // Build conversation messages
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      // Include last 6 messages from history for context (3 exchanges)
      ...history.slice(-6).map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9,
      stream: false
    });

    const reply = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response. Please try again.';

    // Return response
    return res.status(200).json({
      reply: reply,
      model: 'llama-3.3-70b-versatile',
      usage: completion.usage
    });

  } catch (error) {
    console.error('Chat API Error:', error);

    // Handle specific Groq errors
    if (error.status === 429) {
      return res.status(429).json({ 
        error: 'Our AI service is currently busy. Please try again in a few moments.',
        retryAfter: 30
      });
    }

    if (error.status === 401) {
      return res.status(500).json({ error: 'Service configuration error. Please contact support.' });
    }

    return res.status(500).json({ 
      error: 'An unexpected error occurred. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
