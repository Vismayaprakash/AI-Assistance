function getApiBase() {
  const customUrl = localStorage.getItem('backend_url');
  if (customUrl) {
    return `${customUrl.replace(/\/$/, '')}/api`;
  }
  return 'https://levitator-quickstep-unfocused.ngrok-free.dev/api';
}

function saveBackendUrl(url) {
  if (url.trim()) {
    localStorage.setItem('backend_url', url.trim());
  } else {
    localStorage.removeItem('backend_url');
  }
  showToast('Backend Server URL updated! Page refreshing...', 'info');
  setTimeout(() => window.location.reload(), 1000);
}

function promptBackendUrl() {
  const current = localStorage.getItem('backend_url') || 'https://levitator-quickstep-unfocused.ngrok-free.dev';
  const newUrl = prompt('Enter your current ngrok Backend Server URL:', current);
  if (newUrl !== null) {
    saveBackendUrl(newUrl);
  }
}

let currentBusinessId = null;

// ==========================================
// AUTH & API HELPERS
// ==========================================

function getToken() {
  return localStorage.getItem('token');
}

function checkAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('businessId');
  window.location.href = 'login.html';
}

async function api(endpoint, options = {}) {
  const token = getToken();
  const config = {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    },
    ...options
  };

  try {
    const res = await fetch(`${getApiBase()}${endpoint}`, config);
    if (res.status === 401) {
      logout();
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ==========================================
// MODAL HELPERS
// ==========================================

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'conversationModal') {
    const audioPlayer = document.getElementById('modalAudioPlayer');
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.src = '';
    }
  }
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', (e) => {
    if (e.target === el) {
      el.classList.remove('active');
      if (el.id === 'conversationModal') {
        const audioPlayer = document.getElementById('modalAudioPlayer');
        if (audioPlayer) {
          audioPlayer.pause();
          audioPlayer.src = '';
        }
      }
    }
  });
});

// ==========================================
// NAVIGATION
// ==========================================

function navigateTo(page) {
  // Hide all pages
  document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));

  // Show target page
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.remove('hidden');

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');

  // Load page data
  switch (page) {
    case 'overview': loadOverview(); break;
    case 'conversations': loadConversations(); break;
    case 'knowledge': loadKnowledge(); break;
    case 'settings': loadSettings(); break;
    case 'simulator': loadSimulatorInfo(); break;
  }

  // Close mobile sidebar
  document.querySelector('.sidebar')?.classList.remove('open');
}

// Hash-based routing
window.addEventListener('hashchange', () => {
  const page = window.location.hash.slice(1) || 'overview';
  navigateTo(page);
});

// ==========================================
// FORMAT HELPERS
// ==========================================

