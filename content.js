// Yappr Chrome Extension - Refactored Content Script
// All modules combined for compatibility

// Debug control - set to false for production/sharing
const DEBUG = true;

// ===============================================
// SMART TRANSCRIPTION CLEANUP SYSTEM
// ===============================================
function cleanTranscription(text) {
    if (!text || typeof text !== 'string') return text || '';
    
    try {
        if (DEBUG) console.log('🧹 Cleaning transcription:', text.substring(0, 100) + '...');
        let cleaned = text;
        
        // Safety check for extremely long text
        if (cleaned.length > 10000) {
            if (DEBUG) console.warn('⚠️ Text very long, truncating for safety');
            cleaned = cleaned.substring(0, 10000) + '...';
        }
        
        // Phase 1: Remove bracketed content with smart spacing
        cleaned = cleaned.replace(/\s*[\(\[]([^\)\]]*?)[\)\]]\s*/g, ' ');
        
        // Phase 2: Handle ellipsis (...) - convert to period
        cleaned = cleaned.replace(/\.{3,}/g, '.');
        
        // Phase 3: Handle false starts - em-dashes first, then incomplete words
        cleaned = cleaned.replace(/—\s*$/g, '.');        // "what the—" → "what the."
        cleaned = cleaned.replace(/—/g, '.');            // "what the— what" → "what the. what"  
        cleaned = cleaned.replace(/\b(\w+)-\s+\1\b/gi, '$1');  // "it's- it's" → "it's"
        cleaned = cleaned.replace(/\b\w+-\s+/g, ' ');          // "I- " → " "
        
        // Phase 4: Remove filler words with smart punctuation handling
        const basicFillers = /\b(um|uh|ah|er|hmm|umm|uhh|ehh|mm|mhm|laugh|laughs|cough|coughs|pause)\b/gi;
        
        // Handle basic filler words with trailing punctuation (e.g., "um,", "well.")
        cleaned = cleaned.replace(/\b(um|uh|ah|er|hmm|umm|uhh|ehh|mm|mhm|laugh|laughs|cough|coughs|pause)[.,;:]*\s*/gi, ' ');
        
        // Handle common filler words more carefully (preserve some context)
        cleaned = cleaned.replace(/\b(like|well|so|anyway|basically|literally|actually)[.,;:]*\s+/gi, ' ');
        
        // Handle phrase fillers
        cleaned = cleaned.replace(/\b(i mean|you know|kind of|sort of)[.,;:]*\s*/gi, ' ');
        
        // Handle filler words at start of sentences followed by punctuation
        cleaned = cleaned.replace(/^\s*(um|uh|ah|er|hmm|umm|uhh|ehh|mm|mhm|laugh|laughs|cough|coughs|pause|like|well|so|anyway|basically|literally|actually)[.,;:]*\s+/gi, '');
        
        // Clean up orphaned punctuation from filler removal
        cleaned = cleaned.replace(/\s+,\s+/g, ', '); // Fix " , " → ", "
        cleaned = cleaned.replace(/,\s*,+/g, ',');   // Fix multiple commas
        cleaned = cleaned.replace(/\.\s*\.+/g, '.');  // Fix multiple periods
        
        // Phase 5: Fix repeated words
        cleaned = cleaned.replace(/\b(\w+)\s+\1\b/gi, '$1');
        
        // Phase 6: Clean up spacing 
        cleaned = cleaned.replace(/\s{2,}/g, ' ');   // Multiple spaces → single
        cleaned = cleaned.replace(/^\s+|\s+$/g, ''); // Trim
        
        // Phase 7: Fix punctuation spacing
        cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1'); // Remove space before punctuation
        
        // Phase 8: Advanced punctuation cleanup
        cleaned = cleaned.replace(/[.,]{2,}/g, '.');     // Multiple periods/commas → single period
        cleaned = cleaned.replace(/,\s*\./g, '.');       // ", ." → "."
        cleaned = cleaned.replace(/;\s*[.,]/g, ';');     // "; ," or "; ." → ";"
        cleaned = cleaned.replace(/:\s*[.,;]/g, ':');    // ": ," or ": ." → ":"
        
        // Fix spacing around punctuation
        cleaned = cleaned.replace(/([.!?])\s{2,}/g, '$1 '); // Normalize spacing after sentence endings
        cleaned = cleaned.replace(/([,;:])\s{2,}/g, '$1 '); // Normalize spacing after other punctuation
        
        // Phase 9: Fix sentence capitalization (with safety check)
        cleaned = cleaned.replace(/([.!?])\s*([a-z])/g, (match, punct, letter) => {
            return punct + ' ' + letter.toUpperCase();
        });
        
        // Phase 10: Handle question marks spacing
        cleaned = cleaned.replace(/\?\s*([a-z])/g, (match, letter) => {
            return '? ' + letter.toUpperCase();
        });
        
        // Phase 11: Ensure proper sentence ending
        if (cleaned && !cleaned.match(/[.!?]$/)) {
            cleaned += '.';
        }
        
        // Final safety check
        if (!cleaned || cleaned.trim() === '') {
            if (DEBUG) console.warn('⚠️ Cleanup resulted in empty text, using original');
            return text;
        }
        
        if (DEBUG) console.log('✨ Cleaned result:', cleaned.substring(0, 100) + '...');
        return cleaned;
        
    } catch (error) {
        if (DEBUG) console.error('❌ Cleanup function error:', error);
        return text; // Return original text on any error
    }
}

// ===============================================
// CONFIGURATION AND CONSTANTS
// ===============================================
const CONFIG = {
    // API Settings
    ELEVENLABS: {
        MODEL_ID: 'scribe_v1',
        TIMEOUT: 120000,
        API_BASE: 'https://api.elevenlabs.io/v1/speech-to-text'
    },
    
    // Audio Settings
    AUDIO: {
        ELEVENLABS_CONSTRAINTS: {
            audio: {
                channelCount: 1,
                sampleRate: 22050,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        },
        CHUNK_SIZE: 2000,
        MAX_FILE_SIZE_MB: 25
    },
    
    // UI Settings
    UI: {
        NOTIFICATION_DURATION: 3000,
        TEXT_TRUNCATE_LENGTH: 100
    },
    
    // Storage Keys
    STORAGE_KEYS: {
        ELEVENLABS_API_KEY: 'elevenlabsApiKey',
        GPT_API_KEY: 'gptApiKey',
        CLEANUP_PROMPT: 'cleanupPrompt',
        ENABLE_CLEANUP: 'enableCleanup',
        HISTORY: 'history',
        STATS: 'stats',
        FOLDERS: 'folders'
    },
    
    // Text Formatting
    TEXT_FORMATTING: {
        MAX_PARAGRAPH_SENTENCES: 3,
        MAX_PARAGRAPH_WORDS: 80,
        MIN_PARAGRAPH_WORDS: 40,
        TOPIC_TRANSITIONS: [
            'however', 'but', 'although', 'meanwhile', 'furthermore', 'moreover',
            'additionally', 'on the other hand', 'in contrast', 'nevertheless',
            'therefore', 'consequently', 'as a result', 'in conclusion',
            'first', 'second', 'third', 'finally', 'lastly', 'next', 'then',
            'now', 'so', 'anyway', 'also', 'actually', 'basically', 'essentially'
        ],
        TIME_INDICATORS: [
            'yesterday', 'today', 'tomorrow', 'last week', 'next week',
            'last month', 'next month', 'last year', 'next year',
            'earlier', 'later', 'recently', 'soon', 'eventually'
        ]
    },
    
    DEFAULT_STATS: {
        totalWords: 0,
        totalMinutes: 0,
        weeklyWords: 0,
        weeklyMinutes: 0,
        lastWeekReset: new Date().toISOString()
    },
    
    // Storage optimization limits
    STORAGE_LIMITS: {
        MAX_HISTORY_ITEMS: 500,        // Keep only last 500 transcriptions
        MAX_SESSIONS: 100,             // Keep only last 100 sessions
        MAX_ANALYSES: 50,              // Keep only last 50 analyses
        CLEANUP_THRESHOLD: 0.8,        // Clean up when 80% of limit is reached
        MAX_TEXT_LENGTH: 5000          // Truncate very long transcriptions
    }
};

const SERVICES = {
    ELEVENLABS: 'elevenlabs'
};

const MESSAGE_TYPES = {
    TOGGLE_RECORDING: 'toggleRecording',
    GET_RECORDING_STATE: 'getRecordingState',
    RECORDING_STATE_CHANGED: 'recordingStateChanged',
    SERVICE_CHANGED: 'serviceChanged',
    TRANSCRIPTION_COMPLETE: 'transcriptionComplete'
};

// ===============================================
// UTILITY FUNCTIONS
// ===============================================
function generateUUID() {
    return crypto.randomUUID();
}

function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function showToast(message, type = 'success', duration = 3000) {
    const toast = document.createElement('div');
    const colors = {
        success: '#4ade80',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: ${colors[type] || colors.info}; color: white;
        padding: 12px 20px; border-radius: 8px; z-index: 10001;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px; font-weight: 500;
        opacity: 0; animation: toast-fade-in-out ${duration}ms ease;
    `;
    toast.textContent = message;
    
    if (!document.getElementById('toast-animations')) {
        const style = document.createElement('style');
        style.id = 'toast-animations';
        style.innerHTML = `
            @keyframes toast-fade-in-out {
                0%, 100% { opacity: 0; transform: translate(-50%, 10px); }
                10%, 90% { opacity: 1; transform: translate(-50%, 0); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}


function insertTextAtCursor(element, text) {
    if (element.isContentEditable) {
        element.focus();
        const formattedText = text.replace(/\n\n/g, '\n\n');
        // Modern approach using Selection API instead of deprecated execCommand
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            
            // Create text node with line breaks handled properly
            const lines = formattedText.split('\n');
            const fragment = document.createDocumentFragment();
            
            lines.forEach((line, index) => {
                if (index > 0) {
                    fragment.appendChild(document.createElement('br'));
                }
                if (line.trim()) {
                    fragment.appendChild(document.createTextNode(line));
                }
            });
            
            range.insertNode(fragment);
            
            // Move cursor to end of inserted text
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // Fallback for contentEditable
            if (document.execCommand) {
                document.execCommand('insertText', false, formattedText);
            } else {
                element.appendChild(document.createTextNode(formattedText));
            }
        }
    } else if (typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
        const start = element.selectionStart;
        element.value = element.value.slice(0, start) + text + element.value.slice(element.selectionEnd);
        element.selectionStart = element.selectionEnd = start + text.length;
    } else {
        navigator.clipboard.writeText(text);
        showToast('Text copied to clipboard', 'info');
        return;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

// ===============================================
// AUDIO PROCESSING
// ===============================================
function convertToMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
        return audioBuffer;
    }
    
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const monoBuffer = context.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
    const monoData = monoBuffer.getChannelData(0);
    
    // Average all channels into one
    for (let i = 0; i < audioBuffer.length; i++) {
        let sum = 0;
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            sum += audioBuffer.getChannelData(channel)[i];
        }
        monoData[i] = sum / audioBuffer.numberOfChannels;
    }
    
    context.close();
    return monoBuffer;
}

function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2;
    const buffer2 = new ArrayBuffer(44 + length);
    const view = new DataView(buffer2);
    const channels = [];
    let offset = 0;
    let pos = 0;

    // Write WAV header
    setUint32(0x46464952); // "RIFF"
    setUint32(36 + length); // file length - 8
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit
    setUint32(0x61746164); // "data" - chunk
    setUint32(length); // chunk length

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (pos < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][pos]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(44 + offset, sample, true);
            offset += 2;
        }
        pos++;
    }

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    return new Blob([buffer2], { type: 'audio/wav' });
}

// ===============================================
// TEXT FORMATTING
// ===============================================
function formatTextIntoParagraphs(text) {
    if (!text || text.trim().length === 0) return text;
    
    let cleanText = text.trim()
        .replace(/\s+/g, ' ')
        .replace(/([.!?])\s*([A-Z])/g, '$1 $2');
    
    const sentences = cleanText.split(/([.!?]+)/).filter(s => s.trim().length > 0);
    
    if (sentences.length <= 2) {
        return cleanText;
    }
    
    const paragraphs = [];
    let currentParagraph = [];
    let sentenceCount = 0;
    let wordCount = 0;
    
    for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (!sentence) continue;
        
        const words = sentence.split(/\s+/).length;
        const lowerSentence = sentence.toLowerCase();
        
        const shouldBreak = 
            (sentenceCount >= 2 && wordCount >= CONFIG.TEXT_FORMATTING.MIN_PARAGRAPH_WORDS) ||
            (sentenceCount >= CONFIG.TEXT_FORMATTING.MAX_PARAGRAPH_SENTENCES) ||
            (wordCount >= CONFIG.TEXT_FORMATTING.MAX_PARAGRAPH_WORDS) ||
            CONFIG.TEXT_FORMATTING.TOPIC_TRANSITIONS.some(transition => 
                lowerSentence.startsWith(transition.toLowerCase() + ' ') ||
                lowerSentence.includes(', ' + transition.toLowerCase() + ' ')
            ) ||
            CONFIG.TEXT_FORMATTING.TIME_INDICATORS.some(indicator => 
                lowerSentence.includes(indicator.toLowerCase())
            ) ||
            /^(well|so|now|anyway|look|listen|you know what)\s+/i.test(sentence);
        
        if (shouldBreak && currentParagraph.length > 0) {
            paragraphs.push(currentParagraph.join(' ').trim());
            currentParagraph = [];
            sentenceCount = 0;
            wordCount = 0;
        }
        
        currentParagraph.push(sentence);
        sentenceCount++;
        wordCount += words;
    }
    
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(' ').trim());
    }
    
    const result = paragraphs.length > 1 ? paragraphs.join('\n\n') : cleanText;
    return result.replace(/\s+([.!?])/g, '$1');
}

function countWords(text) {
    if (!text || text.trim().length === 0) return 0;
    return text.trim().split(/\s+/).length;
}

