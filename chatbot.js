// Chatbot Elements
const chatInput = document.getElementById("userInput");
const chatButton = document.getElementById("sendButton");
const chatMessages = document.getElementById("chatMessages");
const chatStatus = document.getElementById("chatStatus");

// Temperature for Groq inference
let chatTemperature = 0.7;

// System prompt defining Kanishka's assistant persona and portfolio context
const portfolioContextPrompt =
  "You are an AI assistant for Kanishka Gupta's personal portfolio website. " +
  "Kanishka is a BTech Computer Science student at University of Jaipur with skills in HTML, CSS, JavaScript, Git, Web Development, and Machine Learning. " +
  "Projects on this website include: " +
  "1. Python Programs Collection (data structures, algorithms, and machine learning). " +
  "2. Messy Python Code Improvement (refactored and corrected using Cursor AI). " +
  "3. Bug Fixing Project (logic errors diagnosed and corrected using Cursor AI). " +
  "4. Interactive Quiz Application (web quiz for testing knowledge and checking scores). " +
  "5. Reading List Application (book reading list manager deployed on Vercel). " +
  "The website also features a real-time OpenWeatherMap Weather Search widget and a dark/light mode toggle at the bottom. " +
  "Answer questions accurately, politely, and concisely about Kanishka's portfolio, skills, projects, and web development. Keep replies under 60 words.";

// Multi-turn conversation history
let conversationHistory = [
  {
    role: "system",
    content: portfolioContextPrompt
  }
];

// Helper to escape HTML and format basic Markdown safely
function formatMessageContent(text) {
  if (!text) return "";
  const tempDiv = document.createElement("div");
  tempDiv.textContent = text;
  let safe = tempDiv.innerHTML;

  // Inline code `code`
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold **text** or __text__
  safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic *text* or _text_
  safe = safe.replace(/(^|[^\*])\*([^\*]+)\*/g, "$1<em>$2</em>");

  // Line breaks
  safe = safe.replace(/\n/g, "<br>");

  return safe;
}