function formatDuration(seconds) {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function channelIcon(channel) {
  switch (channel) {
    case 'call': return '📞';
    case 'web': return '💬';
    case 'whatsapp': return '📱';
    default: return '💬';
  }
}

function statusBadge(status) {
  switch (status) {
    case 'active': return '<span class="badge badge-active">🟢 Active</span>';
    case 'completed': return '<span class="badge badge-completed">✅ Completed</span>';
    case 'flagged': return '<span class="badge badge-flagged">🚩 Flagged</span>';
    default: return `<span class="badge badge-pending">${status}</span>`;
  }
}

// ==========================================
// OVERVIEW PAGE
// ==========================================

async function loadOverview() {
  if (!currentBusinessId) {
    await loadBusinessList();
    if (!currentBusinessId) return;
  }

  try {
    const stats = await api(`/stats?business_id=${currentBusinessId}`);
    if (stats) {
      document.getElementById('statTotal').textContent = stats.total || 0;
      document.getElementById('statToday').textContent = stats.today || 0;
      document.getElementById('statDuration').textContent = formatDuration(stats.avg_duration_seconds);
      document.getElementById('statPending').textContent = stats.pending_reviews || 0;
    }

    // Load recent conversations
    const convos = await api(`/conversations?business_id=${currentBusinessId}&limit=10`);
    const container = document.getElementById('recentConversations');

    if (convos && convos.length > 0) {
      container.innerHTML = `<table><thead><tr><th>Channel</th><th>Caller</th><th>Duration</th><th>Date</th></tr></thead><tbody>${
        convos.map(c => `<tr style="cursor:pointer;" onclick="viewConversation('${c.id}')">
          <td>${channelIcon(c.channel)}</td>
          <td>${c.caller_phone || 'Web visitor'}</td>
          <td>${formatDuration(c.duration_seconds)}</td>
          <td>${formatDate(c.started_at)}</td>
        </tr>`).join('')
      }</tbody></table>`;
    }

    // Hide setup card if business exists
    document.getElementById('setupCard').style.display = 'none';
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

async function loadBusinessList() {
  try {
    const businesses = await api('/business');
    if (businesses && businesses.length > 0) {
      currentBusinessId = businesses[0].id;
      localStorage.setItem('businessId', currentBusinessId);
      document.getElementById('businessNameSidebar').textContent = businesses[0].name;
      document.getElementById('setupCard').style.display = 'none';
    } else {
      document.getElementById('setupCard').style.display = 'block';
    }
  } catch (err) {
    console.error('Failed to load businesses:', err);
  }
}

async function quickSetupBusiness() {
  const name = document.getElementById('quickBizName').value.trim();
  const type = document.getElementById('quickBizType').value;

  if (!name) return showToast('Please enter a business name', 'error');

  try {
    const business = await api('/business', {
      method: 'POST',
      body: JSON.stringify({ name, type })
    });

    currentBusinessId = business.id;
    localStorage.setItem('businessId', business.id);
    document.getElementById('businessNameSidebar').textContent = business.name;
    document.getElementById('businessSetup').classList.add('hidden');
    document.getElementById('businessCreated').classList.remove('hidden');
    showToast('Business created successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// CONVERSATIONS PAGE
// ==========================================

async function loadConversations(channel, status) {
  if (!currentBusinessId) return;

  let endpoint = `/conversations?business_id=${currentBusinessId}&limit=50`;
  if (channel && channel !== 'all') {
    if (['call', 'web'].includes(channel)) endpoint += `&channel=${channel}`;
    else endpoint += `&status=${channel}`;
  }

  try {
    const convos = await api(endpoint);
    const tbody = document.getElementById('conversationsTable');

    if (!convos || convos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">No conversations found</td></tr>';
      return;
    }

    tbody.innerHTML = convos.map(c => `
      <tr>
        <td><span class="badge badge-${c.channel === 'call' ? 'call' : 'web'}">${channelIcon(c.channel)} ${c.channel}</span></td>
        <td>${c.caller_phone || 'Web visitor'}</td>
        <td>${formatDuration(c.duration_seconds)}</td>
        <td>${statusBadge(c.status)}</td>
        <td>${formatDate(c.started_at)}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewConversation('${c.id}')">View</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load conversations', 'error');
  }
}

function filterConversations(filter, el) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  loadConversations(filter);
}

async function viewConversation(id) {
  try {
    const conv = await api(`/conversations/${id}`);
    if (!conv) return;

    document.getElementById('modalConvInfo').textContent =
      `${channelIcon(conv.channel)} ${conv.channel} • ${conv.caller_phone || 'Web visitor'}`;
    document.getElementById('modalConvDuration').textContent =
      `Duration: ${formatDuration(conv.duration_seconds)} • ${formatDate(conv.started_at)}`;

    // Setup Audio Player if recording_url exists
    const audioContainer = document.getElementById('modalAudioPlayerContainer');
    const audioPlayer = document.getElementById('modalAudioPlayer');
    if (conv.recording_url) {
      audioPlayer.src = conv.recording_url;
      audioContainer.style.display = 'block';
    } else {
      audioPlayer.src = '';
      audioContainer.style.display = 'none';
    }

    const transcript = document.getElementById('modalTranscript');
    if (conv.messages && conv.messages.length > 0) {
      transcript.innerHTML = conv.messages.map(m => `
        <div class="msg-bubble msg-${m.role === 'assistant' ? 'assistant' : 'user'}">
          <div class="msg-role">${m.role === 'assistant' ? '🤖 AI' : '🗣️ Caller'}</div>
          ${m.content}
          ${m.role === 'assistant' ? `
            <div class="msg-actions">
              <button class="btn btn-sm btn-outline" onclick="reviewMessage('${m.id}', '${conv.id}', 'approve')" title="Approve">✅</button>
              <button class="btn btn-sm btn-outline" onclick="openReviewModal('${m.id}', '${conv.id}', '${m.content.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" title="Correct">✏️</button>
              <button class="btn btn-sm btn-outline" onclick="reviewMessage('${m.id}', '${conv.id}', 'flag')" title="Flag">🚩</button>
            </div>
          ` : ''}
        </div>
      `).join('');
    } else {
      transcript.innerHTML = '<div class="empty-state"><p>No messages in this conversation</p></div>';
    }

    openModal('conversationModal');
  } catch (err) {
    showToast('Failed to load conversation', 'error');
  }
}

async function reviewMessage(messageId, convId, action) {
  try {
    await api(`/conversations/${convId}/review`, {
      method: 'POST',
      body: JSON.stringify({ message_id: messageId, action })
    });
    showToast(`Response ${action === 'approve' ? 'approved' : 'flagged'} ✅`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openReviewModal(messageId, convId, originalContent) {
  document.getElementById('reviewOriginal').textContent = originalContent;
  document.getElementById('reviewMessageId').value = messageId;
  document.getElementById('reviewConvId').value = convId;
  document.getElementById('reviewCorrected').value = '';
  document.getElementById('reviewNotes').value = '';
  openModal('reviewModal');
}

async function submitCorrection() {
  const messageId = document.getElementById('reviewMessageId').value;
  const convId = document.getElementById('reviewConvId').value;
  const corrected = document.getElementById('reviewCorrected').value.trim();
  const notes = document.getElementById('reviewNotes').value.trim();

  if (!corrected) return showToast('Please enter the corrected response', 'error');

  try {
    await api(`/conversations/${convId}/review`, {
      method: 'POST',
      body: JSON.stringify({
        message_id: messageId,
        action: 'correct',
        corrected_response: corrected,
        reviewer_notes: notes
      })
    });
    closeModal('reviewModal');
    showToast('Correction saved & added to knowledge base! 🧠', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// KNOWLEDGE BASE PAGE
// ==========================================

async function loadKnowledge() {
  if (!currentBusinessId) return;

  try {
    const data = await api(`/knowledge?business_id=${currentBusinessId}`);
    const grid = document.getElementById('knowledgeGrid');
    const filterBar = document.getElementById('categoryFilters');

    // Render category filters
    if (data.categories && data.categories.length > 0) {
      filterBar.innerHTML = `<button class="filter-chip active" onclick="loadKnowledgeByCategory(null, this)">All (${data.entries.length})</button>` +
        data.categories.map(c =>
          `<button class="filter-chip" onclick="loadKnowledgeByCategory('${c.category}', this)">${c.category} (${c.count})</button>`
        ).join('');
    }

    if (!data.entries || data.entries.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
        <div class="icon">📚</div><h3>No knowledge entries yet</h3>
        <p>Import a template or add entries manually.</p>
      </div>`;
      return;
    }

    grid.innerHTML = data.entries.map(entry => `
      <div class="knowledge-card">
        <div class="kc-header">
          <div class="kc-title">${entry.title}</div>
          <span class="badge ${entry.is_active ? 'badge-active' : 'badge-pending'}">${entry.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="kc-content">${entry.content}</div>
        <div class="kc-footer">
          <span class="badge badge-web">${entry.category}</span>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline" onclick="deleteKnowledge('${entry.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast('Failed to load knowledge base', 'error');
  }
}

async function loadKnowledgeByCategory(category, el) {
  document.querySelectorAll('#categoryFilters .filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  let endpoint = `/knowledge?business_id=${currentBusinessId}`;
  if (category) endpoint += `&category=${category}`;

  try {
    const data = await api(endpoint);
    const grid = document.getElementById('knowledgeGrid');
    grid.innerHTML = data.entries.map(entry => `
      <div class="knowledge-card">
        <div class="kc-header">
          <div class="kc-title">${entry.title}</div>
          <span class="badge ${entry.is_active ? 'badge-active' : 'badge-pending'}">${entry.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="kc-content">${entry.content}</div>
        <div class="kc-footer">
          <span class="badge badge-web">${entry.category}</span>
          <div class="btn-group">
            <button class="btn btn-sm btn-outline" onclick="deleteKnowledge('${entry.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast('Failed to filter', 'error');
  }
}

function openAddKnowledgeModal() {
  document.getElementById('kbTitle').value = '';
  document.getElementById('kbContent').value = '';
  document.getElementById('kbCategory').value = 'FAQ';
  openModal('addKnowledgeModal');
}

async function addKnowledgeEntry() {
  const title = document.getElementById('kbTitle').value.trim();
  const content = document.getElementById('kbContent').value.trim();
  const category = document.getElementById('kbCategory').value;

  if (!title || !content) return showToast('Title and content are required', 'error');

  try {
    await api('/knowledge', {
      method: 'POST',
      body: JSON.stringify({ business_id: currentBusinessId, title, content, category })
    });
    closeModal('addKnowledgeModal');
    showToast('Knowledge entry added! 📚', 'success');
    loadKnowledge();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteKnowledge(id) {
  if (!confirm('Delete this entry?')) return;
  try {
    await api(`/knowledge/${id}`, { method: 'DELETE' });
    showToast('Entry deleted', 'success');
    loadKnowledge();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openImportModal() {
  openModal('importModal');
}

async function importTemplate(template) {
  try {
    const result = await api('/knowledge/import-template', {
      method: 'POST',
      body: JSON.stringify({ business_id: currentBusinessId, template })
    });
    closeModal('importModal');
    showToast(`${result.message} 🎉`, 'success');
    loadKnowledge();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function syncKnowledge() {
  try {
    showToast('Syncing knowledge to AI...', 'info');
    const result = await api('/knowledge/sync', {
      method: 'POST',
      body: JSON.stringify({ business_id: currentBusinessId })
    });
    showToast(`Synced ${result.synced} entries to AI! 🧠`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// SETTINGS PAGE
// ==========================================

async function loadSettings() {
  // If no business yet, show a friendly first-time setup prompt
  if (!currentBusinessId) {
    const phoneInfo = document.getElementById('phoneInfo');
    if (phoneInfo) phoneInfo.innerHTML = '<p class="text-muted">Fill in your details above and click <strong>Save Settings</strong> to create your business.</p>';
    showToast('Welcome! Fill in your business details and click Save to get started. 👋', 'info');
    return;
  }

  try {
    const biz = await api(`/business/${currentBusinessId}`);
    if (!biz) return;

    document.getElementById('setName').value = biz.name || '';
    document.getElementById('setType').value = biz.type || 'general';
    document.getElementById('setPhone').value = biz.phone || '';
    document.getElementById('setEmail').value = biz.email || '';
    document.getElementById('setAddress').value = biz.address || '';
    document.getElementById('setDescription').value = biz.description || '';
    document.getElementById('setGreeting').value = biz.greeting_message || '';
    document.getElementById('setPersonality').value = biz.ai_personality || '';

    // Phone numbers
    const phoneInfo = document.getElementById('phoneInfo');
    if (biz.phone_numbers && biz.phone_numbers.length > 0) {
      phoneInfo.innerHTML = biz.phone_numbers.map(p =>
        `<div class="card" style="margin-bottom:0.5rem;">
          <div class="flex-between">
            <div><strong>📞 ${p.phone_number}</strong><br><span class="text-sm text-muted">Provider: ${p.provider}</span></div>
            <span class="badge badge-active">Active</span>
          </div>
        </div>`
      ).join('');
    }
  } catch (err) {
    showToast('Failed to load settings', 'error');
  }
}

async function saveSettings() {
  try {
    const updates = {
      name: document.getElementById('setName').value.trim(),
      type: document.getElementById('setType').value,
      phone: document.getElementById('setPhone').value.trim(),
      email: document.getElementById('setEmail').value.trim(),
      address: document.getElementById('setAddress').value.trim(),
      description: document.getElementById('setDescription').value.trim(),
      greeting_message: document.getElementById('setGreeting').value.trim(),
      ai_personality: document.getElementById('setPersonality').value.trim()
    };

    if (!updates.name) {
      return showToast('Business name is required', 'error');
    }

    let result;
    if (!currentBusinessId) {
      // First time — CREATE the business
      result = await api('/business', {
        method: 'POST',
        body: JSON.stringify(updates)
      });
      currentBusinessId = result.id;
      localStorage.setItem('businessId', currentBusinessId);
      showToast('Business created successfully! 🎉', 'success');
    } else {
      // Already exists — UPDATE it
      result = await api(`/business/${currentBusinessId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      showToast('Settings saved! ✅', 'success');
    }

    document.getElementById('businessNameSidebar').textContent = updates.name;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function setupPhone() {
  try {
    showToast('Setting up phone number...', 'info');
    const result = await api(`/business/${currentBusinessId}/setup-phone`, { method: 'POST' });
    showToast(`Phone number ${result.phone_number} activated! 📞`, 'success');
    loadSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function linkManualPhone() {
  const phoneInput = document.getElementById('manualPhoneInput');
  const phoneNumber = phoneInput ? phoneInput.value.trim() : '';
  
  if (!phoneNumber) {
    return showToast('Please enter a phone number to link', 'error');
  }
  
  try {
    showToast('Linking phone number...', 'info');
    const result = await api(`/business/${currentBusinessId}/setup-phone`, {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber })
    });
    showToast(`Phone number ${result.phone_number} successfully linked! 📞`, 'success');
    if (phoneInput) phoneInput.value = '';
    loadSettings();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// VOICE SIMULATOR
// ==========================================

let isSimCalling = false;
let simWebClient = null;
let simRecognition = null;
let simConvoId = null;
let simGreeting = "Thank you for calling. How can I help you today?";
let mediaRecorder = null;
let audioChunks = [];

async function loadSimulatorInfo() {
  if (!currentBusinessId) {
    showToast('Please select or create a business first', 'error');
    return;
  }
  
  try {
    const biz = await api(`/business/${currentBusinessId}`);
    if (biz) {
      document.getElementById('simBizName').textContent = biz.name;
      simGreeting = biz.greeting_message || "Thank you for calling. How can I help you today?";
      
      let avatar = '🏢';
      if (biz.type === 'dental') avatar = '🦷';
      else if (biz.type === 'salon') avatar = '💇';
      document.getElementById('simAvatar').textContent = avatar;
      
      // Reset simulator UI
      document.getElementById('simStatus').textContent = 'Ready to Call';
      document.getElementById('simTranscript').classList.add('hidden');
      document.getElementById('simTranscript').innerHTML = '';
      const btn = document.getElementById('simCallBtn');
      btn.innerHTML = '📞 Start Voice Call';
      btn.className = 'btn btn-primary btn-round';
      isSimCalling = false;
    }
  } catch (err) {
    console.error('Failed to load simulator details:', err);
    showToast('Failed to load business details', 'error');
  }
}

async function toggleSimCall() {
  const btn = document.getElementById('simCallBtn');
  const status = document.getElementById('simStatus');
  const avatar = document.getElementById('simAvatar');
  const transcriptDiv = document.getElementById('simTranscript');
  
  if (isSimCalling) {
    // End call
    isSimCalling = false;
    status.textContent = 'Call Ended';
    avatar.classList.remove('calling');
    btn.innerHTML = '📞 Start Voice Call';
    btn.className = 'btn btn-primary btn-round';
    
    if (simConvoId && !simWebClient) {
      stopAudioRecordingAndUpload(simConvoId);
    }
    
    if (simWebClient) {
      try {
        simWebClient.stopCall();
      } catch (e) {}
      simWebClient = null;
    }
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isAiSpeaking = false;
    if (simSilenceTimer) {
      clearTimeout(simSilenceTimer);
      simSilenceTimer = null;
    }
    if (simRecognition) {
      try {
        simRecognition.stop();
      } catch (e) {}
      simRecognition = null;
    }
    
    if (simConvoId) {
      try {
        await api('/widget/close', {
          method: 'POST',
          body: JSON.stringify({ conversation_id: simConvoId })
        });
      } catch (e) {}
      simConvoId = null;
    }
    
    showToast('Call ended successfully', 'info');
    return;
  }
  
  // Start call
  isSimCalling = true;
  avatar.classList.add('calling');
  btn.innerHTML = '🔴 End Call';
  btn.className = 'btn btn-round calling';
  status.textContent = 'Calling...';
  transcriptDiv.innerHTML = '';
  transcriptDiv.classList.remove('hidden');
  
  try {
    showToast('Connecting to Retell Voice Engine...', 'info');
    const response = await api(`/business/${currentBusinessId}/web-call`, { method: 'POST' });
    
    if (response && response.access_token) {
      status.textContent = 'Connecting via Retell WebRTC...';
      
      const { RetellWebClient } = await import('https://cdn.jsdelivr.net/npm/retell-client-js-sdk/+esm');
      simWebClient = new RetellWebClient();
      
      simWebClient.on('call_started', () => {
        status.textContent = 'Connected (Retell WebRTC) 📞';
        showToast('Call started. Speak now.', 'success');
        startAudioRecording();
      });
      
      simWebClient.on('call_ended', () => {
        if (isSimCalling) toggleSimCall();
      });
      
      simWebClient.on('error', (err) => {
        console.error('Retell WebRTC error:', err);
        status.textContent = 'Retell Connection Failed. Retrying in Mock Mode...';
        simWebClient = null;
        startMockVoiceCall();
      });
      
      simWebClient.startCall({
        accessToken: response.access_token,
      });
      
      simConvoId = response.conversation_id;
      return;
    }
  } catch (err) {
    console.warn('Retell voice failed, falling back to browser Speech API:', err.message);
  }
  
  startMockVoiceCall();
}

function startAudioRecording() {
  audioChunks = [];
  navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };
      mediaRecorder.start(250);
    })
    .catch(err => {
      console.warn('Microphone access denied or error starting MediaRecorder:', err);
    });
}

function stopAudioRecordingAndUpload(conversationId) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    mediaRecorder.stream.getTracks().forEach(track => track.stop()); // Turn off mic light

    try {
      await fetch(`${getApiBase()}/widget/upload-recording?conversation_id=${conversationId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'audio/webm',
          'ngrok-skip-browser-warning': 'true'
        },
        body: audioBlob
      });
    } catch (err) {
      console.error('Failed to upload web recording:', err);
    }
  };

  mediaRecorder.stop();
}

function startMockVoiceCall() {
  const status = document.getElementById('simStatus');
  status.textContent = 'Connected (Local Voice Mock) 🔊';
  showToast('Using local browser voice engine (microphones & speakers)', 'success');
  
  startAudioRecording();
  
  // Create simulated convo
  api('/widget/chat', {
    method: 'POST',
    body: JSON.stringify({
      business_id: currentBusinessId,
      message: 'Initial connection greeting trigger'
    })
  }).then(data => {
    if (data && data.conversation_id) {
      simConvoId = data.conversation_id;
    }
  }).catch(console.error);

  speakText(simGreeting, () => {
    startListening();
  });
}

let isAiSpeaking = false;

function speakText(text, callback) {
  appendSimTranscript(text, 'bot');
  
  if (!window.speechSynthesis) {
    if (callback) callback();
    return;
  }
  
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const selectedVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                        voices.find(v => v.lang.startsWith('en')) ||
                        voices[0];
                        
  if (selectedVoice) utterance.voice = selectedVoice;
  
  utterance.onend = () => {
    isAiSpeaking = false;
    if (callback) callback();
  };
  
  utterance.onerror = (e) => {
    console.error('Speech synthesis error:', e);
    isAiSpeaking = false;
    if (callback) callback();
  };
  
  isAiSpeaking = true;
  window.speechSynthesis.speak(utterance);
}

function appendSimTranscript(text, role) {
  const container = document.getElementById('simTranscript');
  const line = document.createElement('div');
  line.className = `transcript-line ${role}`;
  line.textContent = `${role === 'bot' ? '🤖' : '👤'} ${text}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

let simSilenceTimer = null;
let simFinalTranscript = '';
let simInterimBubble = null;

function startListening() {
  if (!isSimCalling) return;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Web Speech Recognition not supported in this browser.', 'error');
    return;
  }
  
  simRecognition = new SpeechRecognition();
  simRecognition.continuous = true;
  simRecognition.interimResults = true;
  simRecognition.lang = 'en-US';
  
  const status = document.getElementById('simStatus');
  status.textContent = 'Listening... 🎙️';
  
  simFinalTranscript = '';
  simInterimBubble = null;

  const triggerAIResponse = async (text) => {
    if (!text.trim()) return;
    
    // Finalize the transcript UI bubble
    if (simInterimBubble) {
      simInterimBubble.textContent = `👤 ${text}`;
      simInterimBubble.classList.remove('interim');
      simInterimBubble = null;
    } else {
      appendSimTranscript(text, 'user');
    }
    
    status.textContent = 'Thinking... 🧠';
    
    try {
      const response = await api('/widget/chat', {
        method: 'POST',
        body: JSON.stringify({
          business_id: currentBusinessId,
          conversation_id: simConvoId || undefined,
          message: text
        })
      });
      
      if (response && response.response) {
        status.textContent = 'Speaking... 🔊';
        speakText(response.response, () => {
          status.textContent = 'Listening... 🎙️';
        });
      }
    } catch (err) {
      console.error(err);
      status.textContent = 'Error processing speech';
      speakText("I'm sorry, I encountered an error. Can you repeat that?", () => {
        status.textContent = 'Listening... 🎙️';
      });
    }
  };

  simRecognition.onresult = (e) => {
    let interimText = '';
    
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      if (e.results[i].isFinal) {
        simFinalTranscript += e.results[i][0].transcript + ' ';
      } else {
        interimText += e.results[i][0].transcript;
      }
    }
    
    const currentText = (simFinalTranscript + interimText).trim();
    if (currentText) {
      // Voice interruption trigger while AI is speaking
      if (isAiSpeaking) {
        console.log('⚡ Interruption detected! Stopping speech synthesis.');
        window.speechSynthesis.cancel();
        isAiSpeaking = false;
        if (simSilenceTimer) clearTimeout(simSilenceTimer);
        
        // Finalize speech bubble immediately
        if (simInterimBubble) {
          simInterimBubble.textContent = `👤 ${currentText}`;
          simInterimBubble.classList.remove('interim');
          simInterimBubble = null;
        } else {
          appendSimTranscript(currentText, 'user');
        }
        
        triggerAIResponse(currentText);
        return;
      }

      // Create/update real-time speech bubble
      const container = document.getElementById('simTranscript');
      if (!simInterimBubble) {
        simInterimBubble = document.createElement('div');
        simInterimBubble.className = 'transcript-line user interim';
        container.appendChild(simInterimBubble);
      }
      simInterimBubble.textContent = `👤 ${currentText}...`;
      container.scrollTop = container.scrollHeight;

      // Reset turn-taking silence timer (1.5 seconds)
      if (simSilenceTimer) clearTimeout(simSilenceTimer);
      simSilenceTimer = setTimeout(() => {
        triggerAIResponse(currentText);
      }, 1500);
    }
  };
  
  simRecognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.error('Speech recognition error:', e.error);
    }
  };
  
  simRecognition.onend = () => {
    // If still in calling mode, always keep restart/active
    if (isSimCalling) {
      try {
        simRecognition.start();
      } catch(e) {}
    }
  };
  
  simRecognition.start();
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  if (!checkAuth()) return;

  // Load saved business ID from localStorage
  const savedId = localStorage.getItem('businessId');

  if (savedId) {
    try {
      // Verify it still exists on the server
      const res = await fetch(`${getApiBase()}/business/${savedId}`, {
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'ngrok-skip-browser-warning': 'true'
        }
      });
      if (res.ok) {
        const biz = await res.json();
        currentBusinessId = savedId;
        document.getElementById('businessNameSidebar').textContent = biz.name;
      } else {
        // Stale ID — clear it and try to load from server
        localStorage.removeItem('businessId');
        currentBusinessId = null;
        await loadBusinessList();
      }
    } catch (e) {
      localStorage.removeItem('businessId');
      currentBusinessId = null;
    }
  } else {
    // No saved ID — try to auto-load first business from server
    await loadBusinessList();
  }

  // Initialize Backend URL input if present
  const urlInput = document.getElementById('backendUrlInput');
  if (urlInput) {
    urlInput.value = localStorage.getItem('backend_url') || '';
  }

  // Navigate to current hash or default
  const page = window.location.hash.slice(1) || 'overview';
  navigateTo(page);
});
