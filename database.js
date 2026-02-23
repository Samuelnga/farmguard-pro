// ============================================
// database.js — JSON Database Layer (lowdb)
// Works on Windows without any build tools
// ============================================

const low      = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const adapter = new FileSync(path.join(__dirname, 'farmguard.json'));
const db      = low(adapter);

function initializeDatabase() {
  db.defaults({ users: [], scans: [], disease_stats: [] }).write();
  console.log('✅ Database initialized (farmguard.json)');
}

function createUser({ id, name, email, phone, state, password }) {
  const hashed = bcrypt.hashSync(password, 10);
  db.get('users').push({
    id, name, email,
    phone:      phone || null,
    state:      state || null,
    password:   hashed,
    role:       'farmer',
    created_at: new Date().toISOString(),
    last_login: null
  }).write();
}

function findUserByEmail(email) {
  return db.get('users').find({ email }).value();
}

function findUserById(id) {
  const u = db.get('users').find({ id }).value();
  if (!u) return null;
  const { password, ...safe } = u;
  return safe;
}

function updateLastLogin(id) {
  db.get('users').find({ id }).assign({ last_login: new Date().toISOString() }).write();
}

function verifyPassword(plain, hashed) {
  return bcrypt.compareSync(plain, hashed);
}

function saveScan(scan) {
  db.get('scans').push({
    id:              scan.id,
    user_id:         scan.user_id || null,
    crop_type:       scan.crop_type,
    disease_name:    scan.disease_name,
    is_healthy:      scan.is_healthy ? true : false,
    severity:        scan.severity,
    confidence:      scan.confidence,
    description:     scan.description,
    cause:           scan.cause,
    symptoms:        scan.symptoms,
    treatment_steps: scan.treatment_steps || [],
    local_products:  scan.local_products  || [],
    prevention_tips: scan.prevention_tips,
    urgency_note:    scan.urgency_note,
    yield_impact:    scan.yield_impact,
    created_at:      new Date().toISOString()
  }).write();
  updateDiseaseStats(scan.disease_name, scan.crop_type);
}

function getScansByUser(userId, limit = 20) {
  return db.get('scans')
    .filter({ user_id: userId })
    .sortBy('created_at')
    .reverse()
    .take(limit)
    .value();
}

function getScanById(id) {
  return db.get('scans').find({ id }).value();
}

function getRecentScans(limit = 50) {
  const scans = db.get('scans').sortBy('created_at').reverse().take(limit).value();
  const users = db.get('users').value();
  return scans.map(s => {
    const user = users.find(u => u.id === s.user_id);
    return { ...s, farmer_name: user?.name || 'Unknown', farmer_state: user?.state || '' };
  });
}

function updateDiseaseStats(diseaseName, cropType) {
  const existing = db.get('disease_stats')
    .find({ disease_name: diseaseName, crop_type: cropType }).value();
  if (existing) {
    db.get('disease_stats')
      .find({ disease_name: diseaseName, crop_type: cropType })
      .assign({ count: existing.count + 1, last_seen: new Date().toISOString() })
      .write();
  } else {
    db.get('disease_stats').push({
      disease_name: diseaseName, crop_type: cropType,
      count: 1, last_seen: new Date().toISOString()
    }).write();
  }
}

function getDashboardStats(userId) {
  const allScans      = db.get('scans').filter({ user_id: userId }).value();
  const diseasedScans = allScans.filter(s => !s.is_healthy);
  const healthyScans  = allScans.filter(s =>  s.is_healthy);
  const recentScans   = [...allScans]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const cropMap = {};
  allScans.forEach(s => { cropMap[s.crop_type] = (cropMap[s.crop_type] || 0) + 1; });
  const cropBreakdown = Object.entries(cropMap)
    .map(([crop_type, count]) => ({ crop_type, count })).sort((a,b) => b.count - a.count);
  const diseaseMap = {};
  diseasedScans.forEach(s => { diseaseMap[s.disease_name] = (diseaseMap[s.disease_name] || 0) + 1; });
  const topDiseases = Object.entries(diseaseMap)
    .map(([disease_name, count]) => ({ disease_name, count }))
    .sort((a,b) => b.count - a.count).slice(0, 5);
  return { totalScans: allScans.length, diseasedScans: diseasedScans.length,
    healthyScans: healthyScans.length, recentScans, cropBreakdown, topDiseases };
}

function getAdminStats() {
  const users = db.get('users').value();
  const scans = db.get('scans').value();
  return { totalUsers: users.length, totalScans: scans.length,
    diseased: scans.filter(s=>!s.is_healthy).length,
    topDiseases: db.get('disease_stats').sortBy('count').reverse().take(10).value(),
    recentScans: getRecentScans(10) };
}

module.exports = {
  initializeDatabase,
  createUser, findUserByEmail, findUserById, updateLastLogin, verifyPassword,
  saveScan, getScansByUser, getScanById, getRecentScans,
  getDashboardStats, getAdminStats
};