// Display a chat message bubble
function showChatMessage(role, text) {
  if (!chatMessages) return null;
  const message = document.createElement("div");

  message.className =
    "chat-message " +
    (role === "user" ? "chat-user" : "chat-assistant");

  if (role === "user") {
    message.textContent = text;
  } else {
    message.innerHTML = formatMessageContent(text);
  }

  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

// Typing indicator management
function showTypingIndicator() {
  if (!chatMessages) return;
  removeTypingIndicator();

  const typingBubble = document.createElement("div");
  typingBubble.id = "chatTypingIndicator";
  typingBubble.className = "chat-message chat-assistant chat-typing";
  typingBubble.setAttribute("aria-label", "AI assistant is typing");
  typingBubble.innerHTML =
    '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

  chatMessages.appendChild(typingBubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const existing = document.getElementById("chatTypingIndicator");
  if (existing) {
    existing.remove();
  }
}

// Check configuration validity
function checkConfig() {
  const hasConfig =
    typeof CONFIG !== "undefined" &&
    CONFIG &&
    typeof CONFIG.apiKey === "string" &&
    CONFIG.apiKey.trim().length > 0 &&
    CONFIG.apiKey !== "YOUR_PRIVATE_GROQ_KEY" &&
    CONFIG.apiKey !== "YOUR_GROQ_API_KEY" &&
    !CONFIG.apiKey.startsWith("YOUR_");

  if (!hasConfig) {
    if (chatButton) chatButton.disabled = true;
    if (chatStatus) {
      chatStatus.textContent =
        "AI chat requires a valid Groq API key in config.js.";
    }
    return false;
  }

  if (chatButton) chatButton.disabled = false;
  if (chatStatus) chatStatus.textContent = "";
  return true;
}

// Initial welcome message
function initChatbot() {
  const isConfigured = checkConfig();

  if (chatMessages && chatMessages.children.length === 0) {
    if (isConfigured) {
      showChatMessage(
        "assistant",
        "Hello! 👋 I'm Kanishka's AI assistant. Ask me anything about Kanishka's skills, projects, or background, or choose a suggestion below!"
      );
    } else {
      showChatMessage(
        "assistant",
        "Welcome! To activate this assistant, add your Groq API key to config.js."
      );
    }
  }
}

// Send chat message
async function sendChatMessage(customText) {
  if (!checkConfig()) return;
  if (!chatButton || chatButton.disabled) return;

  const question = typeof customText === "string" ? customText.trim() : (chatInput ? chatInput.value.trim() : "");
  if (!question) return;

  // Show user's message
  showChatMessage("user", question);
  if (chatInput) {
    chatInput.value = "";
  }

  // Update conversation history
  conversationHistory.push({
    role: "user",
    content: question
  });

  // Limit conversation history to last 10 messages (plus system prompt) to prevent context blowup
  if (conversationHistory.length > 11) {
    conversationHistory = [
      conversationHistory[0],
      ...conversationHistory.slice(-10)
    ];
  }

  // Set loading state
  chatButton.disabled = true;
  if (chatInput) chatInput.disabled = true;
  if (chatStatus) chatStatus.textContent = "AI is thinking...";
  showTypingIndicator();

  const baseUrl = (typeof CONFIG !== "undefined" && CONFIG.baseUrl)
    ? CONFIG.baseUrl.replace(/\/$/, "")
    : "https://api.groq.com/openai/v1";
  const model = (typeof CONFIG !== "undefined" && CONFIG.model)
    ? CONFIG.model
    : "openai/gpt-oss-20b";

  try {
    const response = await fetch(
      baseUrl + "/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + CONFIG.apiKey
        },
        body: JSON.stringify({
          model: model,
          temperature: chatTemperature,
          messages: conversationHistory
        })
      }
    );

    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }

    if (response.status === 401) {
      throw new Error("AUTH_ERROR");
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error("Groq API error:", response.status, errBody);
      throw new Error("API_ERROR");
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error("INVALID_RESPONSE");
    }

    removeTypingIndicator();
    showChatMessage("assistant", answer.trim());

    // Store assistant response in history
    conversationHistory.push({
      role: "assistant",
      content: answer.trim()
    });

    if (chatStatus) chatStatus.textContent = "";

  } catch (error) {
    console.error("Chat error:", error);
    removeTypingIndicator();

    if (error.message === "RATE_LIMIT") {
      showChatMessage(
        "assistant",
        "Too many requests. Please wait a moment and try again."
      );
      if (chatStatus) chatStatus.textContent = "Rate limit reached. Please wait a moment.";
    } else if (error.message === "AUTH_ERROR") {
      showChatMessage(
        "assistant",
        "Invalid API key. Please check your Groq API key in config.js."
      );
      if (chatStatus) chatStatus.textContent = "API key error.";
    } else if (!navigator.onLine) {
      showChatMessage(
        "assistant",
        "No internet connection. Please reconnect and try again."
      );
      if (chatStatus) chatStatus.textContent = "Offline.";
    } else {
      showChatMessage(
        "assistant",
        "AI service unavailable right now. Please check configuration or try again shortly."
      );
      if (chatStatus) chatStatus.textContent = "Error connecting to AI service.";
    }
  } finally {
    chatButton.disabled = false;
    if (chatInput) {
      chatInput.disabled = false;
      chatInput.focus();
    }
  }
}

// Event Listeners
if (chatButton) {
  chatButton.addEventListener("click", () => sendChatMessage());
}

if (chatInput) {
  chatInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      sendChatMessage();
    }
  });
}

// Delegate suggestion chips
document.addEventListener("click", function (event) {
  const chip = event.target.closest(".suggestion-chip");
  if (chip) {
    const question = chip.getAttribute("data-question") || chip.textContent.trim();
    if (chatInput) {
      chatInput.value = question;
    }
    sendChatMessage(question);
  }
});

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initChatbot);
} else {
  initChatbot();
}
