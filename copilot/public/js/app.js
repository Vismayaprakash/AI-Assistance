function getApiBase() {
  const customUrl = localStorage.getItem('copilot_backend_url');
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }
  return '';
}

function saveBackendUrl(url) {
  if (url.trim()) {
    localStorage.setItem('copilot_backend_url', url.trim());
  } else {
    localStorage.removeItem('copilot_backend_url');
  }
  showToast('Backend Server URL updated! Page refreshing...', 'info');
  setTimeout(() => window.location.reload(), 1000);
}

const API_BASE = getApiBase();
let sessionId = null;
let recognition = null;
let isSessionActive = false;
let silenceTimer = null;
let finalTranscript = '';
let interimBubble = null;

// Initialize status check on load
document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.getElementById('backendUrlInput');
  if (urlInput) {
    urlInput.value = localStorage.getItem('copilot_backend_url') || '';
  }
  checkBackendStatus();
});

async function checkBackendStatus() {
  const dot = document.getElementById('apiStatusDot');
  const text = document.getElementById('apiStatusText');
  try {
    const res = await fetch(`${API_BASE}/api/status`, {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    });
    const data = await res.json();
    if (res.ok) {
      dot.className = 'dot online';
      text.textContent = `Online (${data.model})`;
    } else {
      throw new Error();
    }
  } catch (e) {
    dot.className = 'dot';
    text.textContent = 'Server Offline';
    showToast('Failed to connect to backend server', 'error');
  }
}

// ==========================================
// SESSION CONTROLS
// ==========================================