function extractCleanContent(transcription, activationPhrase) {
    if (!transcription || !activationPhrase) {
        return transcription;
    }
    
    const lowerTranscription = transcription.toLowerCase().trim();
    const lowerPhrase = activationPhrase.toLowerCase().trim();
    
    // Check if transcription starts with activation phrase
    if (lowerTranscription.startsWith(lowerPhrase)) {
        // Find the end of the activation phrase in the original text
        let endIndex = activationPhrase.length;
        
        // Skip over any punctuation that immediately follows the phrase
        while (endIndex < transcription.length && 
               /[.,!?;:'")\]\}]/.test(transcription[endIndex])) {
            endIndex++;
        }
        
        // Skip any whitespace after punctuation
        while (endIndex < transcription.length && 
               /\s/.test(transcription[endIndex])) {
            endIndex++;
        }
        
        const cleanContent = transcription.slice(endIndex).trim();
        if (DEBUG) console.log('🧹 Removed activation phrase:', `"${activationPhrase}"`, 
                   '+ punctuation →', `"${transcription.slice(0, endIndex)}"`, 
                   '→ Clean content:', `"${cleanContent.substring(0, 50)}..."`);
        
        return cleanContent;
    }
    
    // No phrase found at start, return original
    return transcription;
}

async function cleanupTranscription(rawText, cleanupPrompt, gptApiKey) {
    if (!cleanupPrompt || !gptApiKey || !rawText) {
        if (DEBUG) console.log('🧹 Cleanup skipped: missing requirements');
        return rawText; // Return original if no cleanup setup
    }
    
    // Skip cleanup for very short texts (likely not worth the API cost)
    if (rawText.trim().length < 20) {
        if (DEBUG) console.log('🧹 Cleanup skipped: text too short');
        return rawText;
    }
    
    try {
        if (DEBUG) console.log('🧹 Starting transcription cleanup with GPT-4o-mini...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gptApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: `${cleanupPrompt}\n\n${rawText}`
                    }
                ],
                max_tokens: Math.min(2000, Math.ceil(rawText.length * 1.5)), // Adaptive token limit
                temperature: 0.1,
                timeout: 30000 // 30 second timeout
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            if (DEBUG) console.error('❌ GPT cleanup failed:', response.status, response.statusText, errorText);
            
            // Check if it's an API key issue
            if (response.status === 401) {
                if (DEBUG) console.error('❌ Invalid GPT API key - cleanup disabled');
                showToast('GPT API key invalid - cleanup disabled', 'warning');
            } else if (response.status === 429) {
                if (DEBUG) console.error('❌ Rate limit exceeded - using original text');
                showToast('Rate limit exceeded - cleanup skipped', 'warning');
            } else {
                if (DEBUG) console.error(`❌ Cleanup API error ${response.status} - using original text`);
                showToast('Cleanup failed - using original text', 'warning');
            }
            
            return rawText; // Return original on error
        }
        
        const data = await response.json();
        const cleanedText = data.choices[0]?.message?.content?.trim();
        
        // Validate that cleaned text exists and isn't empty
        if (!cleanedText || cleanedText.length === 0) {
            if (DEBUG) console.warn('⚠️ Cleanup returned empty text - using original');
            showToast('Cleanup returned empty text', 'warning');
            return rawText;
        }
        
        // Basic sanity check: cleaned text shouldn't be drastically shorter (more than 70% reduction might indicate over-cleaning)
        if (cleanedText.length < rawText.length * 0.3) {
            if (DEBUG) console.warn('⚠️ Cleanup removed too much content - using original');
            if (DEBUG) console.warn(`Original: ${rawText.length} chars, Cleaned: ${cleanedText.length} chars`);
            showToast('Cleanup was too aggressive - using original text', 'warning');
            return rawText;
        }
        
        if (DEBUG) console.log('✅ Transcription cleanup successful');
        if (DEBUG) console.log(`📊 Cleanup stats: ${rawText.length} → ${cleanedText.length} chars`);
        return cleanedText;
        
    } catch (error) {
        if (DEBUG) console.error('❌ Error cleaning transcription:', error);
        
        // Provide specific error feedback based on error type
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showToast('Network error during cleanup - check connection', 'error');
        } else if (error.name === 'AbortError') {
            showToast('Cleanup timed out - using original text', 'warning');
        } else {
            showToast('Cleanup failed - using original text', 'warning');
        }
        
        return rawText; // Return original on error
    }
}

// ===============================================
// METRICS COMPUTATION FUNCTIONS
// ===============================================

function computeSessionMetrics(rawText, cleanedText, duration) {
    if (!rawText || duration <= 0) {
        return null;
    }

    const metrics = {
        // Basic counts
        totalWords: countWords(rawText),
        sessionDuration: Math.round(duration),
        
        // Performance metrics
        wordsPerMinute: calculateWPM(rawText, duration),
        
        // Speech quality metrics
        fillerWords: countFillerWords(rawText),
        fillerWordsBreakdown: getFillerWordsBreakdown(rawText).breakdown,
        uniqueWords: countUniqueWords(rawText),
        
        // Advanced metrics
        averageWordsPerSentence: calculateAverageWordsPerSentence(rawText),
        speechRate: calculateSpeechRate(rawText, duration),
        
        // Cleanup metrics (if cleanup was used)
        cleanupUsed: cleanedText && cleanedText !== rawText,
        wordsRemoved: cleanedText ? countWords(rawText) - countWords(cleanedText) : 0,
        
        // Metadata
        timestamp: new Date().toISOString(),
        sessionId: generateUUID()
    };

    return metrics;
}

function calculateWPM(text, durationSeconds) {
    if (durationSeconds <= 0) return 0;
    const words = countWords(text);
    return Math.round((words / durationSeconds) * 60);
}

function countFillerWords(text) {
    if (!text) return 0;
    
    const result = getFillerWordsBreakdown(text);
    return result.totalCount;
}

function getFillerWordsBreakdown(text) {
    if (!text) return { totalCount: 0, breakdown: {} };
    
    // Single-word fillers (removed multi-word phrases to avoid double-counting)
    const singleWordFillers = [
        'um', 'uh', 'er', 'ah', 'like',
        'basically', 'literally', 'actually', 'obviously', 'clearly',
        'anyway', 'so', 'well', 'right', 'okay', 'alright'
    ];
    
    // Multi-word fillers (including "I mean")
    const multiWordFillers = ['i mean', 'you know', 'sort of', 'kind of'];
    
    const breakdown = {};
    const words = text.toLowerCase().split(/\s+/);
    let totalCount = 0;
    
    // Initialize breakdown object for all filler types
    singleWordFillers.forEach(filler => {
        breakdown[filler] = 0;
    });
    multiWordFillers.forEach(filler => {
        breakdown[filler] = 0;
    });
    
    // Count individual filler words
    words.forEach(word => {
        const cleanWord = word.replace(/[^\w]/g, '');
        if (singleWordFillers.includes(cleanWord)) {
            breakdown[cleanWord]++;
            totalCount++;
        }
    });
    
    // Count multi-word fillers
    const textLower = text.toLowerCase();
    multiWordFillers.forEach(phrase => {
        const matches = textLower.match(new RegExp(phrase, 'g'));
        if (matches) {
            breakdown[phrase] += matches.length;
            totalCount += matches.length;
            if (DEBUG) console.log(`🔤 Found ${matches.length} instances of "${phrase}" in text`);
        }
    });
    
    if (DEBUG) console.log('🔤 Filler breakdown for text:', breakdown);
    if (DEBUG) console.log('🔤 Total filler count:', totalCount);
    
    return { totalCount, breakdown };
}

function countUniqueWords(text) {
    if (!text) return 0;
    
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 0);
    
    const uniqueWords = new Set(words);
    return uniqueWords.size;
}

function calculateAverageWordsPerSentence(text) {
    if (!text) return 0;
    
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    
    const totalWords = countWords(text);
    return Math.round(totalWords / sentences.length * 10) / 10; // Round to 1 decimal
}

function calculateSpeechRate(text, durationSeconds) {
    if (durationSeconds <= 0) return 0;
    
    // Speech rate includes all sounds, not just words
    const sounds = text.replace(/\s+/g, '').length; // Character count as proxy
    return Math.round((sounds / durationSeconds) * 60); // Characters per minute
}

// ================================
// PRESET MANAGEMENT SYSTEM
// ================================

/**
 * Universal Preset Manager
 * Replaces URL-based enhancement with user-controlled presets
 */
class PresetManager {
    constructor() {
        this.presets = new Map();
        this.selectedPresetId = null;
        this.initialized = false;
        this.init();
    }

    async init() {
        try {
            await this.loadPresets();
            await this.ensureDefaultPresets();
            
            // Auto-migrate from URL-based system if needed
            await this.migrateFromUrlSystem();
            
            this.initialized = true;
            if (DEBUG) console.log('✅ PresetManager: Initialized successfully');
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Initialization failed:', error);
        }
    }

    /**
     * Load all presets from storage
     */
    async loadPresets() {
        try {
            const storage = await this.getStorage();
            const { presets = {}, selectedPresetId = null } = storage;
            
            this.presets.clear();
            Object.values(presets).forEach(preset => {
                this.presets.set(preset.id, preset);
            });
            
            this.selectedPresetId = selectedPresetId;
            if (DEBUG) console.log(`📋 PresetManager: Loaded ${this.presets.size} presets, selected: ${selectedPresetId}`);
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Failed to load presets:', error);
        }
    }

    /**
     * Get storage wrapper (handles both sync and local)
     */
    async getStorage() {
        try {
            // Try sync storage first, fall back to local
            const syncData = await chrome.storage.sync.get(['presets', 'selectedPresetId', 'presetSettings']);
            return syncData;
        } catch (error) {
            if (DEBUG) console.warn('⚠️ PresetManager: Sync storage failed, using local:', error);
            const localData = await chrome.storage.local.get(['presets', 'selectedPresetId', 'presetSettings']);
            return localData;
        }
    }

    /**
     * Save storage wrapper
     */
    async saveStorage(data) {
        try {
            await chrome.storage.sync.set(data);
            if (DEBUG) console.log('✅ PresetManager: Saved to sync storage');
        } catch (error) {
            if (DEBUG) console.warn('⚠️ PresetManager: Sync failed, saving to local:', error);
            await chrome.storage.local.set(data);
        }
    }

    /**
     * Ensure default presets exist
     */
    async ensureDefaultPresets() {
        const defaultPresets = this.getDefaultPresetsDefinition();
        let needsSave = false;

        for (const preset of defaultPresets) {
            if (!this.presets.has(preset.id)) {
                this.presets.set(preset.id, preset);
                needsSave = true;
                if (DEBUG) console.log(`📋 PresetManager: Added default preset: ${preset.name}`);
            }
        }

        if (needsSave) {
            await this.savePresets();
        }
    }

    /**
     * Get default preset definitions
     */
    getDefaultPresetsDefinition() {
        const now = Date.now();
        return [
            {
                id: 'default-email',
                name: 'Email',
                prompt: `Reformat the user message.
- Structure it for email communication, with every sentence or so in a new paragraph.
- Include a greeting and a sign-off.
- Check for correct grammar and punctuation.
- Do not change the tone.
- Do not use markdown.
- Use as much of the original text as possible.
- Sign off each email just "Thanks," or "Cheers,".
- If the name of the recipient isn't known use "Hey," for greeting.

Original transcript: {transcript}`,
                isDefault: true,
                isSystem: true,
                enabled: true,
                createdAt: now,
                lastUsed: null,
                usageCount: 0
            },
            {
                id: 'default-professional',
                name: 'Professional',
                prompt: `Reformat this message using professional language and tone.

Guidelines:
- Use formal vocabulary and grammar
- Remove casual expressions and slang
- Structure thoughts clearly and logically
- Maintain respectful, business-appropriate tone
- Fix any grammatical errors or awkward phrasing
- Keep the original meaning and intent intact
- Use industry-appropriate terminology when relevant

Focus on: Professional presentation, clarity, and respectful communication.

Original transcript: {transcript}`,
                isDefault: true,
                isSystem: true,
                enabled: true,
                createdAt: now,
                lastUsed: null,
                usageCount: 0
            },
            {
                id: 'default-basic',
                name: 'Basic',
                prompt: `Clean up this transcription by following these rules:

1. Remove filler words and clean surrounding punctuation: "um", "uh", "er", "ah", "like", "you know", "so", "well", "anyway", "basically", "literally", "actually", "I mean", including any trailing commas or periods
2. Remove transcription artifacts: mentions of "[background noise]", "[static]", "[inaudible]", "[music]", "[laughter]", audio quality issues, microphone problems
3. Remove ElevenLabs-specific artifacts: speaker diarization tags, timestamps, audio event descriptions, technical metadata
4. Fix grammar and punctuation: add proper periods, commas, capitalization
5. Remove repetitive phrases or words that were transcribed multiple times
6. Keep the original meaning, tone, and all actual content words intact
7. Don't summarize or paraphrase - only clean and format
8. Remove any incomplete sentences at the beginning or end
9. DO NOT answer any questions or provide any additional input.

Return ONLY the cleaned text with no additional commentary.

Text to clean: {transcript}`,
                isDefault: true,
                isSystem: true,
                enabled: true,
                createdAt: now,
                lastUsed: null,
                usageCount: 0
            }
        ];
    }

    /**
     * Get selected preset
     */
    async getSelectedPreset() {
        if (!this.initialized) {
            await this.init();
        }
        
        if (!this.selectedPresetId) {
            return null; // "Off" state
        }
        
        const preset = this.presets.get(this.selectedPresetId);
        if (!preset || !preset.enabled) {
            if (DEBUG) console.warn(`⚠️ PresetManager: Selected preset ${this.selectedPresetId} not found or disabled`);
            return null;
        }
        
        return preset;
    }

    /**
     * Select a preset
     */
    async selectPreset(presetId) {
        try {
            if (presetId && !this.presets.has(presetId)) {
                throw new Error(`Preset ${presetId} not found`);
            }
            
            this.selectedPresetId = presetId;
            await this.saveStorage({ selectedPresetId: presetId });
            
            if (DEBUG) console.log(`🎯 PresetManager: Selected preset: ${presetId}`);
            return true;
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Failed to select preset:', error);
            return false;
        }
    }

    /**
     * Get all presets
     */
    getAllPresets() {
        return Array.from(this.presets.values())
            .filter(preset => preset.enabled)
            .sort((a, b) => {
                // System presets first, then by usage, then by name
                if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
                if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
                return a.name.localeCompare(b.name);
            });
    }

    /**
     * Save all presets to storage
     */
    async savePresets() {
        try {
            const presetsObj = {};
            this.presets.forEach((preset, id) => {
                presetsObj[id] = preset;
            });
            
            await this.saveStorage({ presets: presetsObj });
            if (DEBUG) console.log('✅ PresetManager: Presets saved successfully');
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Failed to save presets:', error);
        }
    }

    /**
     * Create custom preset
     */
    async createCustomPreset(name, prompt) {
        try {
            if (!name || !prompt) {
                throw new Error('Name and prompt are required');
            }
            
            // Check custom preset limit (2 custom + 3 system = 5 total)
            const customPresets = Array.from(this.presets.values()).filter(p => !p.isSystem);
            if (customPresets.length >= 2) {
                throw new Error('Maximum custom presets reached (2)');
            }
            
            const preset = {
                id: `custom-${Date.now()}`,
                name: name.trim(),
                prompt: prompt.trim(),
                isDefault: false,
                isSystem: false,
                enabled: true,
                createdAt: Date.now(),
                lastUsed: null,
                usageCount: 0
            };
            
            this.presets.set(preset.id, preset);
            await this.savePresets();
            
            if (DEBUG) console.log(`📋 PresetManager: Created custom preset: ${preset.name}`);
            return preset;
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Failed to create preset:', error);
            throw error;
        }
    }

    /**
     * Update preset usage statistics
     */
    async updateUsageStats(presetId) {
        try {
            const preset = this.presets.get(presetId);
            if (!preset) return;
            
            preset.lastUsed = Date.now();
            preset.usageCount = (preset.usageCount || 0) + 1;
            
            await this.savePresets();
            if (DEBUG) console.log(`📊 PresetManager: Updated usage for ${preset.name}`);
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Failed to update usage:', error);
        }
    }

    /**
     * Get quick access presets (most used + recent)
     */
    getQuickAccessPresets(limit = 3) {
        return Array.from(this.presets.values())
            .filter(preset => preset.enabled)
            .sort((a, b) => {
                // Sort by usage count (desc) then by last used (desc)
                if (a.usageCount !== b.usageCount) {
                    return b.usageCount - a.usageCount;
                }
                return (b.lastUsed || 0) - (a.lastUsed || 0);
            })
            .slice(0, limit);
    }

