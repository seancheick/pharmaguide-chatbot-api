/**
 * Health check endpoint
 * GET /api/health
 */

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.status(200).json({
    status: 'ok',
    service: 'PharmaGuide AI Chatbot',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
};