async function startSession() {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      }
    });
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'Failed to start session');
    
    sessionId = data.session_id;
    isSessionActive = true;

    // Update UI
    document.getElementById('sessionBadge').textContent = 'Live Assist Active';
    document.getElementById('sessionBadge').className = 'badge active';
    document.getElementById('startBtn').classList.add('hidden');
    document.getElementById('endBtn').classList.remove('hidden');
    document.getElementById('waveform').classList.add('active');
    document.getElementById('analysisSection').classList.add('hidden');
    
    const transcriptDiv = document.getElementById('transcript');
    transcriptDiv.innerHTML = '';
    document.getElementById('suggestions').innerHTML = '<p class="placeholder-text">Listening for questions...</p>';

    showToast('Session started. Listening... 🎙️', 'success');
    
    // Start Speech Recognition
    startSpeechRecognition();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function endSession() {
  if (!isSessionActive) return;
  
  isSessionActive = false;
  
  // Stop Speech Recognition
  if (recognition) {
    try {
      recognition.stop();
    } catch(e) {}
    recognition = null;
  }
  
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  // Update UI
  document.getElementById('sessionBadge').textContent = 'Offline';
  document.getElementById('sessionBadge').className = 'badge';
  document.getElementById('startBtn').classList.remove('hidden');
  document.getElementById('endBtn').classList.add('hidden');
  document.getElementById('waveform').classList.remove('active');

  showToast('Session ended. Generating AI analysis... 🧠', 'info');

  try {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/analyze`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      }
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to generate analysis');

    // Populate Analysis UI
    document.getElementById('analysisSummary').textContent = data.summary;
    
    const gapsContainer = document.getElementById('analysisGaps');
    gapsContainer.innerHTML = '';

    if (data.knowledge_gaps && data.knowledge_gaps.length > 0) {
      data.knowledge_gaps.forEach((gap, idx) => {
        const gapCard = document.createElement('div');
        gapCard.className = 'gap-item';
        gapCard.innerHTML = `
          <div class="gap-info">
            <strong>${gap.question}</strong>
            <span><em>Suggest addition:</em> ${gap.suggested_title}</span>
          </div>
          <button class="btn btn-secondary text-xs" onclick="addToKB(this, '${encodeURIComponent(gap.suggested_title)}', '${encodeURIComponent(gap.suggested_content)}')">
            ➕ Add to KB
          </button>
        `;
        gapsContainer.appendChild(gapCard);
      });
    } else {
      gapsContainer.innerHTML = '<p class="placeholder-text">No gaps detected. Knowledge base is fully covered! 🎉</p>';
    }

    document.getElementById('analysisSection').classList.remove('hidden');
    showToast('Analysis completed successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// SPEECH RECOGNITION
// ==========================================

function startSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Web Speech Recognition is not supported by your browser.', 'error');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  finalTranscript = '';
  interimBubble = null;

  const processQuery = async (queryText) => {
    if (!queryText.trim()) return;

    // Solidify user bubble
    if (interimBubble) {
      interimBubble.textContent = `👤 ${queryText}`;
      interimBubble.classList.remove('interim');
      interimBubble = null;
    } else {
      appendTranscript(queryText, 'user');
    }

    try {
      const res = await fetch(`${API_BASE}/api/assist`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ session_id: sessionId, text: queryText })
      });
      const data = await res.json();

      if (res.ok) {
        // Add to transcript UI (bot response / suggestion card in transcript)
        appendTranscript(data.answer, 'bot');
        
        // Add to Suggested recommendations list on the right panel
        if (data.sources && data.sources.length > 0) {
          appendRecommendation(queryText, data.answer, data.sources[0].title, data.sources[0].category);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  recognition.onresult = (e) => {
    let interimText = '';
    
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript + ' ';
      } else {
        interimText += e.results[i][0].transcript;
      }
    }

    const currentText = (finalTranscript + interimText).trim();
    if (currentText) {
      const container = document.getElementById('transcript');
      if (!interimBubble) {
        interimBubble = document.createElement('div');
        interimBubble.className = 'transcript-bubble user interim';
        container.appendChild(interimBubble);
      }
      interimBubble.textContent = `👤 ${currentText}...`;
      container.scrollTop = container.scrollHeight;

      // Silence detection (1.5s) to trigger RAG search
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        processQuery(currentText);
        finalTranscript = ''; // Reset for next phrase segment
      }, 1500);
    }
  };

  recognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.error('Speech recognition error:', e.error);
    }
  };

  recognition.onend = () => {
    // Keep listening if session is still active
    if (isSessionActive) {
      try {
        recognition.start();
      } catch(e) {}
    }
  };

  recognition.start();
}

function appendTranscript(text, role) {
  const container = document.getElementById('transcript');
  
  // Remove placeholder if present
  const placeholder = container.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  const bubble = document.createElement('div');
  bubble.className = `transcript-bubble ${role === 'bot' ? 'bot' : 'user'}`;
  bubble.textContent = `${role === 'bot' ? '🤖 AI Suggestion: ' : '👤 '}${text}`;
  
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendRecommendation(query, answer, sourceTitle, sourceCategory) {
  const container = document.getElementById('suggestions');
  
  const placeholder = container.querySelector('.placeholder-text');
  if (placeholder) placeholder.remove();

  const card = document.createElement('div');
  card.className = 'suggest-card';
  card.innerHTML = `
    <h4>
      <span>🔍 ${sourceTitle}</span>
      <span class="source-tag">${sourceCategory}</span>
    </h4>
    <p><strong>Query:</strong> "${query}"</p>
    <p class="mt-1"><strong>Assist Solution:</strong> ${answer}</p>
  `;

  // Prepend card to show latest suggestions at the top
  container.insertBefore(card, container.firstChild);
}

// ==========================================
// KNOWLEDGE BASE INTEGRATION (AUTO-LEARN)
// ==========================================

async function addToKB(btn, encodedTitle, encodedContent) {
  const title = decodeURIComponent(encodedTitle);
  const content = decodeURIComponent(encodedContent);
  
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch(`${API_BASE}/api/knowledge`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({
        title,
        content,
        category: 'auto-learn'
      })
    });

    if (res.ok) {
      btn.textContent = '✅ Added';
      btn.className = 'btn btn-secondary text-xs';
      showToast(`Added "${title}" to Knowledge Base! 📚`, 'success');
    } else {
      throw new Error();
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '➕ Add to KB';
    showToast('Failed to add entry to Knowledge Base', 'error');
  }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 4000);
}
