document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const chatArea = document.getElementById('chatArea');
    const micBtn = document.getElementById('micBtn');
    const statusText = document.getElementById('statusText');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const apiKeyInput = document.getElementById('apiKey');

    // State
    let apiKey = localStorage.getItem('geminiApiKey') || '';
    let isRecording = false;
    let recognition;
    let synth = window.speechSynthesis;
    let conversationHistory = [];
    let isSpeaking = false;

    // Haier Manual Context
    const systemInstruction = `Jesteś profesjonalnym serwisantem pralki Haier HW80-B14959S8U1S. Twoim zadaniem jest pomaganie użytkownikowi w diagnozowaniu problemów krok po kroku. Jesteś interaktywnym asystentem głosowym. Twoje odpowiedzi muszą być BARDZO KRÓTKIE i naturalne (jak w rozmowie). Podawaj instrukcje tylko po JEDNYM kroku na raz i czekaj na potwierdzenie.
    Kody błędów:
    - E4: Brak wody (sprawdzić kran, filtr w wężu).
    - CLrFLtr: Błąd odpływu (wyczyścić filtr na dole).
    - E2: Błąd drzwi.
    - Unb: Nierówne rozłożenie prania.
    Typowe problemy:
    - Skacząca pralka: usunąć śruby transportowe (częsty błąd instalacji!).
    Zawsze odzywaj się po polsku.`;

    // Initialize Conversation
    conversationHistory.push({
        role: "user",
        parts: [{ text: systemInstruction }]
    });

    // Check API Key
    if (!apiKey) {
        settingsModal.classList.remove('hidden');
    }

    // Settings Modal
    settingsBtn.addEventListener('click', () => {
        apiKeyInput.value = apiKey;
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        apiKey = apiKeyInput.value.trim();
        localStorage.setItem('geminiApiKey', apiKey);
        settingsModal.classList.add('hidden');
    });

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'pl-PL';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add('recording');
            statusText.textContent = "Słucham... (mów teraz)";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.trim();
            if (!transcript) return;
            addMessage(transcript, 'user');
            sendToGemini(transcript);
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech') {
                statusText.textContent = "Nie usłyszałem. Spróbuj ponownie.";
            } else if (event.error !== 'aborted') {
                statusText.textContent = "Błąd: " + event.error;
            }
            micBtn.classList.remove('recording');
            isRecording = false;
        };

        recognition.onend = () => {
            micBtn.classList.remove('recording');
            isRecording = false;
            statusText.textContent = "Naciśnij mikrofon, aby mówić";
        };
    } else {
        statusText.textContent = "Twoja przeglądarka nie wspiera rozpoznawania głosu.";
    }

    // Mic Button - MANUAL CONTROL ONLY
    micBtn.addEventListener('click', () => {
        if (!apiKey) {
            settingsModal.classList.remove('hidden');
            return;
        }

        // If AI is speaking, stop it first
        if (isSpeaking) {
            synth.cancel();
            isSpeaking = false;
            statusText.textContent = "Zatrzymano czytanie. Naciśnij mikrofon, aby mówić.";
            return;
        }
        
        if (isRecording) {
            recognition.stop();
        } else {
            try {
                recognition.start();
            } catch(e) {
                statusText.textContent = "Spróbuj ponownie za chwilę.";
            }
        }
    });

    // Add message to UI
    function addMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}-message`;
        
        const avatar = sender === 'user' 
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;

        let htmlText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        msgDiv.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="bubble">${htmlText}</div>
        `;
        
        chatArea.appendChild(msgDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // Send to Gemini
    async function sendToGemini(userInput) {
        statusText.textContent = "AI analizuje...";
        
        conversationHistory.push({
            role: "user",
            parts: [{ text: userInput }]
        });

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: conversationHistory })
            });

            if (!response.ok) {
                throw new Error("Błąd API: Upewnij się, że klucz jest poprawny.");
            }

            const data = await response.json();
            const aiText = data.candidates[0].content.parts[0].text;
            
            conversationHistory.push({
                role: "model",
                parts: [{ text: aiText }]
            });

            addMessage(aiText, 'ai');
            speakText(aiText);

        } catch (error) {
            addMessage("Przepraszam, wystąpił błąd: " + error.message, 'ai');
            statusText.textContent = "Naciśnij mikrofon, aby mówić";
        }
    }

    // Text to Speech - sentence by sentence
    function speakText(text) {
        if (!synth) {
            statusText.textContent = "Naciśnij mikrofon, aby mówić";
            return;
        }

        synth.cancel();

        const cleanText = text.replace(/[*#_]/g, '');
        
        // Split into short chunks (max ~80 chars each)
        const rawSentences = cleanText.split(/(?<=[.!?:;])\s+|(?<=\n)/);
        const sentences = [];
        for (const s of rawSentences) {
            const trimmed = s.trim();
            if (!trimmed) continue;
            // If sentence is still too long, break by commas too
            if (trimmed.length > 80) {
                const parts = trimmed.split(/,\s*/);
                for (const p of parts) {
                    if (p.trim()) sentences.push(p.trim());
                }
            } else {
                sentences.push(trimmed);
            }
        }

        if (sentences.length === 0) {
            statusText.textContent = "Naciśnij mikrofon, aby mówić";
            return;
        }

        const voices = synth.getVoices();
        const plVoice = voices.find(v => v.lang.includes('pl') || v.lang.includes('PL'));

        let idx = 0;
        isSpeaking = true;
        statusText.textContent = "AI mówi... (naciśnij mikrofon, aby przerwać)";

        function speakNext() {
            if (idx >= sentences.length || !isSpeaking) {
                isSpeaking = false;
                statusText.textContent = "Naciśnij mikrofon, aby mówić";
                return;
            }

            const utt = new SpeechSynthesisUtterance(sentences[idx]);
            window._utt = utt; // prevent GC

            utt.lang = 'pl-PL';
            utt.rate = 1.0;
            if (plVoice) utt.voice = plVoice;

            utt.onend = () => {
                idx++;
                // Small delay between sentences to let Chrome breathe
                setTimeout(speakNext, 100);
            };

            utt.onerror = () => {
                idx++;
                setTimeout(speakNext, 100);
            };

            synth.speak(utt);
        }

        speakNext();
    }

    // Preload voices (needed on some browsers)
    if (synth) {
        synth.getVoices();
        synth.onvoiceschanged = () => synth.getVoices();
    }
});
