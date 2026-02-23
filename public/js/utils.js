// ============================================
// utils.js — Shared Utilities
// ============================================

// Redirect to login if not authenticated
function requireAuth() {
  const token = localStorage.getItem('fg_token');
  if (!token) window.location.href = '/pages/login.html';
}

// Format timestamp to "2 hours ago" style
function timeAgo(dateStr) {
  const now  = new Date();
  const past = new Date(dateStr);
  const diff = Math.floor((now - past) / 1000);

  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff/3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
  return past.toLocaleDateString('en-NG', { day:'numeric', month:'short' });
}

// Build a scan card HTML string (used in dashboard recent scans)
function buildScanCard(scan) {
  const cropEmoji = { Maize:'🌽', Tomato:'🍅', Rice:'🌾', Cassava:'🥬', Cowpea:'🫘', Yam:'🌿', Unknown:'❓' };
  const sevCls    = (scan.severity || 'medium').toLowerCase();
  const emoji     = cropEmoji[scan.crop_type] || '🌱';

  return `
    <div class="scan-card" onclick="window.location.href='/pages/history.html'" style="margin-bottom:10px;">
      <div class="scan-crop-icon">${emoji}</div>
      <div class="scan-info">
        <div class="scan-disease">${scan.disease_name}</div>
        <div class="scan-meta">${scan.crop_type || '—'} · ${timeAgo(scan.created_at)}</div>
      </div>
      <div class="scan-severity">
        <span class="badge ${sevCls}">${scan.severity}</span>
      </div>
    </div>`;
}