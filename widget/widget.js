// ==========================================
// AI Receptionist Widget — Client Logic
// ==========================================

const API_BASE = '/api';
let currentBusinessId = null;
let currentConversationId = null;
let businessConfig = null;

// Parse query parameters
const urlParams = new URLSearchParams(window.location.search);
currentBusinessId = urlParams.get('business_id');

// Elements
const chatMessages = document.getElementById('chatMessages');
const chatInputForm = document.getElementById('chatInputForm');
const chatInput = document.getElementById('chatInput');
const typingIndicator = document.getElementById('typingIndicator');
const assistantName = document.getElementById('assistantName');
const assistantStatus = document.getElementById('assistantStatus');
const closeWidgetBtn = document.getElementById('closeWidgetBtn');

// Initialize
async function init() {
  if (!currentBusinessId) {
    appendSystemMessage('Error: Missing business_id parameter in URL.');
    chatInput.disabled = true;
    return;
  }

  // Load conversation ID from storage
  currentConversationId = localStorage.getItem(`chat_convo_${currentBusinessId}`);

  try {
    // Fetch public business config
    const res = await fetch(`${API_BASE}/widget/business/${currentBusinessId}`);
    if (!res.ok) throw new Error('Business not found');
    businessConfig = await res.json();

    // Configure widget header and theme
    setupTheme(businessConfig);

    // Initial greeting
    if (chatMessages.children.length <= 1) {
      chatMessages.innerHTML = ''; // Clear default welcome
      appendBotMessage(businessConfig.greeting_message || 'Thank you for contacting us. How can I help you today?');
    }
  } catch (err) {
    console.error('Failed to load business info:', err);
    appendSystemMessage('Welcome to our assistant. How can we help you today?');
  }

  // Handle post message for parent window close if embed.js is used
  if (window.parent !== window) {
    closeWidgetBtn.style.display = 'block';
    closeWidgetBtn.addEventListener('click', () => {
      window.parent.postMessage({ type: 'close-receptionist-widget' }, '*');
    });
  }
}

function setupTheme(config) {
  assistantName.textContent = config.name;
  
  let avatar = '🏢';
  let gradient = 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
  let primaryColor = '#3b82f6';

  if (config.type === 'dental') {
    avatar = '🦷';
    gradient = 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)';
    primaryColor = '#0ea5e9';
  } else if (config.type === 'salon') {
    avatar = '💇';
    gradient = 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)';
    primaryColor = '#ec4899';
  }

  document.querySelector('.avatar').textContent = avatar;
  document.querySelector('.chat-header').style.background = gradient;
  document.documentElement.style.setProperty('--primary-color', primaryColor);
  document.documentElement.style.setProperty('--primary-gradient', gradient);
  document.documentElement.style.setProperty('--msg-user-bg', primaryColor);
}

// Helpers
function appendUserMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble user';
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  scrollToBottom();
}

function appendBotMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble bot';
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  scrollToBottom();
}

function appendSystemMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble system';
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  scrollToBottom();
}

function showTyping(show) {
  if (show) {
    typingIndicator.classList.remove('hidden');
    chatMessages.appendChild(typingIndicator); // Keep indicator at bottom
    scrollToBottom();
  } else {
    typingIndicator.classList.add('hidden');
  }
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Form Submit
chatInputForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  appendUserMessage(text);
  showTyping(true);

  try {
    const res = await fetch(`${API_BASE}/widget/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: currentBusinessId,
        conversation_id: currentConversationId || undefined,
        message: text
      })
    });

    if (!res.ok) throw new Error('Failed to get response');
    const data = await res.json();

    // Store conversation ID for session retention
    if (data.conversation_id && data.conversation_id !== currentConversationId) {
      currentConversationId = data.conversation_id;
      localStorage.setItem(`chat_convo_${currentBusinessId}`, currentConversationId);
    }

    showTyping(false);
    appendBotMessage(data.response);
  } catch (err) {
    console.error('Chat error:', err);
    showTyping(false);
    appendBotMessage("I'm sorry, I encountered a temporary connection issue. Please try again.");
  }
});

// Run
init();