    /**
     * Delete custom preset
     */
    async deletePreset(presetId) {
        try {
            const preset = this.presets.get(presetId);
            if (!preset) {
                throw new Error('Preset not found');
            }
            
            if (preset.isSystem) {
                throw new Error('Cannot delete system preset');
            }
            
            this.presets.delete(presetId);
            
            // If deleted preset was selected, clear selection
            if (this.selectedPresetId === presetId) {
                this.selectedPresetId = null;
                await this.saveStorage({ selectedPresetId: null });
            }
            
            await this.savePresets();
            if (DEBUG) console.log(`🗑️ PresetManager: Deleted preset: ${preset.name}`);
            return true;
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Failed to delete preset:', error);
            throw error;
        }
    }

    /**
     * Migrate from old URL-based system to preset system
     */
    async migrateFromUrlSystem() {
        try {
            if (DEBUG) console.log('🔄 PresetManager: Starting migration from URL-based system...');
            
            const oldData = await chrome.storage.sync.get([
                'enableUrlEnhancement',
                'twitterCustomPrompt',
                'linkedinCustomPrompt',
                'gmailCustomPrompt',
                'twitterPresetEnabled',
                'linkedinPresetEnabled',
                'gmailPresetEnabled'
            ]);
            
            let migrationCount = 0;
            
            // Migrate custom prompts to new presets
            if (oldData.twitterCustomPrompt) {
                const preset = {
                    id: 'migrated-twitter-x',
                    name: 'Twitter/X (Migrated)',
                    prompt: oldData.twitterCustomPrompt,
                    isDefault: false,
                    isSystem: false,
                    enabled: oldData.twitterPresetEnabled !== false,
                    createdAt: Date.now(),
                    lastUsed: null,
                    usageCount: 0
                };
                this.presets.set(preset.id, preset);
                migrationCount++;
                if (DEBUG) console.log('✅ Migrated Twitter/X preset');
            }
            
            if (oldData.linkedinCustomPrompt) {
                const preset = {
                    id: 'migrated-linkedin',
                    name: 'LinkedIn (Migrated)',
                    prompt: oldData.linkedinCustomPrompt,
                    isDefault: false,
                    isSystem: false,
                    enabled: oldData.linkedinPresetEnabled !== false,
                    createdAt: Date.now(),
                    lastUsed: null,
                    usageCount: 0
                };
                this.presets.set(preset.id, preset);
                migrationCount++;
                if (DEBUG) console.log('✅ Migrated LinkedIn preset');
            }
            
            if (oldData.gmailCustomPrompt) {
                const preset = {
                    id: 'migrated-gmail',
                    name: 'Gmail (Migrated)',
                    prompt: oldData.gmailCustomPrompt,
                    isDefault: false,
                    isSystem: false,
                    enabled: oldData.gmailPresetEnabled !== false,
                    createdAt: Date.now(),
                    lastUsed: null,
                    usageCount: 0
                };
                this.presets.set(preset.id, preset);
                migrationCount++;
                if (DEBUG) console.log('✅ Migrated Gmail preset');
            }
            
            if (migrationCount > 0) {
                await this.savePresets();
                
                // Clean up old storage keys
                await chrome.storage.sync.remove([
                    'enableUrlEnhancement',
                    'twitterCustomPrompt',
                    'linkedinCustomPrompt',
                    'gmailCustomPrompt',
                    'twitterPresetEnabled',
                    'linkedinPresetEnabled',
                    'gmailPresetEnabled'
                ]);
                
                if (DEBUG) console.log(`✅ PresetManager: Migration complete! Migrated ${migrationCount} custom presets`);
                
                // Show migration notice
                this.showMigrationNotice(migrationCount);
            } else {
                if (DEBUG) console.log('ℹ️ PresetManager: No migration needed, no custom presets found');
            }
            
        } catch (error) {
            if (DEBUG) console.error('❌ PresetManager: Migration failed:', error);
        }
    }
    
    /**
     * Show migration notice to user
     */
    showMigrationNotice(migratedCount) {
        if (typeof window !== 'undefined' && window.location) {
            // Only show on settings page to avoid interrupting workflow
            if (window.location.pathname.includes('settings.html')) {
                const notice = document.createElement('div');
                notice.style.cssText = `
                    position: fixed; top: 20px; right: 20px; z-index: 10000;
                    background: #4CAF50; color: white; padding: 15px 20px;
                    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 14px; max-width: 300px;
                `;
                notice.innerHTML = `
                    <strong>✅ Migration Complete!</strong><br>
                    ${migratedCount} custom preset${migratedCount > 1 ? 's' : ''} migrated to the new system.
                    <br><br>
                    <small>Your presets are now available in the popup for any website!</small>
                `;
                
                document.body.appendChild(notice);
                
                // Auto-remove after 8 seconds
                setTimeout(() => {
                    if (notice.parentNode) {
                        notice.parentNode.removeChild(notice);
                    }
                }, 8000);
            }
        }
    }

    /**
     * Test method for debugging
     */
    static async testPresetManager() {
        if (DEBUG) console.log('🧪 Testing PresetManager...');
        
        const manager = new PresetManager();
        await manager.init();
        
        if (DEBUG) console.log('Default presets:', manager.getAllPresets());
        
        // Test preset selection
        await manager.selectPreset('default-email');
        const selected = await manager.getSelectedPreset();
        if (DEBUG) console.log('Selected preset:', selected?.name);
        
        // Test migration
        await manager.migrateFromUrlSystem();
        
        if (DEBUG) console.log('🧪 PresetManager test complete');
    }
}


class TemplateEngine {
    constructor() {
        this.variablePattern = /\{([^}]+)\}/g;
    }

    /**
     * Render template with provided variables
     * @param {string} template - Template string with {variable} placeholders
     * @param {object} variables - Object with variable values
     * @returns {object} - {success: boolean, result: string, missingVars: array}
     */
    render(template, variables) {
        if (DEBUG) console.log('🎨 TemplateEngine: Rendering template with variables:', Object.keys(variables));
        
        if (!template) {
            return { success: false, result: '', missingVars: [], error: 'No template provided' };
        }

        // Find all variables in template
        const templateVars = this.extractTemplateVariables(template);
        if (DEBUG) console.log('📝 TemplateEngine: Template requires variables:', templateVars);

        // Check for missing variables
        const missingVars = this.findMissingVariables(templateVars, variables);
        
        if (missingVars.length > 0) {
            if (DEBUG) console.warn('⚠️ TemplateEngine: Missing variables:', missingVars);
            return { 
                success: false, 
                result: '', 
                missingVars: missingVars,
                error: `Missing required variables: ${missingVars.join(', ')}`
            };
        }

        // Substitute variables
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        }

        if (DEBUG) console.log('✅ TemplateEngine: Template rendered successfully');
        return { success: true, result: result, missingVars: [] };
    }

    /**
     * Extract all variable names from template
     */
    extractTemplateVariables(template) {
        const matches = [];
        let match;
        
        // Reset regex state
        this.variablePattern.lastIndex = 0;
        
        while ((match = this.variablePattern.exec(template)) !== null) {
            matches.push(match[1]);
        }
        
        return [...new Set(matches)]; // Remove duplicates
    }

    /**
     * Find missing variables
     */
    findMissingVariables(templateVars, providedVars) {
        return templateVars.filter(varName => {
            const value = providedVars[varName];
            return value === undefined || value === null || value === '';
        });
    }

    /**
     * Validate template syntax
     */
    validateTemplate(template) {
        if (!template || typeof template !== 'string') {
            return { valid: false, error: 'Template must be a non-empty string' };
        }

        // Check for unmatched braces
        const openBraces = (template.match(/\{/g) || []).length;
        const closeBraces = (template.match(/\}/g) || []).length;
        
        if (openBraces !== closeBraces) {
            return { valid: false, error: 'Unmatched braces in template' };
        }

        // Check for empty variables
        if (template.includes('{}')) {
            return { valid: false, error: 'Empty variable placeholder found' };
        }

        return { valid: true };
    }

    /**
     * Get safe fallback when variables are missing
     */
    getSafeFallback(originalText, reason = 'missing variables') {
        return {
            success: true,
            result: originalText,
            isOriginal: true,
            fallbackReason: reason
        };
    }

    /**
     * Test template rendering (for development)
     */
    static testTemplateEngine() {
        if (DEBUG) console.log('🧪 Testing TemplateEngine...');
        
        const engine = new TemplateEngine();
        
        // Test case 1: Valid template with all variables
        const template1 = 'Transform this: {raw_transcript} under {char_limit} characters for {hostname}';
        const vars1 = {
            raw_transcript: 'Hello world this is a test',
            char_limit: 280,
            hostname: 'twitter.com'
        };
        
        if (DEBUG) console.log('\n🔍 Test 1 - Valid template:');
        const result1 = engine.render(template1, vars1);
        if (DEBUG) console.log('Result:', result1);

        // Test case 2: Missing variables
        const template2 = 'Email for {page_title} with {missing_var}';
        const vars2 = {
            page_title: 'Important Meeting'
        };
        
        if (DEBUG) console.log('\n🔍 Test 2 - Missing variables:');
        const result2 = engine.render(template2, vars2);
        if (DEBUG) console.log('Result:', result2);

        // Test case 3: Invalid template
        const template3 = 'Invalid template with {unclosed_brace';
        
        if (DEBUG) console.log('\n🔍 Test 3 - Invalid template:');
        const validation = engine.validateTemplate(template3);
        if (DEBUG) console.log('Validation:', validation);

        if (DEBUG) console.log('🧪 TemplateEngine test complete');
    }
}

class EnhancementToggle {
    constructor() {
        this.isVisible = false;
        this.currentMode = 'enhanced'; // 'enhanced' or 'original'
        this.element = null;
        this.onToggleCallback = null;
        this.enhancedText = '';
        this.originalText = '';
        this.currentConfig = null;
        this.autoHideTimeout = null;
    }

    /**
     * Create and show the toggle pill
     */
    show(enhancedText, originalText, config = null) {
        if (DEBUG) console.log('🎛️ EnhancementToggle: Showing toggle');
        
        this.enhancedText = enhancedText;
        this.originalText = originalText;
        this.currentConfig = config;
        
        if (this.isVisible) {
            this.update();
            return;
        }

        this.createElement();
        this.attachToDOM();
        this.isVisible = true;
        
        // Auto-hide after 10 seconds as fallback
        this.autoHideTimeout = setTimeout(() => {
            if (this.isVisible) {
                if (DEBUG) console.log('🎛️ Auto-hiding toggle after 10 seconds');
                this.hide();
            }
        }, 10000);
    }

    /**
     * Hide the toggle pill
     */
    hide() {
        if (DEBUG) console.log('🎛️ EnhancementToggle: Hiding toggle');
        
        // Clear auto-hide timeout
        if (this.autoHideTimeout) {
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = null;
        }
        
        if (this.element) {
            // Fade out animation
            this.element.style.opacity = '0';
            this.element.style.transform = 'translateY(-10px) scale(0.95)';
            
            // Remove after animation
            setTimeout(() => {
                if (this.element && this.element.parentNode) {
                    this.element.parentNode.removeChild(this.element);
                }
                this.element = null;
            }, 200);
        }
        
        this.isVisible = false;
    }

    /**
     * Create the toggle element
     */
    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'yappr-enhancement-toggle';
        
        // Add styles that won't conflict with site CSS
        this.addStyles();
        
        this.update();
        
