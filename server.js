// ============================================
// server.js — FarmGuard Pro Backend
// Node.js + Express + SQLite
// ============================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const jwt     = require('jsonwebtoken');
const fetch   = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const db      = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'farmguard-secret-2025';

// -----------------------------------------------
// MIDDLEWARE
// -----------------------------------------------
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database on startup
db.initializeDatabase();

// -----------------------------------------------
// AUTH MIDDLEWARE
// -----------------------------------------------
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// -----------------------------------------------
// HEALTH CHECK
// -----------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'FarmGuard Pro is running 🌿', timestamp: new Date() });
});

// -----------------------------------------------
// AUTH ROUTES
// -----------------------------------------------

// REGISTER
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, phone, state, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'Name, email and password are required' });

    const existing = db.findUserByEmail(email);
    if (existing)
      return res.status(409).json({ error: 'Email already registered' });

    const id = uuidv4();
    db.createUser({ id, name, email, phone, state, password });

    const token = jwt.sign({ id, email, name, role: 'farmer' }, JWT_SECRET, { expiresIn: '7d' });
    const user  = db.findUserById(id);

    res.status(201).json({ success: true, token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const user = db.findUserByEmail(email);
    if (!user || !db.verifyPassword(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    db.updateLastLogin(user.id);
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password: _, ...safeUser } = user;
    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET CURRENT USER
app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// -----------------------------------------------
// ANALYZE ROUTE — Core AI Feature
// -----------------------------------------------
app.post('/api/analyze', authenticate, async (req, res) => {
  const { imageBase64, mediaType } = req.body;

  if (!imageBase64)
    return res.status(400).json({ error: 'No image data provided' });

  const systemPrompt = `You are an expert agricultural pathologist and plant disease specialist for Nigerian farmers.
You analyze crop leaf images using computer vision expertise. You must respond ONLY with valid JSON, nothing else.

Analyze the provided leaf image and return a JSON object with EXACTLY this structure:
{
  "crop_type": "Maize|Tomato|Rice|Cassava|Cowpea|Yam|Sorghum|Unknown",
  "disease_name": "Exact name of disease or 'Healthy Plant'",
  "is_healthy": true or false,
  "severity": "Healthy|Low|Medium|High|Critical",
  "confidence": 90,
  "description": "2-3 sentence plain language description of what you see and the disease",
  "cause": "What causes this disease - fungus, bacteria, virus, pest, or nutrient deficiency",
  "symptoms_observed": "Specific visual symptoms visible in this image",
  "treatment_steps": [
    "Immediate step the farmer should take today",
    "Follow-up treatment within 3-5 days",
    "Long term management step",
    "Prevention for next planting season"
  ],
  "local_products": ["Specific product available in Nigerian markets", "Alternative product"],
  "prevention_tips": "Practical prevention advice for Nigerian farming conditions",
  "urgency_note": "How urgently the farmer needs to act",
  "yield_impact": "Estimated yield loss percentage and economic impact if untreated"
}

Rules:
- Be very specific and practical for Nigerian smallholder farmers
- Recommend agrochemicals sold in Nigerian agro stores (e.g. Emthrin, Ridomil, Comet, Benlate, Cypermethrin)
- Use simple English a farmer can understand
- If you cannot identify the image as a plant/leaf, set disease_name to "Unable to Identify - Not a Plant Leaf"
- ONLY return JSON, no markdown, no explanation outside the JSON`;

  try {
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
            },
            { type: 'text', text: 'Analyze this crop leaf image and return JSON only.' }
          ]
        }]
      })
    });

    const aiData = await aiResponse.json();
    if (aiData.error) throw new Error(aiData.error.message);

    const rawText = aiData.content.map(i => i.text || '').join('');
    const clean   = rawText.replace(/```json|```/g, '').trim();
    const result  = JSON.parse(clean);

    // Save scan to database
    const scanId = uuidv4();
    db.saveScan({
      id:              scanId,
      user_id:         req.user.id,
      crop_type:       result.crop_type,
      disease_name:    result.disease_name,
      is_healthy:      result.is_healthy,
      severity:        result.severity,
      confidence:      result.confidence,
      description:     result.description,
      cause:           result.cause,
      symptoms:        result.symptoms_observed,
      treatment_steps: result.treatment_steps,
      local_products:  result.local_products,
      prevention_tips: result.prevention_tips,
      urgency_note:    result.urgency_note,
      yield_impact:    result.yield_impact,
      image_data:      null  // Don't store image blobs in DB (saves space)
    });

    res.json({ success: true, scanId, result });

  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

// -----------------------------------------------
// SCAN HISTORY
// -----------------------------------------------
app.get('/api/scans', authenticate, (req, res) => {
  try {
    const scans = db.getScansByUser(req.user.id);
    // Parse JSON strings back to arrays
    const parsed = scans.map(s => ({
      ...s,
      treatment_steps: JSON.parse(s.treatment_steps || '[]'),
      local_products:  JSON.parse(s.local_products  || '[]'),
      is_healthy:      s.is_healthy === 1
    }));
    res.json({ success: true, scans: parsed });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch scan history' });
  }
});

// GET SINGLE SCAN
app.get('/api/scans/:id', authenticate, (req, res) => {
  try {
    const scan = db.getScanById(req.params.id);
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    scan.treatment_steps = JSON.parse(scan.treatment_steps || '[]');
    scan.local_products  = JSON.parse(scan.local_products  || '[]');
    scan.is_healthy      = scan.is_healthy === 1;
    res.json({ success: true, scan });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch scan' });
  }
});

// -----------------------------------------------
// DASHBOARD STATS
// -----------------------------------------------
app.get('/api/dashboard', authenticate, (req, res) => {
  try {
    const stats = db.getDashboardStats(req.user.id);
    // Parse JSON fields in recent scans
    stats.recentScans = stats.recentScans.map(s => ({
      ...s,
      treatment_steps: JSON.parse(s.treatment_steps || '[]'),
      local_products:  JSON.parse(s.local_products  || '[]'),
      is_healthy:      s.is_healthy === 1
    }));
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch dashboard stats' });
  }
});

// -----------------------------------------------
// CATCH ALL — serve frontend for any unknown route
// -----------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -----------------------------------------------
// START SERVER
// -----------------------------------------------
app.listen(PORT, () => {
  console.log(`🌿 FarmGuard Pro running on http://localhost:${PORT}`);
});