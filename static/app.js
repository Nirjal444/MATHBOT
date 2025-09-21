const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
let ws;

const chat = document.getElementById("chat");
const startBtn = document.getElementById("startBtn");
const sendBtn = document.getElementById("sendBtn");
const textInput = document.getElementById("textInput");
const statusEl = document.getElementById("status");

function appendMessage(role, content) {
  const el = document.createElement("div");
  el.className = "message " + role;
  // sanitize content so MathJax can find raw LaTeX
  const sanitized = sanitizeForMath(content);
  el.innerHTML = sanitized;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
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
  el.innerHTML = `<div class="explanation">${sanitized}</div>`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
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

// Text-to-speech
function speak(text) {
  if (!text) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
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
    textInput.value = text;
    sendText(text);
  };
  recognition.onerror = (e) => console.error("Speech recognition error", e);
}

startBtn.onclick = () => {
  if (!recognition) {
    alert("Speech recognition not supported in this browser.");
    return;
  }
  recognition.start();
};

sendBtn.onclick = () => {
  const t = textInput.value.trim();
  if (!t) return;
  sendText(t);
  textInput.value = "";
};

// init
connect();