        // Add click handlers
        this.element.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleToggle(e.target);
        });
    }

    /**
     * Update the toggle content
     */
    update() {
        if (!this.element) return;

        const enhancedLabel = this.currentConfig ? 
            `Enhanced (${this.currentConfig.preset}${this.currentConfig.mode ? ` ${this.currentConfig.mode}` : ''})` : 
            'Enhanced';

        this.element.innerHTML = `
            <div class="yappr-toggle-container">
                <span class="yappr-toggle-option ${this.currentMode === 'enhanced' ? 'yappr-active' : ''}" 
                      data-mode="enhanced">
                    ${enhancedLabel}
                </span>
                <span class="yappr-toggle-separator">·</span>
                <span class="yappr-toggle-option ${this.currentMode === 'original' ? 'yappr-active' : ''}" 
                      data-mode="original">
                    Original
                </span>
                <button class="yappr-toggle-close" data-action="close" title="Close">
                    ✕
                </button>
            </div>
        `;
    }

    /**
     * Handle toggle clicks
     */
    handleToggle(target) {
        // Handle close button
        const closeButton = target.closest('.yappr-toggle-close');
        if (closeButton) {
            if (DEBUG) console.log('🎛️ EnhancementToggle: Close button clicked');
            this.hide();
            return;
        }

        // Handle toggle options
        const toggleOption = target.closest('.yappr-toggle-option');
        if (!toggleOption) return;

        const newMode = toggleOption.dataset.mode;
        if (newMode === this.currentMode) return;

        if (DEBUG) console.log('🎛️ EnhancementToggle: Switching to', newMode);
        
        this.currentMode = newMode;
        this.update();

        // Trigger callback with appropriate text
        if (this.onToggleCallback) {
            const selectedText = newMode === 'enhanced' ? this.enhancedText : this.originalText;
            this.onToggleCallback(selectedText, newMode);
        }
    }

    /**
     * Set callback for toggle events
     */
    onToggle(callback) {
        this.onToggleCallback = callback;
    }

    /**
     * Set the active mode programmatically
     */
    setActiveMode(mode) {
        if (mode !== 'enhanced' && mode !== 'original') {
            if (DEBUG) console.warn('⚠️ Invalid mode:', mode);
            return;
        }
        
        if (DEBUG) console.log('🎛️ EnhancementToggle: Setting active mode to', mode);
        this.currentMode = mode;
        this.update();
    }

    /**
     * Get current selected text
     */
    getCurrentText() {
        return this.currentMode === 'enhanced' ? this.enhancedText : this.originalText;
    }

    /**
     * Attach to DOM near recording indicator
     */
    attachToDOM() {
        // Try to find yappr recording indicator first
        let targetElement = document.querySelector('.yappr-recording-indicator');
        
        // Fallback to finding text input areas on supported sites
        if (!targetElement) {
            const selectors = [
                '[data-testid="tweetTextarea_0"]', // Twitter
                '[data-testid="share-update-text"]', // LinkedIn
                '[aria-label="Message Body"]', // Gmail
                'textarea', // Generic fallback
                'input[type="text"]' // Generic fallback
            ];
            
            for (const selector of selectors) {
                targetElement = document.querySelector(selector);
                if (targetElement) break;
            }
        }

        // If still no target, attach to body
        if (!targetElement) {
            targetElement = document.body;
        }

        // Position relative to target
        if (targetElement === document.body) {
            // Fixed position at top-right if no specific target
            this.element.style.position = 'fixed';
            this.element.style.top = '20px';
            this.element.style.right = '20px';
            this.element.style.zIndex = '10000';
        } else {
            // Position near the target element
            this.element.style.position = 'absolute';
            this.element.style.zIndex = '10000';
            
            // Try to position above or below the target
            const rect = targetElement.getBoundingClientRect();
            if (rect.top > 60) {
                // Position above
                this.element.style.top = (rect.top - 40) + 'px';
            } else {
                // Position below
                this.element.style.top = (rect.bottom + 10) + 'px';
            }
            this.element.style.left = rect.left + 'px';
        }

        document.body.appendChild(this.element);
        
        if (DEBUG) console.log('🎛️ EnhancementToggle: Attached to DOM');
    }

    /**
     * Add CSS styles for the toggle
     */
    addStyles() {
        // Only add styles once
        if (document.getElementById('yappr-enhancement-toggle-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'yappr-enhancement-toggle-styles';
        style.textContent = `
            .yappr-enhancement-toggle {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
                background: rgba(26,26,47,0.95) !important;
                backdrop-filter: blur(10px) !important;
                transition: opacity 0.2s ease, transform 0.2s ease !important;
                border: 1px solid rgba(255,255,255,0.2) !important;
                border-radius: 20px !important;
                padding: 8px 16px !important;
                font-size: 13px !important;
                color: #e2e8f0 !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                user-select: none !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                max-width: 300px !important;
                z-index: 99999 !important;
            }

            .yappr-enhancement-toggle:hover {
                background: rgba(32,32,58,0.95) !important;
                transform: translateY(-1px) !important;
            }

            .yappr-toggle-container {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                white-space: nowrap !important;
            }

            .yappr-toggle-option {
                padding: 4px 8px !important;
                border-radius: 12px !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                font-weight: 500 !important;
            }

            .yappr-toggle-option:hover {
                background: rgba(255,255,255,0.1) !important;
            }

            .yappr-toggle-option.yappr-active {
                background: #4f46e5 !important;
                color: white !important;
            }

            .yappr-toggle-separator {
                color: rgba(255,255,255,0.4) !important;
                font-weight: 300 !important;
            }

            .yappr-toggle-close {
                background: none !important;
                border: none !important;
                color: rgba(255,255,255,0.6) !important;
                cursor: pointer !important;
                font-size: 14px !important;
                font-weight: bold !important;
                padding: 4px 6px !important;
                border-radius: 4px !important;
                margin-left: 4px !important;
                transition: all 0.2s ease !important;
            }

            .yappr-toggle-close:hover {
                background: rgba(255,255,255,0.1) !important;
                color: rgba(255,255,255,0.9) !important;
                transform: scale(1.1) !important;
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .yappr-enhancement-toggle {
                    font-size: 12px !important;
                    padding: 6px 12px !important;
                    max-width: 250px !important;
                }
                
                .yappr-toggle-option {
                    padding: 3px 6px !important;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Test toggle functionality
     */
    static testToggle() {
        if (DEBUG) console.log('🧪 Testing EnhancementToggle...');
        
        const toggle = new EnhancementToggle();
        
        const mockEnhanced = "🚀 This is an enhanced version of the transcript with better formatting and engagement.";
        const mockOriginal = "This is the original transcript text that was recorded";
        const mockConfig = { preset: 'Twitter', mode: 'post' };
        
        // Set up callback
        toggle.onToggle((text, mode) => {
            if (DEBUG) console.log(`🎛️ Toggle switched to ${mode}:`, text);
        });
        
        // Show toggle
        toggle.show(mockEnhanced, mockOriginal, mockConfig);
        
        if (DEBUG) console.log('🧪 EnhancementToggle test complete - check UI');
        
        // Return toggle instance for manual testing
        return toggle;
    }
}

class EnhancementService {
    constructor(presetManager = null) {
        this.storageManager = new StorageManager();
        this.templateEngine = new TemplateEngine();
        this.presetManager = presetManager || window.presetManager;
        this.isProcessing = false;
        this.timeout = 30000; // 30 second timeout
    }

    /**
     * Enhance transcript using selected preset
     * @param {string} rawTranscript - Original transcript text
     * @param {string} presetId - Optional preset ID (uses selected if not provided)
     * @returns {Promise<object>} - Enhancement result
     */
    async enhanceTranscript(rawTranscript, presetId = null) {
        if (DEBUG) console.log('🎨 EnhancementService: Starting enhancement...');
        
        // Prevent multiple simultaneous enhancements
        if (this.isProcessing) {
            if (DEBUG) console.warn('⚠️ EnhancementService: Already processing, skipping');
            return this.createFallbackResult(rawTranscript, 'already processing');
        }

        this.isProcessing = true;

        try {
            // Step 1: Get preset to use
            let preset;
            if (presetId) {
                preset = this.presetManager.presets.get(presetId);
            } else {
                preset = await this.presetManager.getSelectedPreset();
            }
            
            if (!preset) {
                if (DEBUG) console.log('❌ EnhancementService: No preset selected or available');
                return this.createFallbackResult(rawTranscript, 'no preset selected');
            }

            // Step 2: Validate inputs
            if (!rawTranscript || rawTranscript.trim().length === 0) {
                if (DEBUG) console.warn('⚠️ EnhancementService: Empty transcript');
                return this.createFallbackResult(rawTranscript, 'empty transcript');
            }

            if (rawTranscript.length > 4000) { // Safety limit for API
                if (DEBUG) console.warn('⚠️ EnhancementService: Transcript too long, trimming');
                rawTranscript = rawTranscript.substring(0, 4000) + '...';
            }

            // Step 3: Get OpenAI API key
            const apiKey = await this.getOpenAIKey();
            if (!apiKey) {
                if (DEBUG) console.warn('⚠️ EnhancementService: No OpenAI API key found');
                return this.createFallbackResult(rawTranscript, 'no API key');
            }

            // Step 4: Prepare prompt with transcript
            const variables = {
                transcript: rawTranscript,
                raw_transcript: rawTranscript // Backward compatibility
            };

            const templateResult = this.templateEngine.render(preset.prompt, variables);
            if (!templateResult.success) {
                if (DEBUG) console.warn('⚠️ EnhancementService: Template rendering failed:', templateResult.error);
                return this.createFallbackResult(rawTranscript, 'template error');
            }

            // Step 5: Call OpenAI API
            const enhancedText = await this.callOpenAI(templateResult.result, apiKey);

            // Step 6: Update usage statistics
            await this.presetManager.updateUsageStats(preset.id);
            
            if (DEBUG) console.log('✅ EnhancementService: Enhancement successful');
            return {
                success: true,
                isOriginal: false,
                result: enhancedText,
                originalText: rawTranscript,
                preset: preset.name,
                presetId: preset.id,
                charCount: enhancedText.length
            };

        } catch (error) {
            if (DEBUG) console.error('❌ EnhancementService: Enhancement failed:', error);
            return this.createFallbackResult(rawTranscript, error.message);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Get OpenAI API key from storage
     */
    async getOpenAIKey() {
        try {
            return await this.storageManager.getGptApiKey();
        } catch (error) {
            if (DEBUG) console.error('❌ EnhancementService: Failed to get API key:', error);
            return '';
        }
    }

    /**
     * Call OpenAI API with timeout and error handling
     */
    async callOpenAI(prompt, apiKey) {
        if (DEBUG) console.log('🤖 EnhancementService: Calling OpenAI API...');
        if (DEBUG) console.log('📝 Full prompt being sent to OpenAI:', prompt);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a professional writing assistant specialized in transforming speech-to-text transcripts into polished, contextually appropriate communication. Your goals: 1) Preserve the original speaker\'s intent and voice completely, 2) Remove speech artifacts and improve clarity, 3) Follow formatting instructions precisely, 4) Never add information not present in the original transcript, 5) Maintain appropriate tone and formality level for the context. Focus on enhancement, not rewriting.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7,
                    presence_penalty: 0.1,
                    frequency_penalty: 0.1
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Handle HTTP errors
            if (!response.ok) {
                const errorText = await response.text();
                if (DEBUG) console.error('❌ OpenAI API error:', response.status, errorText);
                
                switch (response.status) {
                    case 401:
                        throw new Error('Invalid API key');
                    case 429:
                        throw new Error('Rate limit exceeded');
                    case 402:
                        throw new Error('Insufficient credits');
                    case 500:
                    case 502:
                    case 503:
                        throw new Error('OpenAI service unavailable');
                    default:
                        throw new Error(`API error: ${response.status}`);
                }
            }

            const data = await response.json();
            
            if (!data.choices || data.choices.length === 0) {
                throw new Error('No response from OpenAI');
            }

            const enhancedText = data.choices[0].message.content.trim();
            
            if (!enhancedText || enhancedText.length === 0) {
                throw new Error('Empty response from OpenAI');
            }

            if (DEBUG) console.log('✅ EnhancementService: OpenAI API call successful');
            if (DEBUG) console.log('🎯 Raw response from OpenAI:', enhancedText);
            return enhancedText;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            // Re-throw known errors
            throw error;
        }
    }

    /**
     * Post-process and validate API result
     */
    postProcessResult(text, charLimit) {
        let processedText = text.trim();
        let wasTrimmed = false;

        // Remove any markdown or formatting that might have been added
        processedText = processedText.replace(/^\*\*|\*\*$/g, ''); // Remove bold
        processedText = processedText.replace(/^##?\s*/gm, ''); // Remove headers
        processedText = processedText.replace(/```[\s\S]*?```/g, ''); // Remove code blocks

        // Apply character limit if specified
        if (charLimit && processedText.length > charLimit) {
            if (DEBUG) console.log(`📏 EnhancementService: Trimming to ${charLimit} characters`);
            processedText = this.trimToLimit(processedText, charLimit);
            wasTrimmed = true;
        }

        return {
            text: processedText,
            wasTrimmed: wasTrimmed
        };
    }

    /**
     * Smart text trimming with word boundary preservation
     */
    trimToLimit(text, limit) {
        if (text.length <= limit) return text;
        
        // Try to preserve sentences
        const sentences = text.substring(0, limit - 3).split(/[.!?]+/);
        if (sentences.length > 1) {
            sentences.pop(); // Remove last incomplete sentence
            const result = sentences.join('.').trim() + '.';
            if (result.length >= limit * 0.8) { // Only if we keep most of the content
                return result;
            }
        }
        
        // Fallback to word boundary
        const words = text.substring(0, limit - 3).split(' ');
        words.pop(); // Remove last incomplete word
        return words.join(' ').trim() + '...';
    }

    /**
     * Create fallback result for failed enhancements
     */
    createFallbackResult(originalText, reason) {
        return {
            success: false,
            isOriginal: true,
            result: originalText,
            originalText: originalText,
            fallbackReason: reason,
            charCount: originalText.length
        };
    }

    /**
     * Test enhancement with mock data
     */
    static async testEnhancement() {
        if (DEBUG) console.log('🧪 Testing EnhancementService...');
        
        const service = new EnhancementService();
        const mockTranscript = "Um, so like, I just wanted to say that, you know, this new feature is really cool and, uh, I think people are going to love it because it saves a lot of time and makes everything much easier to use.";
        
        try {
            const result = await service.enhanceTranscript(mockTranscript);
            if (DEBUG) console.log('🎨 Enhancement result:', result);
            
            if (result.success) {
                if (DEBUG) console.log('✅ Enhanced text:', result.result);
            } else {
                if (DEBUG) console.log('❌ Fallback reason:', result.fallbackReason);
            }
            
        } catch (error) {
            if (DEBUG) console.error('❌ Enhancement test failed:', error);
        }
        
        if (DEBUG) console.log('🧪 EnhancementService test complete');
    }

    /**
     * Get enhancement status for current page
     */
    getStatus() {
        const config = this.urlMatcher.getCurrentConfiguration();
        return {
            hasPreset: !!config,
            preset: config?.preset?.name,
            mode: config?.mode,
            charLimit: config?.charLimit,
            isProcessing: this.isProcessing
        };
    }
}

// ===============================================
// STORAGE MANAGER
// ===============================================
class StorageManager {
    async get(keys) {
        try {
            // Separate large data (history) from small data (settings)
            const largeDataKeys = ['history', 'yapprSessions', 'yapprAnalyses'];
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            
            // Check if we're requesting large data
            const hasLargeDataRequest = requestedKeys.some(key => largeDataKeys.includes(key));
            
            if (hasLargeDataRequest) {
                // For large data, only check local storage
                if (DEBUG) console.log('📦 Getting large data from local storage only');
                const localData = await chrome.storage.local.get(keys);
                return Array.isArray(keys) 
                    ? localData
                    : { [keys]: localData[keys] || null };
            } else {
                // For small data, try sync first, then local
                if (DEBUG) console.log('☁️ Getting small data from sync and local storage');
                const syncData = await chrome.storage.sync.get(keys);
                const localData = await chrome.storage.local.get(keys);
                
                // Merge sync data over local data (sync takes precedence)
                return Array.isArray(keys) 
                    ? { ...localData, ...syncData }
                    : { [keys]: syncData[keys] || localData[keys] || null };
            }
        } catch (error) {
            if (DEBUG) console.error('Storage get error:', error);
            return Array.isArray(keys) ? {} : { [keys]: null };
        }
    }

    async set(data) {
        try {
            if (DEBUG) console.log('💾 Storage.set called with data keys:', Object.keys(data));
            
            // Separate large data (history) from small data (settings)
            const largeDataKeys = ['history', 'yapprSessions', 'yapprAnalyses'];
            const hasLargeData = Object.keys(data).some(key => largeDataKeys.includes(key));
            
            if (hasLargeData) {
                // Only save large data to local storage
                if (DEBUG) console.log('📦 Saving large data to local storage only');
                await chrome.storage.local.set(data);
                if (DEBUG) console.log('✅ Local storage set successful');
            } else {
                // Save small data to both sync and local storage
                if (DEBUG) console.log('☁️ Saving small data to both sync and local storage');
                try {
                    await chrome.storage.sync.set(data);
                    if (DEBUG) console.log('✅ Sync storage set successful');
                } catch (syncError) {
                    if (DEBUG) console.warn('⚠️ Sync storage failed, continuing with local only:', syncError.message);
                }
                
                await chrome.storage.local.set(data);
                if (DEBUG) console.log('✅ Local storage set successful');
            }
            
            return true;
        } catch (error) {
            if (DEBUG) console.error('❌ Storage set error:', error);
            return false;
        }
    }

    async getApiKey(service) {
        // Only ElevenLabs STT is supported
        if (service !== SERVICES.ELEVENLABS) {
            throw new Error('Only ElevenLabs service is supported for STT');
        }
        const result = await this.get(CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY);
        return result[CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY] || '';
    }

    async setApiKey(service, apiKey) {
        // Only ElevenLabs STT is supported
        if (service !== SERVICES.ELEVENLABS) {
            throw new Error('Only ElevenLabs service is supported for STT');
        }
        return await this.set({ [CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY]: apiKey });
    }

    async getSelectedService() {
        // Always return ElevenLabs as it's the only supported STT service
        return SERVICES.ELEVENLABS;
    }


    async getGptApiKey() {
        const result = await this.get(CONFIG.STORAGE_KEYS.GPT_API_KEY);
        return result[CONFIG.STORAGE_KEYS.GPT_API_KEY] || '';
    }

    async getCleanupPrompt() {
        const result = await this.get(CONFIG.STORAGE_KEYS.CLEANUP_PROMPT);
        return result[CONFIG.STORAGE_KEYS.CLEANUP_PROMPT] || '';
    }

    async isCleanupEnabled() {
        const result = await this.get(CONFIG.STORAGE_KEYS.ENABLE_CLEANUP);
        return result[CONFIG.STORAGE_KEYS.ENABLE_CLEANUP] === true; // Must be explicitly enabled
    }

    async getHistory() {
        const result = await this.get(CONFIG.STORAGE_KEYS.HISTORY);
        const history = result[CONFIG.STORAGE_KEYS.HISTORY] || [];
        
        let modified = false;
        history.forEach(item => {
            if (!item.id) {
                item.id = generateUUID();
                modified = true;
            }
        });
        
        if (modified) {
            await this.set({ [CONFIG.STORAGE_KEYS.HISTORY]: history });
        }
        
        return history;
    }

    async addTranscription(transcription) {
        if (DEBUG) console.log('🔍 StorageManager.addTranscription called');
        if (DEBUG) console.log('📝 Transcription to add:', {
            id: transcription.id,
            textLength: transcription.text?.length,
            folderId: transcription.folderId,
            folderName: transcription.folderName
        });
        
        const history = await this.getHistory();
        if (DEBUG) console.log('📋 Current history length before adding:', history.length);
        
        if (!transcription.id) {
            transcription.id = generateUUID();
            if (DEBUG) console.log('🆔 Generated new ID:', transcription.id);
        }
        
        // Optimize transcription for storage
        const optimizedTranscription = this.optimizeTranscription(transcription);
        
        history.unshift(optimizedTranscription);
        if (DEBUG) console.log('📋 History length after adding:', history.length);
        
        // Clean up old data if needed
        const cleanedHistory = await this.cleanupHistory(history);
        if (DEBUG) console.log('🧹 History length after cleanup:', cleanedHistory.length);
        
        const result = await this.set({ [CONFIG.STORAGE_KEYS.HISTORY]: cleanedHistory });
        if (DEBUG) console.log('💾 Storage set result:', result);
        
        return result;
    }

    optimizeTranscription(transcription) {
        // Truncate very long transcriptions to prevent storage bloat
        if (transcription.text && transcription.text.length > CONFIG.STORAGE_LIMITS.MAX_TEXT_LENGTH) {
            if (DEBUG) console.log('✂️ Truncating long transcription from', transcription.text.length, 'to', CONFIG.STORAGE_LIMITS.MAX_TEXT_LENGTH, 'characters');
            transcription.text = transcription.text.substring(0, CONFIG.STORAGE_LIMITS.MAX_TEXT_LENGTH) + '... [truncated]';
        }
        
        // Truncate raw text as well
        if (transcription.rawText && transcription.rawText.length > CONFIG.STORAGE_LIMITS.MAX_TEXT_LENGTH) {
            transcription.rawText = transcription.rawText.substring(0, CONFIG.STORAGE_LIMITS.MAX_TEXT_LENGTH) + '... [truncated]';
        }
        
        return transcription;
    }

    async cleanupHistory(history) {
        if (history.length <= CONFIG.STORAGE_LIMITS.MAX_HISTORY_ITEMS) {
            return history;
        }
        
        if (DEBUG) console.log('🧹 Cleaning up history - removing', history.length - CONFIG.STORAGE_LIMITS.MAX_HISTORY_ITEMS, 'old items');
        
        // Keep only the most recent items
        const cleanedHistory = history.slice(0, CONFIG.STORAGE_LIMITS.MAX_HISTORY_ITEMS);
        
        // Also clean up sessions and analyses
        await this.cleanupSessions();
        await this.cleanupAnalyses();
        
        return cleanedHistory;
    }

    async cleanupSessions() {
        try {
            const result = await chrome.storage.local.get(['yapprSessions']);
            const sessions = result.yapprSessions || [];
            
            if (sessions.length > CONFIG.STORAGE_LIMITS.MAX_SESSIONS) {
                if (DEBUG) console.log('🧹 Cleaning up sessions - removing', sessions.length - CONFIG.STORAGE_LIMITS.MAX_SESSIONS, 'old sessions');
                const cleanedSessions = sessions.slice(0, CONFIG.STORAGE_LIMITS.MAX_SESSIONS);
                await chrome.storage.local.set({ yapprSessions: cleanedSessions });
            }
        } catch (error) {
            if (DEBUG) console.error('Error cleaning up sessions:', error);
        }
    }

    async cleanupAnalyses() {
        try {
            const result = await chrome.storage.local.get(['yapprAnalyses']);
            const analyses = result.yapprAnalyses || [];
            
            if (analyses.length > CONFIG.STORAGE_LIMITS.MAX_ANALYSES) {
                if (DEBUG) console.log('🧹 Cleaning up analyses - removing', analyses.length - CONFIG.STORAGE_LIMITS.MAX_ANALYSES, 'old analyses');
                const cleanedAnalyses = analyses.slice(0, CONFIG.STORAGE_LIMITS.MAX_ANALYSES);
                await chrome.storage.local.set({ yapprAnalyses: cleanedAnalyses });
            }
        } catch (error) {
            if (DEBUG) console.error('Error cleaning up analyses:', error);
        }
    }

    async getStats() {
        const result = await this.get(CONFIG.STORAGE_KEYS.STATS);
        return { ...CONFIG.DEFAULT_STATS, ...result[CONFIG.STORAGE_KEYS.STATS] };
    }

    async setStats(stats) {
        return await this.set({ [CONFIG.STORAGE_KEYS.STATS]: stats });
    }

    async updateStats(transcriptionData) {
        const stats = await this.getStats();
        const minutes = Math.round(transcriptionData.duration / 60);
        
        stats.totalWords += transcriptionData.wordCount;
        stats.weeklyWords += transcriptionData.wordCount;
        stats.totalMinutes += minutes;
        stats.weeklyMinutes += minutes;
        
        return await this.setStats(stats);
    }

    async getFolders() {
        if (DEBUG) console.log('🔍 StorageManager.getFolders called');
        const result = await this.get(CONFIG.STORAGE_KEYS.FOLDERS);
        const folders = result[CONFIG.STORAGE_KEYS.FOLDERS] || [];
        if (DEBUG) console.log('📁 Retrieved folders:', folders.length, 'folders');
        folders.forEach((folder, index) => {
            if (DEBUG) console.log(`📁 ${index + 1}. "${folder.name}" - "${folder.activationPhrase}"`);
        });
        return folders;
    }

    async findFolderByActivationPhrase(text) {
        const folders = await this.getFolders();
        if (DEBUG) console.log('🔍 Searching for folder match among', folders.length, 'folders');
        
        folders.forEach(folder => {
            if (DEBUG) console.log('📁 Checking folder:', folder.name, 'with activation phrase:', `"${folder.activationPhrase}"`);
        });
        
        const matchingFolder = folders.find(folder => {
            const textLower = text.toLowerCase().trim();
            const phraseLower = folder.activationPhrase.toLowerCase().trim();
            const matches = textLower.startsWith(phraseLower);
            
            if (DEBUG) console.log('🔍 Comparing:', 
                `"${textLower.substring(0, 50)}..." starts with "${phraseLower}"?`, 
                matches
            );
            
            return matches;
        });
        
        return matchingFolder;
    }

    async initialize() {
        try {
            const existingData = await this.get([
                CONFIG.STORAGE_KEYS.STATS,
                CONFIG.STORAGE_KEYS.HISTORY
            ]);
            
            const updates = {};
            
            if (!existingData[CONFIG.STORAGE_KEYS.STATS]) {
                updates[CONFIG.STORAGE_KEYS.STATS] = CONFIG.DEFAULT_STATS;
            }
            
            if (!existingData[CONFIG.STORAGE_KEYS.HISTORY]) {
                updates[CONFIG.STORAGE_KEYS.HISTORY] = [];
            }
            
            if (Object.keys(updates).length > 0) {
                await this.set(updates);
            }
            
            return true;
        } catch (error) {
            if (DEBUG) console.error('Storage initialization error:', error);
            return false;
        }
    }
}

// ===============================================
// DEEP ANALYSIS ENGINE
// ===============================================
class DeepAnalysisEngine {
    constructor() {
        this.storageManager = new StorageManager();
    }

    async isAnalysisEnabled() {
        const result = await this.storageManager.get('enableAnalysis');
        return result['enableAnalysis'] === true;
    }

    async getAnalysisSchedule() {
        const result = await this.storageManager.get('analysisSchedule');
        return result['analysisSchedule'] || 'manual';
    }

    async analyzeVocabularyRichness(text, gptApiKey) {
        const prompt = `Analyze the vocabulary richness of this transcribed speech. Provide insights on:

1. Vocabulary diversity score (1-10 scale)
2. Word frequency patterns
3. Complexity of vocabulary used
4. Suggestions for improvement

Be concise and actionable. Respond in JSON format:
{
  "diversityScore": number,
  "averageWordLength": number,
  "uniqueWordRatio": number,
  "complexityLevel": "basic|intermediate|advanced",
  "suggestions": ["suggestion1", "suggestion2"],
  "topRepeatedWords": ["word1", "word2", "word3"]
}

Text to analyze: "${text.substring(0, 1000)}"`;

        return await this.callGPT(prompt, gptApiKey);
    }

    async analyzeSentenceComplexity(text, gptApiKey) {
        const prompt = `Analyze the sentence structure complexity of this transcribed speech. Provide insights on:

1. Average sentence length
2. Sentence structure variety
3. Use of complex grammar
4. Recommendations for clarity

Respond in JSON format:
{
  "averageSentenceLength": number,
  "complexityScore": number,
  "structureVariety": "low|medium|high",
  "grammarComplexity": "simple|moderate|complex",
  "suggestions": ["suggestion1", "suggestion2"],
  "exampleImprovements": [{"original": "text", "improved": "text"}]
}

Text to analyze: "${text.substring(0, 1000)}"`;

        return await this.callGPT(prompt, gptApiKey);
    }

    async analyzeRedundancy(text, gptApiKey) {
        const prompt = `Analyze redundancy and efficiency in this transcribed speech. Identify:

1. Repetitive phrases or concepts
2. Unnecessary filler content
3. Efficiency improvements
4. Conciseness recommendations

Respond in JSON format:
{
  "redundancyScore": number,
  "repetitivePatterns": ["pattern1", "pattern2"],
  "unnecessaryPhrases": ["phrase1", "phrase2"],
  "efficiencyScore": number,
  "suggestions": ["suggestion1", "suggestion2"],
  "condensedVersion": "brief rewrite focusing on core message"
}

Text to analyze: "${text.substring(0, 1000)}"`;

        return await this.callGPT(prompt, gptApiKey);
    }

    async callGPT(prompt, gptApiKey) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gptApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 800,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                throw new Error(`GPT API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content?.trim();
            
            try {
                return JSON.parse(content);
            } catch (parseError) {
                if (DEBUG) console.error('Failed to parse GPT response as JSON:', content);
                return { error: 'Invalid JSON response from GPT' };
            }
        } catch (error) {
            if (DEBUG) console.error('GPT analysis error:', error);
            return { error: error.message };
        }
    }

    async runFullAnalysis(sessions, gptApiKey) {
        const results = [];
        
        for (const session of sessions) {
            if (!session.sampleText || session.sampleText.length < 50) {
                continue; // Skip sessions with insufficient text
            }

            if (DEBUG) console.log(`Analyzing session ${session.sessionId}...`);
            
            const [vocabulary, complexity, redundancy] = await Promise.all([
                this.analyzeVocabularyRichness(session.sampleText, gptApiKey),
                this.analyzeSentenceComplexity(session.sampleText, gptApiKey),
                this.analyzeRedundancy(session.sampleText, gptApiKey)
            ]);

            const analysis = {
                sessionId: session.sessionId,
                timestamp: new Date().toISOString(),
                vocabulary,
                complexity,
                redundancy,
                textLength: session.sampleText.length
            };

            results.push(analysis);

            // Small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return results;
    }
}

// ===============================================
// METRICS DATABASE MANAGER (IndexedDB)
// ===============================================
class MetricsDBManager {
    constructor() {
        this.dbName = 'YapprMetrics';
        this.dbVersion = 2; // Increment version for schema update
        this.storeName = 'sessions';
        this.analysisStoreName = 'analyses';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                if (DEBUG) console.error('Failed to open metrics database:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                if (DEBUG) console.log('Metrics database initialized');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create sessions store
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { 
                        keyPath: 'sessionId' 
                    });
                    
                    // Create indexes for querying
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('service', 'service', { unique: false });
                    store.createIndex('date', 'date', { unique: false });
                    
                    if (DEBUG) console.log('Metrics database store created');
                }

                // Create analyses store (new in v2)
                if (!db.objectStoreNames.contains(this.analysisStoreName)) {
                    const analysisStore = db.createObjectStore(this.analysisStoreName, { 
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    
                    // Create indexes for querying analyses
                    analysisStore.createIndex('sessionId', 'sessionId', { unique: false });
                    analysisStore.createIndex('timestamp', 'timestamp', { unique: false });
                    analysisStore.createIndex('analysisType', 'analysisType', { unique: false });
                    
                    if (DEBUG) console.log('Analysis database store created');
                }
            };
        });
    }

    async storeSessionMetrics(metrics, transcriptionData) {
        if (!this.db) {
            if (DEBUG) console.log('Database not initialized, initializing now...');
            await this.init();
        }

        const sessionData = {
            ...metrics,
            // Add transcription context
            service: transcriptionData.service,
            date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            textLength: transcriptionData.text.length,
            hasCleanup: transcriptionData.cleanedText !== null,
            
            // Store MORE text for analysis (increased from 200 to 1000 chars)
            sampleText: transcriptionData.text.substring(0, 1000),
        };

        if (DEBUG) console.log('Storing session metrics to IndexedDB:', {
            sessionId: sessionData.sessionId,
            totalWords: sessionData.totalWords,
            duration: sessionData.sessionDuration,
            service: sessionData.service,
            textLength: sessionData.textLength,
            sampleTextLength: sessionData.sampleText.length
        });

        return new Promise((resolve, reject) => {
            try {
                const transaction = this.db.transaction([this.storeName], 'readwrite');
                const store = transaction.objectStore(this.storeName);
                
                const request = store.add(sessionData);
                
                request.onsuccess = () => {
                    if (DEBUG) console.log('✅ Session metrics stored successfully:', metrics.sessionId);
                    if (DEBUG) console.log('Database now contains session data for analytics');
                    resolve(sessionData);
                };
                
                request.onerror = () => {
                    if (DEBUG) console.error('❌ Failed to store session metrics:', request.error);
                    reject(request.error);
                };

                transaction.onerror = () => {
                    if (DEBUG) console.error('❌ Transaction error while storing metrics:', transaction.error);
                    reject(transaction.error);
                };

            } catch (error) {
                if (DEBUG) console.error('❌ Exception while storing session metrics:', error);
                reject(error);
            }
        });
    }

    async getSessionMetrics(sessionId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.get(sessionId);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAllSessions(limit = 100) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');
            
            const request = index.openCursor(null, 'prev'); // Most recent first
            const results = [];
            let count = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < limit) {
                    results.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getSessionsByDateRange(startDate, endDate) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('date');
            
            const range = IDBKeyRange.bound(startDate, endDate);
            const request = index.getAll(range);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async clearAllSessions() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const request = store.clear();
            
            request.onsuccess = () => {
                if (DEBUG) console.log('All session metrics cleared');
                resolve();
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async storeAnalysisResults(analysisResults) {
        if (!this.db) {
            await this.init();
        }

        const promises = analysisResults.map(result => {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.analysisStoreName], 'readwrite');
                const store = transaction.objectStore(this.analysisStoreName);
                
                const analysisData = {
                    sessionId: result.sessionId,
                    timestamp: result.timestamp,
                    analysisType: 'deep_analysis',
                    vocabulary: result.vocabulary,
                    complexity: result.complexity,
                    redundancy: result.redundancy,
                    textLength: result.textLength
                };
                
                const request = store.add(analysisData);
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            });
        });

        return Promise.all(promises);
    }

    async getAnalysisForSession(sessionId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.analysisStoreName], 'readonly');
            const store = transaction.objectStore(this.analysisStoreName);
            const index = store.index('sessionId');
            
            const request = index.getAll(sessionId);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async getAllAnalyses(limit = 100) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.analysisStoreName], 'readonly');
            const store = transaction.objectStore(this.analysisStoreName);
            const index = store.index('timestamp');
            
            const request = index.openCursor(null, 'prev'); // Most recent first
            const results = [];
            let count = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < limit) {
                    results.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// ===============================================
// API MANAGER
// ===============================================
class ApiManager {
    constructor() {
        this.currentService = SERVICES.ELEVENLABS; // Always ElevenLabs
        this.storageManager = new StorageManager();
    }

    async setCurrentService(serviceId) {
        // Only ElevenLabs is supported
        if (serviceId !== SERVICES.ELEVENLABS) {
            if (DEBUG) console.warn('Only ElevenLabs service is supported for STT');
            return;
        }
        this.currentService = SERVICES.ELEVENLABS;
    }

    async loadSelectedService() {
        // Always use ElevenLabs
        this.currentService = SERVICES.ELEVENLABS;
    }

    getCurrentServiceId() {
        return SERVICES.ELEVENLABS; // Always ElevenLabs
    }

    getAudioConstraints() {
        // Always return ElevenLabs constraints
        return CONFIG.AUDIO.ELEVENLABS_CONSTRAINTS;
    }

    getBestMimeType() {
        // ElevenLabs supports WebM with Opus
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            return 'audio/webm;codecs=opus';
        } else {
            return 'audio/webm';
        }
    }

    async transcribe(audioBlob) {
        // Only ElevenLabs is supported for STT
        return await this.transcribeWithElevenLabs(audioBlob);
    }


    async transcribeWithElevenLabs(audioBlob) {
        const apiKey = await this.storageManager.getApiKey(SERVICES.ELEVENLABS);
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error('ElevenLabs API key not configured');
        }
        
        // Validate API key format (ElevenLabs keys are typically 32+ chars)
        const trimmedKey = apiKey.trim();
        if (trimmedKey.length < 32) {
            if (DEBUG) console.error('Invalid API key format:', { 
                length: trimmedKey.length,
                minimumRequired: 32
            });
            throw new Error('Invalid ElevenLabs API key format. Key should be at least 32 characters. Please check your API key in settings.');
        }
        
        if (DEBUG) console.log('Starting ElevenLabs transcription...', {
            size: `${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`,
            type: audioBlob.type,
            keyLength: trimmedKey.length
        });
        
        // Check file size limit (1GB for ElevenLabs)
        if (audioBlob.size > 1024 * 1024 * 1024) {
            throw new Error('Audio file too large (max 1GB for ElevenLabs)');
        }
        
        let finalBlob = audioBlob;
        let filename = 'audio.webm';
        
        // ElevenLabs supports most formats, but let's use proper extensions
        if (audioBlob.type.includes('wav')) {
            filename = 'audio.wav';
        } else if (audioBlob.type.includes('mp3')) {
            filename = 'audio.mp3';
        } else if (audioBlob.type.includes('mp4')) {
            filename = 'audio.mp4';
        } else if (audioBlob.type.includes('m4a')) {
            filename = 'audio.m4a';
        } else if (audioBlob.type.includes('flac')) {
            filename = 'audio.flac';
        } else {
            // For webm or unknown formats, check if ElevenLabs supports it directly
            if (audioBlob.type.includes('webm') && audioBlob.size < 50 * 1024 * 1024) { // Under 50MB
                if (DEBUG) console.log('Using original WebM format (more efficient than conversion)');
                finalBlob = audioBlob;
                filename = 'audio.webm';
            } else {
                // Convert only if necessary or file is too large
                try {
                    if (DEBUG) console.log('Converting audio format for ElevenLabs...');
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
                        sampleRate: 16000  // Reduced from 22050 for smaller file size
                    });
                    
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    
                    // Convert to mono if stereo to reduce file size
                    const monoBuffer = audioBuffer.numberOfChannels > 1 ? 
                        convertToMono(audioBuffer) : audioBuffer;
                    
                    finalBlob = audioBufferToWav(monoBuffer);
                    filename = 'audio.wav';
                    
                    await audioContext.close();
                    
                    if (DEBUG) console.log(`Converted audio: ${(finalBlob.size / 1024 / 1024).toFixed(2)}MB`);
                } catch (conversionError) {
                    if (DEBUG) console.warn('Audio conversion failed, using original format:', conversionError);
                    finalBlob = audioBlob;
                    filename = 'audio.webm';
                }
            }
        }
        
        const formData = new FormData();
        formData.append('file', finalBlob, filename);
        formData.append('model_id', CONFIG.ELEVENLABS.MODEL_ID);
        
        // Add optional parameters for better results
        formData.append('diarize', 'true');  // Speaker diarization
        formData.append('tag_audio_events', 'true');  // Tag non-speech events
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.ELEVENLABS.TIMEOUT);
        
        try {
            const response = await fetch(CONFIG.ELEVENLABS.API_BASE, {
                method: 'POST',
                headers: { 
                    'xi-api-key': trimmedKey
                    // Don't set Content-Type, let browser set it with boundary for FormData
                },
                body: formData,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                let errorMessage = `ElevenLabs API error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail?.message || 
                                 errorData.message || 
                                 errorData.error?.message ||
                                 errorMessage;
                } catch (e) {
                    // Fallback to status text if JSON parsing fails
                    errorMessage = response.statusText || errorMessage;
                }
                
                // Enhance error message based on status code with confidence tracking
                const apiError = this.createConfidentApiError(response.status, errorMessage);
                if (apiError.isConfident) {
                    // These are definitely API/user issues, safe to show specific messages
                    throw new Error(apiError.message);
                } else {
                    throw new Error(errorMessage);
                }
            }
            
            const result = await response.json();
            
            // Check for different possible response formats
            if (result.text) {
                if (DEBUG) console.log('ElevenLabs transcription successful');
                // Reset API error count on successful transcription
                if (window.yapprContentScript) {
                    window.yapprContentScript.resetApiErrorCount();
                }
                return result.text;
            } else if (result.transcription) {
                if (DEBUG) console.log('ElevenLabs transcription successful');
                // Reset API error count on successful transcription
                if (window.yapprContentScript) {
                    window.yapprContentScript.resetApiErrorCount();
                }
                return result.transcription;
            } else if (typeof result === 'string') {
                if (DEBUG) console.log('ElevenLabs transcription successful');
                // Reset API error count on successful transcription
                if (window.yapprContentScript) {
                    window.yapprContentScript.resetApiErrorCount();
                }
                return result;
            } else {
                if (DEBUG) console.error('Unexpected ElevenLabs response format:', result);
                throw new Error('No transcription text found in response');
            }
            
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - try a shorter recording');
            }
            if (DEBUG) console.error('ElevenLabs transcription error:', error);
            throw error;
        }
    }

    /**
     * Create confident API error messages based on status codes
     * Only returns isConfident=true when we're 100% sure it's an API/user issue
     */
    createConfidentApiError(statusCode, originalMessage) {
        const highConfidenceErrors = {
            401: {
                message: 'ELEVENLABS_API_KEY_INVALID: Please check your ElevenLabs API key in settings',
                isConfident: true,
                category: 'auth',
                userAction: 'Check API key in settings'
            },
            402: {
                message: 'ELEVENLABS_CREDITS_EXHAUSTED: Your ElevenLabs credits have been exhausted. Please add credits to your account',
                isConfident: true,
                category: 'billing',
                userAction: 'Add credits to ElevenLabs account'
            },
            429: {
                message: 'ELEVENLABS_RATE_LIMIT: Too many requests. Please wait a moment and try again',
                isConfident: true,
                category: 'rate_limit',
                userAction: 'Wait and retry'
            },
            413: {
                message: 'ELEVENLABS_FILE_TOO_LARGE: Audio file is too large. Try a shorter recording',
                isConfident: true,
                category: 'file_size',
                userAction: 'Record shorter audio'
            }
        };

        const mediumConfidenceErrors = {
            403: {
                message: 'ELEVENLABS_FORBIDDEN: Access denied. Check your API key permissions',
                isConfident: false, // Could be API key or service issue
                category: 'access',
                userAction: 'Check API key permissions'
            },
            503: {
                message: 'ELEVENLABS_SERVICE_UNAVAILABLE: ElevenLabs service temporarily unavailable',
                isConfident: false, // Could be temporary, not user's fault
                category: 'service',
                userAction: 'Try again later'
            }
        };

        // Return high confidence errors
        if (highConfidenceErrors[statusCode]) {
            return highConfidenceErrors[statusCode];
        }

        // Return medium confidence errors
        if (mediumConfidenceErrors[statusCode]) {
            return mediumConfidenceErrors[statusCode];
        }

        // Default: low confidence, generic message
        return {
            message: originalMessage || `ElevenLabs API error: ${statusCode}`,
            isConfident: false,
            category: 'unknown',
            userAction: 'Check connection and try again'
        };
    }


    getServiceInfo() {
        // Only ElevenLabs is supported
        return {
            name: 'ElevenLabs STT',
            id: this.currentService
        };
    }
}

// ===============================================
// UI MANAGER
// ===============================================
class UIManager {
    constructor() {
        this.recordingIndicator = null;
        this.processingIndicator = null;
        this.ensureGlobalAnimations();
    }

    ensureGlobalAnimations() {
        if (!document.getElementById('global-animations')) {
            const style = document.createElement('style');
            style.id = 'global-animations';
            style.innerHTML = `
                @keyframes whisper-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                
                @keyframes whisper-slide-in {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                
                @keyframes whisper-slide-out {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    showRecordingIndicator() {
        if (this.recordingIndicator) return;

        this.recordingIndicator = document.createElement('div');
        this.recordingIndicator.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: #ef4444; color: white; padding: 10px 15px; border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px; font-weight: 500; z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); animation: whisper-pulse 2s infinite;
        `;
        this.recordingIndicator.innerHTML = '🎤 Recording... (ESC to cancel)';
        
        document.body.appendChild(this.recordingIndicator);
    }

    hideRecordingIndicator() {
        if (this.recordingIndicator) {
            this.recordingIndicator.remove();
            this.recordingIndicator = null;
        }
    }

    showProcessingIndicator(serviceName) {
        if (this.processingIndicator) return;

        this.processingIndicator = document.createElement('div');
        this.processingIndicator.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 12px 16px; border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px; font-weight: 500; z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); 
            display: flex; align-items: center; gap: 10px;
        `;
        
        this.processingIndicator.innerHTML = `
            <div style="
                width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3);
                border-top: 2px solid white; border-radius: 50%;
                animation: whisper-spin 1s linear infinite;
            "></div>
            <span>Processing with ${serviceName}...</span>
        `;
        
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes whisper-spin { 
                0% { transform: rotate(0deg); } 
                100% { transform: rotate(360deg); } 
            }
        `;
        
        this.processingIndicator.appendChild(style);
        document.body.appendChild(this.processingIndicator);
    }

    hideProcessingIndicator() {
        if (this.processingIndicator) {
            this.processingIndicator.remove();
            this.processingIndicator = null;
        }
    }

    showNotification(message, type = 'info') {
        showToast(message, type);
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showWarning(message) {
        this.showNotification(message, 'warning');
    }

    showInfo(message) {
        this.showNotification(message, 'info');
    }

    cleanup() {
        this.hideRecordingIndicator();
        this.hideProcessingIndicator();
    }
}

// ===============================================
// AUDIO RECORDER
// ===============================================
class AudioRecorder {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recordingStartTime = null;
        this.recordingCancelled = false;
        this.stream = null;
        
        this.onRecordingStart = null;
        this.onRecordingStop = null;
        this.onRecordingCancel = null;
    }

    async startRecording() {
        if (this.isRecording) return false;

        try {
            this.recordingCancelled = false;
            
            const constraints = apiManager.getAudioConstraints();
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const mimeType = apiManager.getBestMimeType();
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
            this.audioChunks = [];
            this.recordingStartTime = Date.now();
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
                this.isRecording = false;
                
                if (!this.recordingCancelled && this.audioChunks.length > 0) {
                    const audioBlob = new Blob(this.audioChunks, { 
                        type: this.audioChunks[0]?.type || 'audio/webm' 
                    });
                    const duration = (Date.now() - this.recordingStartTime) / 1000;
                    
                    if (this.onRecordingStop) {
                        this.onRecordingStop(audioBlob, duration);
                    }
                } else if (this.onRecordingCancel) {
                    this.onRecordingCancel();
                }
            };
            
            this.mediaRecorder.start(CONFIG.AUDIO.CHUNK_SIZE);
            this.isRecording = true;
            
            if (this.onRecordingStart) {
                this.onRecordingStart();
            }
            
            return true;
        } catch (error) {
            if (DEBUG) console.error('Error starting recording:', error);
            this.cleanup();
            throw error;
        }
    }

    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) return false;

        try {
            this.mediaRecorder.stop();
            return true;
        } catch (error) {
            if (DEBUG) console.error('Error stopping recording:', error);
            this.cleanup();
            return false;
        }
    }

    async cancelRecording() {
        if (!this.isRecording) return false;

        this.recordingCancelled = true;
        return await this.stopRecording();
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
            return false;
        } else {
            await this.startRecording();
            return this.isRecording;
        }
    }

    getRecordingState() {
        return this.isRecording;
    }

    setOnRecordingStart(callback) {
        this.onRecordingStart = callback;
    }

    setOnRecordingStop(callback) {
        this.onRecordingStop = callback;
    }

    setOnRecordingCancel(callback) {
        this.onRecordingCancel = callback;
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.mediaRecorder = null;
        this.isRecording = false;
    }

    static isSupported() {
        return !!(navigator.mediaDevices && 
                 navigator.mediaDevices.getUserMedia && 
                 window.MediaRecorder);
    }
}

// ===============================================
// MAIN CONTENT SCRIPT CLASS
// ===============================================
class YapprContentScript {
    constructor() {
        if (DEBUG) console.log('🏗️ YapprContentScript constructor starting...');
        this.activeElement = null;
        this.isInitialized = false;
        this.apiErrorCount = {}; // Track consecutive API errors
        
        try {
            if (DEBUG) console.log('📦 Creating StorageManager...');
            this.storageManager = new StorageManager();
            
            if (DEBUG) console.log('🎤 Creating AudioRecorder...');
            this.audioRecorder = new AudioRecorder();
            
            if (DEBUG) console.log('🎨 Creating UIManager...');
            this.uiManager = new UIManager();
            
            if (DEBUG) console.log('🗄️ Creating MetricsDBManager...');
            this.metricsDB = new MetricsDBManager();
            
            if (DEBUG) console.log('🧠 Creating DeepAnalysisEngine...');
            this.analysisEngine = new DeepAnalysisEngine();
            
            if (DEBUG) console.log('🔧 Creating PresetManager...');
            this.presetManager = new PresetManager();
            
            if (DEBUG) console.log('🎨 Creating EnhancementService...');
            this.enhancementService = new EnhancementService(this.presetManager);
            
            if (DEBUG) console.log('✅ All components created, calling init...');
            this.init();
        } catch (error) {
            if (DEBUG) console.error('💥 Error in YapprContentScript constructor:', error);
            throw error;
        }
    }
    
    async init() {
        if (this.isInitialized) return;
        
        try {
            if (DEBUG) console.log('🔧 Initializing content script components...');
            
            await this.storageManager.initialize();
            if (DEBUG) console.log('✅ Storage manager initialized');
            
            // PresetManager is already initialized in its constructor
            if (DEBUG) console.log('✅ PresetManager initialized');
            
            // Initialize metrics database
            await this.metricsDB.init();
            if (DEBUG) console.log('✅ Metrics database initialized');
            
            await apiManager.loadSelectedService();
            if (DEBUG) console.log('✅ API manager loaded service');
            
            this.setupAudioRecorderCallbacks();
            if (DEBUG) console.log('✅ Audio recorder callbacks setup');
            
            this.setupMessageListener();
            if (DEBUG) console.log('✅ Message listener setup');
            
            this.setupKeyboardShortcuts();
            if (DEBUG) console.log('✅ Keyboard shortcuts setup');
            
            this.isInitialized = true;
            if (DEBUG) console.log('🎉 Yappr content script fully initialized');
            
        } catch (error) {
            if (DEBUG) console.error('Failed to initialize Yappr:', error);
            this.uiManager.showError('Failed to initialize extension');
        }
    }
    
    setupAudioRecorderCallbacks() {
        this.audioRecorder.setOnRecordingStart(() => {
            this.uiManager.showRecordingIndicator();
            this.notifyRecordingStateChange(true);
        });
        
        this.audioRecorder.setOnRecordingStop((audioBlob, duration) => {
            this.uiManager.hideRecordingIndicator();
            this.processRecording(audioBlob, duration);
            this.notifyRecordingStateChange(false);
        });
        
        this.audioRecorder.setOnRecordingCancel(() => {
            this.uiManager.hideRecordingIndicator();
            this.uiManager.showWarning('Recording cancelled');
            this.notifyRecordingStateChange(false);
        });
    }
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (DEBUG) console.log('📥 Content script received message:', message);
            switch (message.type) {
                case MESSAGE_TYPES.TOGGLE_RECORDING:
                    if (DEBUG) console.log('🎤 Processing toggle recording message');
                    this.handleToggleRecording();
                    sendResponse({ success: true });
                    break;
                    
                case MESSAGE_TYPES.GET_RECORDING_STATE:
                    sendResponse({ 
                        isRecording: this.audioRecorder.getRecordingState() 
                    });
                    break;
                    
                case MESSAGE_TYPES.SERVICE_CHANGED:
                    this.handleServiceChange(message.service);
                    break;
                    
                case 'PRESET_CHANGED':
                    if (DEBUG) console.log('🎨 Preset changed to:', message.presetId);
                    if (this.presetManager) {
                        this.presetManager.selectPreset(message.presetId);
                    }
                    sendResponse({ success: true });
                    break;
                    
                case 'runDeepAnalysis':
                    this.handleRunAnalysis(message.manual).then(result => {
                        sendResponse(result);
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    return true; // Keep message channel open for async response
            }
            return true;
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.handleToggleRecording();
            }
            
            if (e.key === 'Escape' && this.audioRecorder.getRecordingState()) {
                e.preventDefault();
                this.handleCancelRecording();
            }
        });
    }
    
    async handleToggleRecording() {
        if (DEBUG) console.log('🎤 handleToggleRecording called');
        if (DEBUG) console.log('Current recording state:', this.audioRecorder.getRecordingState());
        if (DEBUG) console.log('Current service:', this.currentService);
        
        try {
            // Check API key before starting recording
            if (!this.audioRecorder.getRecordingState()) {
                const apiKey = await this.storageManager.getApiKey(SERVICES.ELEVENLABS);
                if (!apiKey) {
                    this.uiManager.showError('ElevenLabs API key required. Please configure in settings.');
                    return;
                }
                
                this.activeElement = document.activeElement;
                this.textAlreadyInserted = false; // Reset flag for new recording
                if (DEBUG) console.log('Starting recording...');
            } else {
                if (DEBUG) console.log('Stopping recording...');
            }
            
            await this.audioRecorder.toggleRecording();
            if (DEBUG) console.log('Recording toggled successfully');
            
        } catch (error) {
            if (DEBUG) console.error('Error toggling recording:', error);
            
            // Enhanced error messages based on error type
            if (error.name === 'NotAllowedError') {
                this.uiManager.showError('Microphone access denied. Please allow microphone permissions and try again.');
            } else if (error.name === 'NotFoundError') {
                this.uiManager.showError('No microphone found. Please connect a microphone and try again.');
            } else if (error.name === 'NotSupportedError') {
                this.uiManager.showError('Audio recording not supported in this browser.');
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                this.uiManager.showError('Network error. Please check your internet connection and try again.');
            } else if (error.message.includes('API key')) {
                this.uiManager.showError('API key issue. Please check your ElevenLabs API key in settings.');
            } else {
                this.uiManager.showError(`Recording error: ${error.message}`);
            }
        }
    }
    
    async handleCancelRecording() {
        try {
            await this.audioRecorder.cancelRecording();
        } catch (error) {
            if (DEBUG) console.error('Error cancelling recording:', error);
        }
    }
    
    async handleServiceChange(service) {
        try {
            await apiManager.setCurrentService(service);
            if (DEBUG) console.log('Service changed to:', service);
        } catch (error) {
            if (DEBUG) console.error('Error changing service:', error);
            this.uiManager.showError('Failed to change service');
        }
    }

    async handleRunAnalysis(isManual = false) {
        try {
            if (DEBUG) console.log('Running deep analysis...');
            
            // Check if analysis is enabled
            const isEnabled = await this.analysisEngine.isAnalysisEnabled();
            if (!isEnabled) {
                throw new Error('Deep analysis is not enabled');
            }

            // Get GPT API key
            const gptApiKey = await this.storageManager.get('gptApiKey');
            const apiKey = gptApiKey['gptApiKey'];
            if (!apiKey) {
                throw new Error('GPT API key is required for analysis');
            }

            // Get recent sessions to analyze
            const recentSessions = await this.metricsDB.getAllSessions(20); // Last 20 sessions
            
            if (recentSessions.length === 0) {
                return { success: true, sessionsAnalyzed: 0, message: 'No sessions to analyze' };
            }

            // Filter sessions that haven't been analyzed yet
            const unanalyzedSessions = [];
            for (const session of recentSessions) {
                const existingAnalysis = await this.metricsDB.getAnalysisForSession(session.sessionId);
                if (existingAnalysis.length === 0) {
                    unanalyzedSessions.push(session);
                }
            }

            if (unanalyzedSessions.length === 0) {
                return { success: true, sessionsAnalyzed: 0, message: 'All recent sessions already analyzed' };
            }

            if (DEBUG) console.log(`Analyzing ${unanalyzedSessions.length} unanalyzed sessions...`);

            // Run analysis
            const analysisResults = await this.analysisEngine.runFullAnalysis(unanalyzedSessions, apiKey);

            // Store results
            if (analysisResults.length > 0) {
                await this.metricsDB.storeAnalysisResults(analysisResults);
                if (DEBUG) console.log(`Stored analysis results for ${analysisResults.length} sessions`);
            }

            return { 
                success: true, 
                sessionsAnalyzed: analysisResults.length,
                message: `Analysis complete for ${analysisResults.length} sessions`
            };

        } catch (error) {
            if (DEBUG) console.error('Error running analysis:', error);
            throw error;
        }
    }
    
    async processRecording(audioBlob, duration) {
        try {
            const serviceInfo = apiManager.getServiceInfo();
            this.uiManager.showProcessingIndicator(serviceInfo.name);
            
            const startTime = Date.now();
            const rawTranscription = await apiManager.transcribe(audioBlob);
            const processingTime = (Date.now() - startTime) / 1000;
            
            this.uiManager.hideProcessingIndicator();
            
            if (rawTranscription && rawTranscription.trim()) {
                await this.handleSuccessfulTranscription(
                    rawTranscription, 
                    duration, 
                    processingTime
                );
            } else {
                this.uiManager.showWarning('No speech detected');
            }
            
        } catch (error) {
            if (DEBUG) console.error('Transcription error:', error);
            this.uiManager.hideProcessingIndicator();
            
            // Enhanced error messages with intelligent detection
            if (error.message.includes('Request timeout')) {
                this.uiManager.showError('Transcription timed out. Try a shorter recording or check your connection.');
            } else if (error.message.startsWith('ELEVENLABS_')) {
                // These are confident API errors with specific prefixes
                const userMessage = error.message.split(': ')[1] || error.message;
                this.uiManager.showError(userMessage);
                
                // Also show popup notifications for critical issues
                if (error.message.includes('API_KEY_INVALID') || error.message.includes('CREDITS_EXHAUSTED')) {
                    this.showPopupNotification(error.message);
                }
            } else if (error.message.includes('network') || error.message.includes('fetch') || error.name === 'TypeError') {
                this.uiManager.showError('Network error. Please check your internet connection and try again.');
            } else if (error.message.includes('No transcription text found')) {
                this.uiManager.showError('No speech detected in recording. Please try speaking more clearly.');
            } else {
                this.uiManager.showError(`Transcription failed: ${error.message}`);
            }
        }
    }
    
    async handleSuccessfulTranscription(rawTranscription, duration, processingTime) {
        // Get cleanup settings
        const isCleanupEnabled = await this.storageManager.isCleanupEnabled();
        const cleanupPrompt = await this.storageManager.getCleanupPrompt();
        const gptApiKey = await this.storageManager.getGptApiKey();
        
        // Clean up transcription if enabled and settings are available
        let cleanedTranscription = rawTranscription;
        if (isCleanupEnabled && cleanupPrompt && gptApiKey) {
            try {
                if (DEBUG) console.log('Cleaning up transcription with GPT-4o-mini...');
                cleanedTranscription = await cleanupTranscription(rawTranscription, cleanupPrompt, gptApiKey);
            } catch (error) {
                if (DEBUG) console.error('Cleanup failed, using original:', error);
                // Use original transcription if cleanup fails
            }
        }
        
        const formattedTranscription = formatTextIntoParagraphs(cleanedTranscription);
        
        // Check for URL enhancement preset
        await this.handleURLEnhancement(formattedTranscription, cleanedTranscription, rawTranscription);
        
        // Check for folder assignment based on activation phrase
        if (DEBUG) console.log('🗂️ Checking for folder assignment...');
        if (DEBUG) console.log('📝 Formatted transcription (first 100 chars):', formattedTranscription.substring(0, 100));
        
        const matchingFolder = await this.storageManager.findFolderByActivationPhrase(formattedTranscription);
        
        // Prepare content for saving - remove activation phrase if folder matched
        let contentForSaving = formattedTranscription;
        if (matchingFolder) {
            if (DEBUG) console.log('✅ Found matching folder:', matchingFolder.name, 'with activation phrase:', matchingFolder.activationPhrase);
            // Extract clean content without activation phrase for saving
            contentForSaving = extractCleanContent(formattedTranscription, matchingFolder.activationPhrase);
        } else {
            if (DEBUG) console.log('ℹ️ No matching folder found for transcription');
        }
        
        const transcriptionData = {
            id: generateUUID(),
            text: contentForSaving, // Save cleaned content without activation phrase
            rawText: rawTranscription,
            originalText: formattedTranscription, // Keep full text including activation phrase
            cleanedText: cleanedTranscription !== rawTranscription ? cleanedTranscription : null,
            timestamp: new Date().toISOString(),
            duration: duration,
            wordCount: countWords(contentForSaving),
            service: apiManager.getCurrentServiceId(),
            folderId: matchingFolder ? matchingFolder.id : null,
            folderName: matchingFolder ? matchingFolder.name : null
        };
        
        if (DEBUG) console.log('💾 Transcription data prepared:', { 
            id: transcriptionData.id, 
            wordCount: transcriptionData.wordCount, 
            folderId: transcriptionData.folderId,
            folderName: transcriptionData.folderName,
            hasActivationPhrase: contentForSaving !== formattedTranscription
        });
        
        try {
            await this.saveTranscriptionData(transcriptionData);
            if (DEBUG) console.log('✅ Transcription data saved successfully');
        } catch (saveError) {
            if (DEBUG) console.error('❌ Failed to save transcription data:', saveError);
            this.uiManager.showError('Failed to save transcription to history');
        }
        
        // Compute and store detailed session metrics
        try {
            if (DEBUG) console.log('Computing session metrics for transcription...');
            const sessionMetrics = computeSessionMetrics(rawTranscription, cleanedTranscription, duration);
            
            if (sessionMetrics) {
                if (DEBUG) console.log('Session metrics computed successfully:', {
                    sessionId: sessionMetrics.sessionId,
                    words: sessionMetrics.totalWords,
                    wpm: sessionMetrics.wordsPerMinute,
                    fillers: sessionMetrics.fillerWords,
                    unique: sessionMetrics.uniqueWords,
                    duration: sessionMetrics.sessionDuration
                });

                if (DEBUG) console.log('Storing session metrics to database...');
                await this.metricsDB.storeSessionMetrics(sessionMetrics, transcriptionData);
                
                // ALSO store in chrome.storage for cross-context access
                if (DEBUG) console.log('📦 Also storing session in chrome.storage for analytics...');
                await this.storeSessionInChromeStorage(sessionMetrics, transcriptionData);
                
                if (DEBUG) console.log('✅ Session metrics stored successfully - data should now appear in analytics');
            } else {
                if (DEBUG) console.warn('⚠️ Session metrics computation returned null');
            }
        } catch (error) {
            if (DEBUG) console.error('❌ Failed to store session metrics:', error);
            // Don't fail the transcription if metrics storage fails
        }
        
        this.notifyTranscriptionComplete(transcriptionData);
        
        const cleanupUsed = cleanedTranscription !== rawTranscription;
        this.uiManager.showSuccess(
            `Transcription complete! (${processingTime.toFixed(1)}s)${cleanupUsed ? ' ✨ Cleaned' : ''}`
        );
    }
    
    async handleURLEnhancement(formattedTranscription, cleanedTranscription, rawTranscription) {
        // Reset text insertion flag for new transcription
        this.textAlreadyInserted = false;
        
        // Prevent double insertion within same session
        if (this.textAlreadyInserted) {
            if (DEBUG) console.log('⚠️ Text already inserted, skipping');
            return;
        }

        try {
            // Check if a preset is selected
            const preset = await this.presetManager.getSelectedPreset();
            if (DEBUG) console.log('🔧 Preset enhancement check:', preset?.name || 'None');
            
            if (!preset) {
                if (DEBUG) console.warn('⚠️ No preset selected - Enhancement will be skipped!');
                console.warn('🎨 YAPPR: Enhancement skipped - no preset selected');
                this.uiManager.showInfo('No enhancement preset selected');
                this.insertTextAtActiveElement(formattedTranscription);
                return;
            }
            
            if (DEBUG) console.log('✅ Preset selected, proceeding with enhancement:', preset.name);
            
            if (DEBUG) console.log('🎯 Using preset:', preset.name);
            
            // Check if API key exists before attempting enhancement
            const apiKey = await this.enhancementService.getOpenAIKey();
            if (!apiKey) {
                if (DEBUG) console.warn('⚠️ No OpenAI API key found - Enhancement will be skipped!');
                console.warn('🔑 YAPPR: Enhancement skipped - no OpenAI API key configured');
                this.uiManager.showWarning('Enhancement skipped - no OpenAI API key');
                this.insertTextAtActiveElement(formattedTranscription);
                return;
            }
            
            this.uiManager.showInfo(`Enhancing with ${preset.name}...`);
            
            // Use EnhancementService to enhance the transcript
            const enhancementResult = await this.enhancementService.enhanceTranscript(formattedTranscription, preset.id);
            
            if (!enhancementResult.success) {
                if (DEBUG) console.error('❌ Enhancement failed:', enhancementResult.reason);
                console.error('💥 YAPPR: Enhancement failed -', enhancementResult.reason);
                this.uiManager.showError(`Enhancement failed: ${enhancementResult.reason}`);
                this.insertTextAtActiveElement(formattedTranscription);
                return;
            }
            
            if (DEBUG) console.log('✅ Enhancement successful!');
            if (DEBUG) console.log('📝 Original:', formattedTranscription.substring(0, 100) + '...');
            if (DEBUG) console.log('✨ Enhanced:', enhancementResult.result.substring(0, 100) + '...');
            
            // Show the toggle UI with original and enhanced text
            if (window.enhancementToggle) {
                const toggleElement = window.enhancementToggle.show(enhancementResult.result, formattedTranscription, {
                    preset: preset,
                    enhanced: true
                });
                
                // Set up toggle callback for text insertion
                window.enhancementToggle.onToggle = (selectedText, mode) => {
                    if (DEBUG) console.log('🎛️ Toggle callback triggered:', mode, selectedText?.substring(0, 50) + '...');
                    
                    // Clear any existing content first to prevent duplication
                    const element = this.activeElement || document.activeElement;
                    if (element && this.isElementSuitableForInsertion(element)) {
                        // Clear existing content
                        if (element.isContentEditable) {
                            element.textContent = '';
                        } else if (element.value !== undefined) {
                            element.value = '';
                        }
                    }
                    
                    // Insert the selected text
                    this.insertTextAtActiveElement(selectedText);
                    
                    // Auto-hide toggle after text insertion
                    setTimeout(() => {
                        if (window.enhancementToggle && window.enhancementToggle.isVisible) {
                            if (DEBUG) console.log('🎛️ Auto-hiding toggle after manual text insertion');
                            window.enhancementToggle.hide();
                        }
                    }, 2000); // Hide after 2 seconds
                };
                
                // Store enhanced text and show success
                this.currentEnhancedText = enhancementResult.result;
                this.uiManager.showSuccess(`Enhanced with ${preset.name}`);
                
                // Insert enhanced text by default (with small delay to allow user to focus field)
                setTimeout(() => {
                    this.insertTextAtActiveElement(enhancementResult.result);
                    
                    // Start auto-hide timer after successful insertion
                    setTimeout(() => {
                        if (window.enhancementToggle && window.enhancementToggle.isVisible) {
                            if (DEBUG) console.log('🎛️ Auto-hiding toggle after text insertion');
                            window.enhancementToggle.hide();
                        }
                    }, 2000);
                }, 500);
            } else {
                // No toggle UI available, insert enhanced text directly
                this.insertTextAtActiveElement(enhancementResult.result);
            }
            
        } catch (error) {
            if (DEBUG) console.error('❌ URL enhancement handling failed:', error);
            // Always fall back to normal insertion
            this.insertTextAtActiveElement(formattedTranscription);
        }
    }
    
    isElementSuitableForInsertion(element) {
        if (!element) return false;
        
        return (element.isContentEditable || 
                element.tagName === 'INPUT' || 
                element.tagName === 'TEXTAREA' ||
                element.getAttribute('data-testid') === 'tweetTextarea_0');
    }
    
    insertTextAtActiveElement(text) {
        let element = this.activeElement || document.activeElement;
        
        // For X.com, try to find the tweet compose box if no active element
        if (!element || !this.isElementSuitableForInsertion(element)) {
            if (window.location.hostname === 'x.com' || window.location.hostname === 'twitter.com') {
                const tweetBox = document.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetText"], .DraftEditor-editorContainer [data-contents="true"]');
                if (tweetBox) {
                    element = tweetBox;
                    if (DEBUG) console.log('🐦 Found X.com tweet box:', element);
                }
            }
        }
        
        if (DEBUG) console.log('🎯 insertTextAtActiveElement called');
        if (DEBUG) console.log('📋 Active element:', element ? {
            tagName: element.tagName,
            isContentEditable: element.isContentEditable,
            type: element.type,
            id: element.id,
            className: element.className,
            testId: element.getAttribute('data-testid')
        } : 'No active element');
        
        // Set flag to prevent double insertion
        this.textAlreadyInserted = true;
        
        // Apply cleanup with toggle support
        let processedText = text;
        
        // Check cleanup setting asynchronously but proceed immediately with default
        chrome.storage.sync.get(['cleanupEnabled']).then(result => {
            const isEnabled = result.cleanupEnabled !== false; // Default true
            if (DEBUG) console.log('🧹 Cleanup setting loaded:', isEnabled ? 'ENABLED' : 'DISABLED');
        }).catch(() => {
            if (DEBUG) console.log('🧹 Cleanup setting unavailable, using default: ENABLED');
        });
        
        // Check if text looks like it's already been enhanced (has proper email format)
        const looksEnhanced = text.includes('\n\n') || /^Hey,\s*\n/.test(text) || /\n\s*(?:Thanks,|Cheers,)\s*$/.test(text);
        
        if (looksEnhanced) {
            if (DEBUG) console.log('🎨 Text appears enhanced, skipping cleanup to preserve formatting');
            processedText = text;
        } else {
            // For now, always apply cleanup by default for stability
            // Users can disable in popup if needed
            try {
                if (DEBUG) console.log('🧹 Applying cleanup...');
                processedText = cleanTranscription(text);
            } catch (error) {
                if (DEBUG) console.error('❌ Cleanup failed, using original text:', error);
                processedText = text;
            }
        }
        
        // Use the cleaned text for both insertion and clipboard
        this.performTextInsertion(element, processedText);
    }
    
    performTextInsertion(element, text) {
        if (element && this.isElementSuitableForInsertion(element)) {
            if (DEBUG) console.log('✅ Element is suitable for text insertion');
            
            // Use the text parameter which should be the cleaned text
            let finalText = text;
            if (window.location.hostname === 'x.com' || window.location.hostname === 'twitter.com') {
                // Apply X.com specific formatting to cleaned text
                finalText = text
                    .replace(/\.\s+/g, '. ')  // Normalize spaces after periods
                    .replace(/\!\s+/g, '! ')  // Normalize spaces after exclamation marks
                    .replace(/\?\s+/g, '? ')  // Normalize spaces after question marks
                    .replace(/\s+/g, ' ')     // Remove extra spaces
                    .trim();
                if (DEBUG) console.log('🐦 Applied X.com text formatting to cleaned text');
            }
            
            if (DEBUG) console.log('📝 Inserting final text:', finalText.substring(0, 100) + '...');
            insertTextAtCursor(element, finalText);
        } else {
            if (DEBUG) console.log('⚠️ Element not suitable for insertion');
            
            // Try clipboard as fallback with cleaned text
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    if (DEBUG) console.log('📋 Cleaned text copied to clipboard successfully');
                    this.uiManager.showInfo('Cleaned text copied to clipboard - click in a text field to paste');
                }).catch(error => {
                    if (DEBUG) console.error('❌ Failed to copy to clipboard:', error);
                    this.uiManager.showWarning('Click in a text field first, then record again for direct insertion.');
                });
            } else {
                this.uiManager.showInfo('Click in a text field first, then record again for direct insertion.');
            }
        }
    }
    
    async saveTranscriptionData(transcriptionData) {
        try {
            if (DEBUG) console.log('💾 Saving transcription data...');
            if (DEBUG) console.log('📄 Data to save:', {
                id: transcriptionData.id,
                textLength: transcriptionData.text.length,
                wordCount: transcriptionData.wordCount,
                folderId: transcriptionData.folderId,
                folderName: transcriptionData.folderName,
                service: transcriptionData.service
            });
            
            const addResult = await this.storageManager.addTranscription(transcriptionData);
            if (DEBUG) console.log('✅ addTranscription result:', addResult);
            
            const updateResult = await this.storageManager.updateStats(transcriptionData);
            if (DEBUG) console.log('📊 updateStats result:', updateResult);
            
            // Verify it was saved
            const history = await this.storageManager.getHistory();
            if (DEBUG) console.log('📋 Current history length:', history.length);
            if (DEBUG) console.log('📝 Latest history item:', history[0] ? {
                id: history[0].id,
                textPreview: history[0].text.substring(0, 50) + '...',
                folderId: history[0].folderId,
                folderName: history[0].folderName,
                timestamp: history[0].timestamp
            } : 'No items');
            
            if (DEBUG) console.log('✅ Transcription data saved successfully');
            
            // Send message to popup about new transcription
            try {
                chrome.runtime.sendMessage({
                    type: 'TRANSCRIPTION_COMPLETE',
                    data: transcriptionData
                });
                if (DEBUG) console.log('📨 Sent transcription complete message to popup');
            } catch (msgError) {
                if (DEBUG) console.warn('⚠️ Could not send message to popup:', msgError);
            }
            
        } catch (error) {
            if (DEBUG) console.error('❌ Error saving transcription data:', error);
            this.uiManager.showWarning('Failed to save transcription');
        }
    }
    
    async storeSessionInChromeStorage(sessionMetrics, transcriptionData) {
        try {
            // Get existing sessions from storage
            const result = await chrome.storage.local.get(['yapprSessions']);
            const sessions = result.yapprSessions || [];
            
            // Create session data for analytics
            const sessionData = {
                ...sessionMetrics,
                service: transcriptionData.service,
                date: new Date().toISOString().split('T')[0],
                timestamp: new Date().toISOString(),
                textLength: transcriptionData.text.length,
                sampleText: transcriptionData.text.substring(0, 1000),
                hasCleanup: transcriptionData.cleanedText !== null
            };
            
            // Add to beginning of array (most recent first)
            sessions.unshift(sessionData);
            
            // Keep only last 100 sessions to avoid storage bloat
            if (sessions.length > 100) {
                sessions.splice(100);
            }
            
            // Store back to chrome.storage
            await chrome.storage.local.set({ yapprSessions: sessions });
            if (DEBUG) console.log('✅ Session stored in chrome.storage for analytics access');
            
        } catch (error) {
            if (DEBUG) console.error('❌ Failed to store session in chrome.storage:', error);
        }
    }

    notifyRecordingStateChange(isRecording) {
        try {
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.RECORDING_STATE_CHANGED,
                isRecording: isRecording
            });
        } catch (error) {
            if (DEBUG) console.error('Error sending recording state message:', error);
        }
    }
    
    notifyTranscriptionComplete(transcriptionData) {
        try {
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.TRANSCRIPTION_COMPLETE,
                data: transcriptionData
            });
        } catch (error) {
            if (DEBUG) console.error('Error sending transcription complete message:', error);
        }
    }

    /**
     * Show popup notification for critical API issues
     */
    showPopupNotification(errorMessage) {
        try {
            // Track consecutive errors for confidence
            const errorType = errorMessage.split('_')[1] || 'UNKNOWN';
            this.apiErrorCount[errorType] = (this.apiErrorCount[errorType] || 0) + 1;
            
            // Only show notification after multiple consecutive errors of same type
            // This prevents false positives from temporary network issues
            const shouldNotify = this.apiErrorCount[errorType] >= 2 || 
                               errorMessage.includes('API_KEY_INVALID') || 
                               errorMessage.includes('CREDITS_EXHAUSTED');
            
            if (shouldNotify) {
                if (DEBUG) console.log(`🚨 Sending API error notification (${this.apiErrorCount[errorType]} consecutive):`, errorMessage);
                
                chrome.runtime.sendMessage({
                    type: 'API_ERROR_NOTIFICATION',
                    error: errorMessage,
                    consecutiveCount: this.apiErrorCount[errorType],
                    timestamp: Date.now()
                });
            } else {
                if (DEBUG) console.log(`🔍 API error tracked but not notifying yet (${this.apiErrorCount[errorType]}/2):`, errorMessage);
            }
        } catch (error) {
            if (DEBUG) console.warn('Could not send API error notification to popup:', error);
        }
    }

    /**
     * Reset API error count when transcription succeeds
     */
    resetApiErrorCount() {
        if (Object.keys(this.apiErrorCount).length > 0) {
            if (DEBUG) console.log('✅ Resetting API error count after successful transcription');
            this.apiErrorCount = {};
        }
    }
    
    cleanup() {
        if (this.audioRecorder.getRecordingState()) {
            this.audioRecorder.cancelRecording();
        }
        
        this.uiManager.cleanup();
        if (DEBUG) console.log('Yappr content script cleaned up');
    }
}

// ===============================================
// INITIALIZE
// ===============================================
const apiManager = new ApiManager();

// Add global error handler - only for extension errors
window.addEventListener('error', (event) => {
    // Only log errors that originate from our extension files
    if (event.filename && event.filename.includes('chrome-extension://')) {
        if (DEBUG && event.error) {
            console.error('💥 Extension error in content script:', event.error);
        }
    }
    // Ignore website errors - they're not our responsibility
});

if (DEBUG) console.log('🔧 Yappr content script loading...');
if (DEBUG) console.log('🌐 Current URL:', window.location.href);
if (DEBUG) console.log('📄 Document ready state:', document.readyState);

// Test if basic Chrome extension APIs are available
if (DEBUG) console.log('🔌 Chrome runtime available:', !!chrome.runtime);
if (DEBUG) console.log('🔌 Chrome storage available:', !!chrome.storage);
if (DEBUG) console.log('🔌 Chrome tabs available:', !!chrome.tabs);


// Prevent multiple initializations by checking both window variable and loading flag
if (typeof window.yapprContentScript === 'undefined' && !window.yapprContentScriptLoaded) {
    window.yapprContentScriptLoaded = true;  // Set flag immediately to prevent race conditions
    
    if (DEBUG) console.log('🔍 Checking audio support...');
    if (AudioRecorder.isSupported()) {
        if (DEBUG) console.log('✅ Audio recording supported, initializing Yappr...');
        try {
            window.yapprContentScript = new YapprContentScript();
        } catch (error) {
            if (DEBUG) console.error('💥 Failed to initialize YapprContentScript:', error);
            window.yapprContentScriptLoaded = false;  // Reset flag on failure
        }
        
        window.addEventListener('beforeunload', () => {
            if (window.yapprContentScript) {
                window.yapprContentScript.cleanup();
            }
        });
        
        if (DEBUG) console.log('🎯 Yappr content script initialized successfully');
        
        // Make testing available globally for development
        window.testPresetManager = PresetManager.testPresetManager;
        window.testTemplateEngine = TemplateEngine.testTemplateEngine;
        window.testEnhancementToggle = EnhancementToggle.testToggle;
        window.testEnhancementService = EnhancementService.testEnhancement;
        window.presetManager = new PresetManager();
        window.templateEngine = new TemplateEngine();
        window.enhancementToggle = new EnhancementToggle();
        window.enhancementService = new EnhancementService();
        
        // Add test function for debugging email enhancement
        window.testEmailEnhancement = async function(testText) {
            console.log('🧪 Testing email enhancement with:', testText);
            
            if (!window.presetManager || !window.enhancementService) {
                console.error('❌ Services not initialized');
                return;
            }
            
            try {
                // Get the email preset
                const emailPreset = window.presetManager.presets.get('default-email');
                if (!emailPreset) {
                    console.error('❌ Email preset not found');
                    return;
                }
                
                console.log('📝 Using preset:', emailPreset.name);
                console.log('📋 Prompt template:', emailPreset.prompt);
                
                // Test the enhancement
                const result = await window.enhancementService.enhanceTranscript(testText, 'default-email');
                console.log('🎯 Enhancement result:', result);
                
                if (result.success) {
                    console.log('✅ Enhanced text:', result.result);
                    console.log('📊 Original vs Enhanced:');
                    console.log('Original:', testText);
                    console.log('Enhanced:', result.result);
                } else {
                    console.error('❌ Enhancement failed:', result.reason);
                }
                
                return result;
            } catch (error) {
                console.error('💥 Test failed:', error);
            }
        };
        
    } else {
        if (DEBUG) console.warn('❌ Audio recording not supported in this browser');
        window.yapprContentScriptLoaded = false;  // Reset flag if not supported
    }
} else {
    if (DEBUG) console.log('⚠️ Yappr content script already initialized, skipping re-initialization');
}