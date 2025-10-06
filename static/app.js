const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
let ws;

const messages = document.getElementById("messages");
const voiceBtn = document.getElementById("voiceBtn");
const questionInput = document.getElementById("questionInput");
const aiPresenter = document.getElementById("aiPresenter");
const statusEl = document.getElementById("status");

function appendMessage(role, content) {
  const el = document.createElement("div");
  el.className = "message " + role;
  // sanitize content so MathJax can find raw LaTeX
  const sanitized = sanitizeForMath(content);
  el.innerHTML = sanitized;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  if (window.MathJax) {
    MathJax.typesetPromise([el]).catch((e) => console.log(e));
  }
}

// Remove Markdown code fences and inline code ticks which prevent MathJax
function sanitizeForMath(s) {
  if (!s) return s;
  let out = s;
  try {
    // Remove fenced code blocks ```lang ... ``` -> keep inner content
    out = out.replace(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/g, "$1");
    // Remove single backticks `...` -> keep inner
    out = out.replace(/`([^`]+)`/g, "$1");
    // Unescape escaped dollar signs (\$ -> $) which some LLMs emit
    out = out.replace(/\\\$/g, "$");
    // Also remove surrounding <pre> or <code> tags if any (keep inner text)
    out = out.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "$1");
    out = out.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "$1");
    // Escape HTML to avoid XSS but keep $ for MathJax
    out = out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  } catch (e) {
    console.warn('sanitizeForMath failed', e);
  }
  return out;
}

function appendAssistant(content) {
  const el = document.createElement("div");
  el.className = "message assistant";
  const sanitized = sanitizeForMath(content);
  el.innerHTML = `
    <div class="message-wrapper">
      <div class="avatar-small">
        <img src="/static/avatar.jpg" alt="MathBot" class="avatar-img">
      </div>
      <div class="explanation">${sanitized}</div>
    </div>
  `;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  if (window.MathJax) MathJax.typesetPromise([el]).catch((e) => console.log(e));
}

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => (statusEl.textContent = "Connected");
  ws.onclose = () => (statusEl.textContent = "Disconnected");
  ws.onmessage = (evt) => {
    try {
      const payload = JSON.parse(evt.data);
      const resp = payload.response;
      // Use appendAssistant so sanitizer preserves LaTeX and avoids double-escaping
      appendAssistant(resp.explanation);
      speak(resp.speech);
    } catch (e) {
      console.error(e);
    }
  };
}

function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sendText(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) connect();
  const msg = { id: Date.now().toString(), text };
  appendMessage("user", `<div class=\"user-text\">${escapeHtml(text)}</div>`);
  ws.addEventListener(
    "open",
    () => {
      ws.send(JSON.stringify(msg));
    },
    { once: true }
  );
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

// Text-to-speech with male voice
let selectedVoice = null;

// Initialize voice selection
function initializeVoice() {
  const voices = window.speechSynthesis.getVoices();
  
  // Preferred male voices in order of preference
  const preferredMaleVoices = [
    'Alex',           // macOS male voice
    'Daniel',         // macOS male voice
    'Google US English Male',
    'Microsoft David Desktop',
    'Microsoft Mark Desktop',
    'Fred',
    'Tom'
  ];
  
  // Find the first available preferred male voice
  for (const voiceName of preferredMaleVoices) {
    selectedVoice = voices.find(voice => 
      voice.name.includes(voiceName) || 
      (voice.name.toLowerCase().includes('male') && voice.lang.startsWith('en'))
    );
    if (selectedVoice) break;
  }
  
  // Fallback: find any male voice
  if (!selectedVoice) {
    selectedVoice = voices.find(voice => 
      voice.name.toLowerCase().includes('male') && voice.lang.startsWith('en')
    ) || voices.find(voice => voice.lang.startsWith('en'));
  }
  
  console.log('Selected voice:', selectedVoice?.name || 'Default');
}

// Initialize voices when they're loaded
window.speechSynthesis.onvoiceschanged = initializeVoice;
initializeVoice(); // Try immediately in case voices are already loaded

function speak(text) {
  if (!text) return;
  
  // Show AI presenter with full animation
  showAiPresenter();
  
  // Keep the original avatar glow for text messages
  const avatars = document.querySelectorAll('.avatar-img');
  avatars.forEach(avatar => avatar.classList.add('speaking'));
  
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 0.9;  // Slightly slower for clarity
  utter.pitch = 0.8; // Lower pitch for more masculine sound
  utter.volume = 0.9;
  
  // Use selected male voice if available
  if (selectedVoice) {
    utter.voice = selectedVoice;
  }
  
  // Hide AI presenter when speech ends
  utter.onend = () => {
    hideAiPresenter();
    avatars.forEach(avatar => avatar.classList.remove('speaking'));
  };
  
  utter.onerror = () => {
    hideAiPresenter();
    avatars.forEach(avatar => avatar.classList.remove('speaking'));
  };
  
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function showAiPresenter() {
  aiPresenter.classList.remove('hidden');
  
  // Activate virtual human animations
  const virtualHuman = document.querySelector('.virtual-human');
  const mouth = document.querySelector('.mouth');
  const statusEl = document.querySelector('.speaking-status');
  
  if (virtualHuman) {
    virtualHuman.classList.add('speaking');
  }
  if (mouth) {
    mouth.classList.add('speaking');
  }
  if (statusEl) {
    statusEl.innerHTML = '<span class="status-icon">🎤</span> AI Explaining...';
  }
}

function hideAiPresenter() {
  aiPresenter.classList.add('hidden');
  
  // Stop virtual human animations
  const virtualHuman = document.querySelector('.virtual-human');
  const mouth = document.querySelector('.mouth');
  const statusEl = document.querySelector('.speaking-status');
  
  if (virtualHuman) {
    virtualHuman.classList.remove('speaking');
  }
  if (mouth) {
    mouth.classList.remove('speaking');
  }
  if (statusEl) {
    statusEl.innerHTML = '<span class="status-icon">💭</span> Ready to help';
  }
}

// Speech-to-text using Web Speech API
let recognition;
if (window.SpeechRecognition || window.webkitSpeechRecognition) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    questionInput.value = text;
    sendText(text);
  };
  recognition.onerror = (e) => console.error("Speech recognition error", e);
}

voiceBtn.onclick = () => {
  if (!recognition) {
    alert("Speech recognition not supported in this browser.");
    return;
  }
  recognition.start();
};

function sendMessage() {
  const t = questionInput.value.trim();
  if (!t) return;
  sendText(t);
  questionInput.value = "";
}

// Allow Enter key to send message
questionInput.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

function toggleVoiceRecognition() {
  if (!recognition) {
    alert("Speech recognition not supported in this browser.");
    return;
  }
  recognition.start();
}

function testVoice() {
  speak("Hello! I'm your MathBot assistant. I'm ready to help you with any undergraduate math questions you have.");
}

// Optional: Function to change talking head image
function changeTalkingHead(imageUrl) {
  const talkingFace = document.getElementById('talkingFace');
  if (talkingFace && imageUrl) {
    talkingFace.src = imageUrl;
  }
}

// Uncomment the line below to use your own talking head image:
// changeTalkingHead('/static/talking-avatar.jpg');

// init
connect();
