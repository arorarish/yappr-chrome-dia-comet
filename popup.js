// Yappr Chrome Extension - Popup Script
// All modules combined for compatibility

// Debug control - set to false for production/sharing
const DEBUG = false;

// ===============================================
// SHARED CONSTANTS AND UTILITIES
// ===============================================
const CONFIG = {
    STORAGE_KEYS: {
        OPENAI_API_KEY: 'openaiApiKey',
        ELEVENLABS_API_KEY: 'elevenlabsApiKey',
        GPT_API_KEY: 'gptApiKey',
        CLEANUP_PROMPT: 'cleanupPrompt',
        ENABLE_CLEANUP: 'enableCleanup',
        HISTORY: 'history',
        STATS: 'stats',
        FOLDERS: 'folders'
    },
    UI: {
        HISTORY_DISPLAY_LIMIT: 10,
        TEXT_TRUNCATE_LENGTH: 100
    },
    DEFAULT_STATS: {
        totalWords: 0,
        totalMinutes: 0,
        weeklyWords: 0,
        weeklyMinutes: 0,
        lastWeekReset: new Date().toISOString()
    }
};

const SERVICES = {
    OPENAI: 'openai',
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
function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function validateApiKeyFormat(apiKey, service) {
    if (!apiKey || typeof apiKey !== 'string') return false;
    
    switch (service) {
        case 'openai':
            return apiKey.startsWith('sk-');
        case 'elevenlabs':
            return apiKey.trim().length > 0;
        default:
            return false;
    }
}

// showToast function is now provided by shared/notifications.js
function showToast(message, type = 'success') {
    return window.NotificationManager.show(message, type);
}

function copyToClipboard(text) {
    return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => false);
}

function createTimestampedFilename(baseName, extension, timestamp = null) {
    const date = timestamp ? new Date(timestamp) : new Date();
    const dateStr = date.toISOString().split('T')[0];
    return `${baseName}-${dateStr}.${extension}`;
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
                console.log('📦 Getting large data from local storage only');
                const localData = await chrome.storage.local.get(keys);
                return Array.isArray(keys) 
                    ? localData
                    : { [keys]: localData[keys] || null };
            } else {
                // For small data (API keys), try sync first, then merge with local
                console.log('☁️ Getting small data from sync and local storage');
                const syncData = await chrome.storage.sync.get(keys);
                const localData = await chrome.storage.local.get(keys);
                
                console.log('📊 Storage comparison:', {
                    syncKeys: Object.keys(syncData),
                    localKeys: Object.keys(localData),
                    syncHasData: Object.keys(syncData).some(k => syncData[k]),
                    localHasData: Object.keys(localData).some(k => localData[k])
                });
                
                // Merge with sync taking precedence
                const mergedData = Array.isArray(keys) 
                    ? { ...localData, ...syncData }
                    : { [keys]: syncData[keys] || localData[keys] || null };
                
                console.log('✅ Merged storage data retrieved');
                return mergedData;
            }
        } catch (error) {
            console.error('❌ Storage get error:', error);
            return Array.isArray(keys) ? {} : { [keys]: null };
        }
    }

    async set(data) {
        try {
            console.log('💾 Storage.set called with data keys:', Object.keys(data));
            
            // Separate large data (history) from small data (settings)
            const largeDataKeys = ['history', 'yapprSessions', 'yapprAnalyses'];
            const hasLargeData = Object.keys(data).some(key => largeDataKeys.includes(key));
            
            if (hasLargeData) {
                // Only save large data to local storage
                console.log('📦 Saving large data to local storage only');
                await chrome.storage.local.set(data);
                console.log('✅ Local storage set successful');
            } else {
                // Save small data (API keys) to sync storage first, then local as backup
                console.log('☁️ Saving small data to sync storage (primary) and local (backup)');
                let syncSuccess = false;
                
                try {
                    await chrome.storage.sync.set(data);
                    console.log('✅ Sync storage set successful');
                    syncSuccess = true;
                } catch (syncError) {
                    console.warn('⚠️ Sync storage failed:', syncError.message);
                }
                
                // Always save to local as backup, but log differently based on sync success
                await chrome.storage.local.set(data);
                console.log(syncSuccess ? '✅ Local backup storage set successful' : '✅ Local storage set successful (sync failed)');
                
                // Notify other extension pages that storage changed
                try {
                    chrome.runtime.sendMessage({
                        type: 'STORAGE_UPDATED',
                        data: Object.keys(data)
                    }).catch(() => {
                        // Message might fail if no listeners, that's okay
                        console.log('📡 Storage update notification sent (or no listeners)');
                    });
                } catch (e) {
                    // Runtime message might fail, that's okay
                }
            }
            
            return true;
        } catch (error) {
            console.error('❌ Storage set error:', error);
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


    async getHistory() {
        const result = await this.get(CONFIG.STORAGE_KEYS.HISTORY);
        const history = result[CONFIG.STORAGE_KEYS.HISTORY] || [];
        
        let modified = false;
        history.forEach(item => {
            if (!item.id) {
                item.id = crypto.randomUUID();
                modified = true;
            }
        });
        
        if (modified) {
            await this.set({ [CONFIG.STORAGE_KEYS.HISTORY]: history });
        }
        
        return history;
    }

    async setHistory(history) {
        return await this.set({ [CONFIG.STORAGE_KEYS.HISTORY]: history });
    }

    async deleteTranscription(itemId) {
        const history = await this.getHistory();
        const filteredHistory = history.filter(item => item.id !== itemId);
        return await this.setHistory(filteredHistory);
    }

    async getStats() {
        const result = await this.get(CONFIG.STORAGE_KEYS.STATS);
        return { ...CONFIG.DEFAULT_STATS, ...result[CONFIG.STORAGE_KEYS.STATS] };
    }

    async getFolders() {
        const result = await this.get(CONFIG.STORAGE_KEYS.FOLDERS);
        return result[CONFIG.STORAGE_KEYS.FOLDERS] || [];
    }

    async setFolders(folders) {
        return await this.set({ [CONFIG.STORAGE_KEYS.FOLDERS]: folders });
    }

    async createFolder(folderData) {
        const folders = await this.getFolders();
        const newFolder = {
            id: crypto.randomUUID(),
            name: folderData.name,
            activationPhrase: folderData.activationPhrase,
            createdAt: new Date().toISOString(),
            transcriptionCount: 0
        };
        folders.push(newFolder);
        await this.setFolders(folders);
        return newFolder;
    }

    async updateFolder(folderId, updates) {
        const folders = await this.getFolders();
        const folderIndex = folders.findIndex(f => f.id === folderId);
        if (folderIndex === -1) return false;
        
        folders[folderIndex] = { ...folders[folderIndex], ...updates };
        await this.setFolders(folders);
        return folders[folderIndex];
    }

    async deleteFolder(folderId) {
        const folders = await this.getFolders();
        const filteredFolders = folders.filter(f => f.id !== folderId);
        await this.setFolders(filteredFolders);
        
        // Remove folder assignments from history
        const history = await this.getHistory();
        const updatedHistory = history.map(item => ({
            ...item,
            folderId: item.folderId === folderId ? null : item.folderId
        }));
        await this.setHistory(updatedHistory);
        
        return true;
    }

    async findFolderByActivationPhrase(text) {
        const folders = await this.getFolders();
        return folders.find(folder => 
            text.toLowerCase().startsWith(folder.activationPhrase.toLowerCase())
        );
    }

    async getPopupConfig() {
        console.log('🔍 Popup: Getting popup config...');
        const result = await this.get([
            CONFIG.STORAGE_KEYS.OPENAI_API_KEY,
            CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY,
            CONFIG.STORAGE_KEYS.GPT_API_KEY,
            CONFIG.STORAGE_KEYS.CLEANUP_PROMPT,
            CONFIG.STORAGE_KEYS.STATS,
            CONFIG.STORAGE_KEYS.HISTORY,
            CONFIG.STORAGE_KEYS.FOLDERS
        ]);
        
        console.log('🔍 Popup: Raw storage result:', {
            elevenlabsApiKey: result[CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY] ? '***SET***' : 'NOT SET',
            gptApiKey: result[CONFIG.STORAGE_KEYS.GPT_API_KEY] ? '***SET***' : 'NOT SET',
            keys: Object.keys(result)
        });
        
        const config = {
            openaiApiKey: result[CONFIG.STORAGE_KEYS.OPENAI_API_KEY] || '',
            elevenlabsApiKey: result[CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY] || '',
            gptApiKey: result[CONFIG.STORAGE_KEYS.GPT_API_KEY] || '',
            cleanupPrompt: result[CONFIG.STORAGE_KEYS.CLEANUP_PROMPT] || '',
            stats: { ...CONFIG.DEFAULT_STATS, ...result[CONFIG.STORAGE_KEYS.STATS] },
            history: result[CONFIG.STORAGE_KEYS.HISTORY] || [],
            folders: result[CONFIG.STORAGE_KEYS.FOLDERS] || []
        };
        
        console.log('🔍 Popup: Final config object:', {
            elevenlabsApiKey: config.elevenlabsApiKey ? '***SET***' : 'NOT SET',
            gptApiKey: config.gptApiKey ? '***SET***' : 'NOT SET'
        });
        
        return config;
    }
}

// ===============================================
// API MANAGER
// ===============================================
class ApiManager {
    constructor() {
        this.storageManager = new StorageManager();
    }

    async testApiKey(service, apiKey) {
        try {
            if (service === SERVICES.OPENAI) {
                const response = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                return response.ok;
            } else {
                // For ElevenLabs, just validate format
                return validateApiKeyFormat(apiKey, service);
            }
        } catch (error) {
            console.error('API key test error:', error);
            return false;
        }
    }

    async saveApiKey(service, apiKey) {
        if (!validateApiKeyFormat(apiKey, service)) {
            throw new Error('Invalid API key format');
        }
        
        return await this.storageManager.setApiKey(service, apiKey);
    }

    validateKeyFormat(service, apiKey) {
        return validateApiKeyFormat(apiKey, service);
    }
}

// ===============================================
// BASE UI CLASS
// ===============================================
class BaseUI {
    constructor() {
        this.config = {};
        this.stats = CONFIG.DEFAULT_STATS;
        this.history = [];
        this.folders = [];
        this.isInitialized = false;
        this.storageManager = new StorageManager();
        this.apiManager = new ApiManager();
    }

    async init() {
        if (this.isInitialized) return;
        
        try {
            await this.loadData();
            this.setupEventListeners();
            this.render();
            this.isInitialized = true;
            console.log('UI initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize UI:', error);
            // Initialize with defaults instead of showing error
            this.stats = CONFIG.DEFAULT_STATS;
            this.history = [];
            this.folders = [];
            this.config = {};
            this.setupEventListeners();
            this.render();
            this.isInitialized = true;
            console.log('UI initialized with fallback data');
        }
    }

    async loadData() {
        try {
            console.log('🔄 Popup: Loading data...');
            
            // Simple direct storage access for API key
            const apiKeyResult = await chrome.storage.sync.get(['elevenlabsApiKey']);
            this.config = {
                elevenlabsApiKey: apiKeyResult.elevenlabsApiKey || ''
            };
            
            // Load other data using storage manager for compatibility
            const otherData = await this.storageManager.get(['stats', 'history', 'folders']);
            this.stats = otherData.stats || CONFIG.DEFAULT_STATS;
            this.history = otherData.history || [];
            this.folders = otherData.folders || [];
            
            console.log('✅ Popup: Data loaded successfully:', {
                elevenlabsApiKey: this.config.elevenlabsApiKey ? '***SET***' : 'NOT SET',
                historyCount: this.history.length,
                foldersCount: this.folders.length
            });
            
            // Populate API key input if exists
            if (this.elements.apiKeyInput && this.config.elevenlabsApiKey) {
                this.elements.apiKeyInput.value = this.config.elevenlabsApiKey;
            }
            
            // Load cleanup setting
            const cleanupResult = await chrome.storage.sync.get(['cleanupEnabled']);
            const isCleanupEnabled = cleanupResult.cleanupEnabled !== false; // Default to true
            if (this.elements.cleanupToggle) {
                this.elements.cleanupToggle.checked = isCleanupEnabled;
            }
        } catch (error) {
            console.error('❌ Popup: Error loading data:', error);
            // Fallback to default data instead of throwing
            this.config = {
                elevenlabsApiKey: ''
            };
            this.stats = CONFIG.DEFAULT_STATS;
            this.history = [];
            this.folders = [];
            console.log('⚠️ Popup: Using fallback data due to error');
        }
    }

    setupEventListeners() {
        // Override in subclasses
    }

    render() {
        // Override in subclasses
    }

    async handleTranscriptionAction(action, itemId, element = null) {
        const item = this.history.find(h => h.id === itemId);
        if (!item) {
            this.showError('Transcription not found');
            return;
        }

        switch (action) {
            case 'copy':
                await this.copyTranscription(item);
                break;
            case 'download':
                this.downloadTranscription(item);
                break;
            case 'delete':
                if (await this.confirmAction('Are you sure you want to delete this transcription?')) {
                    await this.deleteTranscription(itemId);
                }
                break;
            case 'expand':
                this.expandTranscription(element, item.text);
                break;
        }
    }

    async copyTranscription(item) {
        const success = await copyToClipboard(item.text);
        if (success) {
            this.showSuccess('Copied to clipboard!');
        } else {
            this.showError('Failed to copy');
        }
    }

    downloadTranscription(item) {
        const filename = createTimestampedFilename(
            'whisper-transcription', 
            'txt', 
            item.timestamp
        );
        
        const blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showSuccess('Downloaded!');
    }

    async deleteTranscription(itemId) {
        try {
            await this.storageManager.deleteTranscription(itemId);
            this.history = this.history.filter(item => item.id !== itemId);
            this.render();
            this.showSuccess('Transcription deleted');
        } catch (error) {
            console.error('Error deleting transcription:', error);
            this.showError('Failed to delete transcription');
        }
    }

    expandTranscription(element, fullText) {
        if (!element) return;
        
        const isExpanded = element.dataset.expanded === 'true';
        if (isExpanded) {
            element.textContent = truncateText(fullText, CONFIG.UI.TEXT_TRUNCATE_LENGTH);
            element.dataset.expanded = 'false';
        } else {
            element.textContent = fullText;
            element.dataset.expanded = 'true';
        }
    }

    async testApiKey(service, apiKey) {
        return await this.apiManager.testApiKey(service, apiKey);
    }

    async saveApiKey(service, apiKey) {
        try {
            const success = await this.apiManager.saveApiKey(service, apiKey);
            if (success) {
                this.config[`${service}ApiKey`] = apiKey;
                this.showSuccess(`${service === SERVICES.OPENAI ? 'OpenAI' : 'ElevenLabs'} API key saved!`);
            }
            return success;
        } catch (error) {
            console.error('Error saving API key:', error);
            this.showError(error.message);
            return false;
        }
    }


    async clearHistory() {
        try {
            await this.storageManager.setHistory([]);
            this.history = [];
            this.render();
            this.showSuccess('History cleared');
        } catch (error) {
            console.error('Error clearing history:', error);
            this.showError('Failed to clear history');
        }
    }

    formatTranscriptionItem(item, index) {
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString();
        const duration = item.duration ? `${Math.round(item.duration)}s` : 'N/A';
        const words = item.wordCount ? `${item.wordCount} words` : 'N/A';

        return `
            <div class="transcription-card" data-index="${index}" data-id="${item.id}">
                <div class="card-header">
                    <div class="card-meta">
                        <div class="card-time">${timeStr} - ${dateStr}</div>
                        <div class="card-stats">${words} • ${duration}</div>
                    </div>
                    <div class="card-actions">
                        <button class="action-icon" data-action="copy" data-id="${item.id}" title="Copy">
                            <span class="material-icons">content_copy</span>
                        </button>
                        <button class="action-icon" data-action="download" data-id="${item.id}" title="Download">
                            <span class="material-icons">download</span>
                        </button>
                        <button class="action-icon" data-action="delete" data-id="${item.id}" title="Delete">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <div class="card-text" data-action="expand" data-expanded="false">
                        ${truncateText(item.text, CONFIG.UI.TEXT_TRUNCATE_LENGTH)}
                    </div>
                </div>
            </div>
        `;
    }

    showSuccess(message) {
        showToast(message, 'success');
    }

    showError(message) {
        showToast(message, 'error');
    }

    showWarning(message) {
        showToast(message, 'warning');
    }

    showInfo(message) {
        showToast(message, 'info');
    }

    async refresh() {
        await this.loadData();
        this.render();
    }
}

// ===============================================
// POPUP CLASS
// ===============================================
class YapprPopup extends BaseUI {
    constructor() {
        super();
        this.isRecording = false;
        this.elements = {};
    }

    async init() {
        this.cacheElements();
        await super.init();
        await this.initializePresets();
        this.checkRecordingState();
        this.setupMessageListener();
    }

    cacheElements() {
        console.log('🔍 Popup: Caching DOM elements...');
        this.elements = {
            // Enhancement Presets
            presetPills: document.getElementById('presetPills'),
            presetStatus: document.getElementById('presetStatus'),
            
            // Settings
            configureSettingsBtn: document.getElementById('configureSettingsBtn'),
            
            // API Key Input
            apiKeyInput: document.getElementById('apiKeyInput'),
            saveApiKeyBtn: document.getElementById('saveApiKey'),
            
            // Cleanup Toggle
            cleanupToggle: document.getElementById('cleanupEnabled'),
            
            // Status
            apiStatus: document.getElementById('apiStatus'),
            
            // Recording
            recordButton: document.getElementById('recordButton'),
            
            // Stats
            weeklyWords: document.getElementById('weeklyWords'),
            totalWords: document.getElementById('totalWords'),
            
            // History
            historyList: document.getElementById('historyList'),
            
            // Analytics, History, Folders, and Help cards
            viewAnalytics: document.getElementById('viewAnalytics'),
            viewAllHistory: document.getElementById('viewAllHistory'),
            viewFolders: document.getElementById('viewFolders'),
            viewHelp: document.getElementById('viewHelp')
        };
        
        // Validate critical elements
        console.log('🔍 Popup: Element validation:', {
            presetPills: !!this.elements.presetPills,
            presetStatus: !!this.elements.presetStatus,
            recordButton: !!this.elements.recordButton
        });
        
        if (!this.elements.presetPills) {
            console.error('❌ Popup: presetPills element not found in DOM!');
        }
        if (!this.elements.presetStatus) {
            console.error('❌ Popup: presetStatus element not found in DOM!');
        }
        
        // Debug: Check if elements are found
        console.log('Element caching results:', {
            viewAnalytics: !!this.elements.viewAnalytics,
            viewAllHistory: !!this.elements.viewAllHistory,
            viewFolders: !!this.elements.viewFolders,
            configureSettingsBtn: !!this.elements.configureSettingsBtn
        });
    }

    setupEventListeners() {
        // Preset pills - use event delegation
        if (this.elements.presetPills) {
            this.elements.presetPills.addEventListener('click', (e) => {
                if (e.target.classList.contains('preset-pill')) {
                    const presetId = e.target.dataset.presetId;
                    this.handlePresetChange(presetId);
                }
            });
        }
        
        // Settings button
        this.elements.configureSettingsBtn.addEventListener('click', () => {
            this.openSettings();
        });
        
        // API Key Save button
        if (this.elements.saveApiKeyBtn) {
            this.elements.saveApiKeyBtn.addEventListener('click', () => {
                this.saveApiKey();
            });
        }
        
        // API Key input enter key
        if (this.elements.apiKeyInput) {
            this.elements.apiKeyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveApiKey();
                }
            });
        }
        
        // Cleanup Toggle
        if (this.elements.cleanupToggle) {
            this.elements.cleanupToggle.addEventListener('change', () => {
                console.log('🔄 Cleanup toggle changed:', this.elements.cleanupToggle.checked);
                this.saveCleanupSetting();
            });
        }
        
        // Recording button
        this.elements.recordButton.addEventListener('click', () => {
            this.handleToggleRecording();
        });
        
        // History actions - clearHistory button doesn't exist in popup
        
        // Analytics, History, and Folders cards - using direct selectors
        const analyticsBtn = document.getElementById('viewAnalytics');
        const historyBtn = document.getElementById('viewAllHistory');
        const foldersBtn = document.getElementById('viewFolders');
        
        console.log('Direct element lookup:', {
            analyticsBtn: !!analyticsBtn,
            historyBtn: !!historyBtn,
            foldersBtn: !!foldersBtn
        });
        
        if (analyticsBtn) {
            analyticsBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                console.log('Analytics clicked');
                this.openPage('analytics.html');
            });
        } else {
            console.error('Analytics button not found');
        }
        
        if (historyBtn) {
            historyBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                console.log('History clicked');
                this.openPage('history.html');
            });
        } else {
            console.error('History button not found');
        }
        
        if (foldersBtn) {
            foldersBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                console.log('Folders clicked');
                this.openPage('folders.html');
            });
        } else {
            console.error('Folders button not found');
        }
        
        // Help button
        const helpBtn = document.getElementById('viewHelp');
        if (helpBtn) {
            helpBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                console.log('Help clicked');
                this.openPage('help.html');
            });
        } else {
            console.error('Help button not found');
        }
        
        // History list delegation
        this.elements.historyList.addEventListener('click', (event) => {
            this.handleHistoryClick(event);
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case MESSAGE_TYPES.RECORDING_STATE_CHANGED:
                    this.isRecording = message.isRecording;
                    this.updateRecordButton();
                    break;
                    
                case MESSAGE_TYPES.TRANSCRIPTION_COMPLETE:
                    this.handleTranscriptionComplete(message.data);
                    break;
                    
                case 'API_ERROR_NOTIFICATION':
                    this.handleApiErrorNotification(message);
                    break;
            }
        });
        // Removed storage change listeners - we handle API keys directly now
    }

    render() {
        this.updateApiStatus();
        this.updateStats();
        this.updateHistoryDisplay();
        this.updateRecordButton();
    }


    updateApiStatus() {
        const elevenlabsApiKey = this.config.elevenlabsApiKey;
        
        console.log('🔍 Popup: updateApiStatus called, elevenlabsApiKey:', elevenlabsApiKey ? '***SET***' : 'NOT SET');
        
        const statusDot = this.elements.apiStatus.querySelector('.status-dot');
        const statusText = this.elements.apiStatus.querySelector('.status-text');
        
        if (!elevenlabsApiKey) {
            console.log('❌ Popup: No ElevenLabs API key found');
            statusDot.classList.remove('connected');
            statusText.innerHTML = `Enter your API key above. <a href="https://try.elevenlabs.io/yappr-chrome" target="_blank" style="color: var(--accent); text-decoration: none;">Generate Free on ElevenLabs here.</a>`;
        } else {
            console.log('✅ Popup: ElevenLabs API key found, showing connected state');
            statusDot.classList.add('connected');
            statusText.textContent = 'ElevenLabs connected';
        }
    }
    
    async saveApiKey() {
        const apiKey = this.elements.apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showWarning('Please enter an API key');
            return;
        }
        
        try {
            // Simple, direct save to chrome.storage.sync
            await chrome.storage.sync.set({ elevenlabsApiKey: apiKey });
            
            // Update local config
            this.config.elevenlabsApiKey = apiKey;
            
            // Update UI
            this.updateApiStatus();
            this.updateRecordButton();
            
            // Show success message
            this.showSuccess('API key saved successfully!');
            
            console.log('✅ Popup: API key saved directly');
        } catch (error) {
            console.error('❌ Popup: Failed to save API key:', error);
            this.showError('Failed to save API key. Please try again.');
        }
    }
    
    async saveCleanupSetting() {
        try {
            const isEnabled = this.elements.cleanupToggle.checked;
            await chrome.storage.sync.set({ cleanupEnabled: isEnabled });
            
            console.log('✅ Popup: Cleanup setting saved:', isEnabled ? 'ENABLED' : 'DISABLED');
            this.showSuccess(isEnabled ? 'Cleanup enabled!' : 'Cleanup disabled!');
        } catch (error) {
            console.error('❌ Popup: Failed to save cleanup setting:', error);
            this.showError('Failed to save cleanup setting. Please try again.');
        }
    }

    openSettings() {
        chrome.runtime.openOptionsPage();
    }

    openPage(filename) {
        console.log(`🔗 Opening page: ${filename}`);
        
        // Check chrome APIs
        if (!chrome || !chrome.tabs || !chrome.runtime) {
            console.error('❌ Chrome APIs not available');
            return;
        }
        
        const url = chrome.runtime.getURL(filename);
        console.log(`📄 Generated URL: ${url}`);
        
        // Simple approach - just create the tab
        chrome.tabs.create({ url: url }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('❌ Chrome tabs error:', chrome.runtime.lastError.message);
                // Try window.open as fallback
                try {
                    window.open(url, '_blank');
                    console.log('✅ Fallback window.open succeeded');
                } catch (e) {
                    console.error('❌ Fallback failed:', e);
                }
            } else {
                console.log('✅ Tab created successfully:', tab.id);
                // Close popup
                try {
                    window.close();
                } catch (e) {
                    console.log('ℹ️ Could not close popup window (normal in some contexts)');
                }
            }
        });
    }

    updateStats() {
        this.elements.weeklyWords.textContent = this.stats.weeklyWords.toLocaleString();
        this.elements.totalWords.textContent = this.stats.totalWords.toLocaleString();
    }

    updateHistoryDisplay() {
        if (this.history.length === 0) {
            this.elements.historyList.innerHTML = 
                '<div style="text-align: center; opacity: 0.6; padding: 20px;">No transcriptions yet</div>';
            return;
        }

        const recentHistory = this.history.slice(0, CONFIG.UI.HISTORY_DISPLAY_LIMIT);
        this.elements.historyList.innerHTML = recentHistory
            .map((item, index) => this.formatTranscriptionItem(item, index))
            .join('');
    }

    updateRecordButton() {
        const elevenlabsApiKey = this.config.elevenlabsApiKey;
        const hasValidConfig = !!elevenlabsApiKey;
        
        this.elements.recordButton.disabled = !hasValidConfig;
        
        if (this.isRecording) {
            this.elements.recordButton.innerHTML = '<span class="material-icons">stop</span>Stop Recording';
            this.elements.recordButton.className = 'btn-primary btn-large recording';
        } else {
            this.elements.recordButton.innerHTML = '<span class="material-icons">mic</span>Start Recording';
            this.elements.recordButton.className = 'btn-primary btn-large';
        }
    }



    async handleToggleRecording() {
        console.log('🎤 Popup: handleToggleRecording called');
        this.sendMessageToContentScript({
            type: MESSAGE_TYPES.TOGGLE_RECORDING
        });
    }

    async checkRecordingState() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(
                    tab.id, 
                    { type: MESSAGE_TYPES.GET_RECORDING_STATE }, 
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Could not connect to content script');
                            this.isRecording = false;
                        } else if (response) {
                            this.isRecording = response.isRecording;
                        }
                        this.updateRecordButton();
                    }
                );
            }
        } catch (error) {
            console.error('Error checking recording state:', error);
        }
    }

    async handleTranscriptionComplete(data) {
        // Update local data
        this.history.unshift(data);
        this.history = this.history.slice(0, CONFIG.UI.HISTORY_DISPLAY_LIMIT);
        
        this.stats.totalWords += data.wordCount;
        this.stats.weeklyWords += data.wordCount;
        this.stats.totalMinutes += Math.round(data.duration / 60);
        this.stats.weeklyMinutes += Math.round(data.duration / 60);

        // Re-render affected sections
        this.updateStats();
        this.updateHistoryDisplay();
        
        console.log('Transcription complete:', data);
    }

    handleHistoryClick(event) {
        const actionElement = event.target.closest('.action-icon, .card-text');
        if (!actionElement) return;

        const historyItem = actionElement.closest('.transcription-card');
        if (!historyItem) return;

        const itemId = historyItem.dataset.id;
        const action = actionElement.dataset.action;

        if (itemId && action) {
            this.handleTranscriptionAction(action, itemId, actionElement);
        }
    }

    async confirmClearHistory() {
        if (this.history.length === 0) {
            this.showWarning('History is already empty');
            return;
        }

        if (await this.confirmAction(`Are you sure you want to clear all ${this.history.length} transcriptions? This cannot be undone.`)) {
            this.clearHistory();
        }
    }

    async confirmAction(message) {
        return new Promise((resolve) => {
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'confirmation-modal';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <div class="modal-header">Confirm Action</div>
                    <div class="modal-message">${message}</div>
                    <div class="modal-actions">
                        <button class="btn-secondary cancel-btn">Cancel</button>
                        <button class="btn-danger confirm-btn">Confirm</button>
                    </div>
                </div>
            `;

            // Add event listeners
            const cancelBtn = modal.querySelector('.cancel-btn');
            const confirmBtn = modal.querySelector('.confirm-btn');
            const overlay = modal.querySelector('.modal-overlay');

            const cleanup = () => {
                modal.remove();
            };

            cancelBtn.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            confirmBtn.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });

            overlay.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });

            // Add to DOM
            document.body.appendChild(modal);
        });
    }

    sendMessageToContentScript(message) {
        if (DEBUG) console.log('📨 Popup: Sending message to content script:', message);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                if (DEBUG) console.log('📋 Popup: Sending to tab:', tabs[0].url);
                chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
                    if (chrome.runtime.lastError) {
                        // This is normal when content script isn't loaded - don't show as error
                        if (DEBUG) console.warn('⚠️ Popup: Content script not available:', chrome.runtime.lastError.message);
                    } else {
                        if (DEBUG) console.log('✅ Popup: Message sent successfully, response:', response);
                    }
                });
            } else {
                if (DEBUG) console.warn('⚠️ Popup: No active tab found');
            }
        });
    }

    showApiError(message) {
        const statusText = this.elements.apiStatus.querySelector('.status-text');
        statusText.textContent = message;
        statusText.style.color = 'var(--color-danger)';
    }

    hideApiError() {
        const statusText = this.elements.apiStatus.querySelector('.status-text');
        statusText.style.color = '';
    }

    /**
     * Handle API error notifications from content script
     */
    handleApiErrorNotification(message) {
        console.log('🚨 Popup: Received API error notification:', message);
        
        const statusText = this.elements.apiStatus.querySelector('.status-text');
        const statusDot = this.elements.apiStatus.querySelector('.status-dot');
        
        // Update status based on error type
        if (message.error.includes('API_KEY_INVALID')) {
            statusDot.classList.remove('connected');
            statusText.innerHTML = `
                <span style="color: var(--color-error);">❌ Invalid ElevenLabs API key</span><br>
                <a href="#" id="configureKeysLink" style="color: var(--accent); text-decoration: none;">Update in settings</a>
            `;
            
            // Add click listener for settings link
            const configureLink = statusText.querySelector('#configureKeysLink');
            if (configureLink) {
                configureLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openSettings();
                });
            }
            
        } else if (message.error.includes('CREDITS_EXHAUSTED')) {
            statusDot.classList.remove('connected');
            statusText.innerHTML = `
                <span style="color: var(--color-warning);">⚠️ ElevenLabs credits exhausted</span><br>
                <a href="https://try.elevenlabs.io/yappr-chrome" target="_blank" style="color: var(--accent); text-decoration: none;">Add credits</a>
            `;
            
        } else if (message.error.includes('RATE_LIMIT')) {
            statusDot.classList.remove('connected');
            statusText.innerHTML = `
                <span style="color: var(--color-warning);">⏱️ Rate limit exceeded</span><br>
                <span style="color: var(--text-secondary); font-size: var(--font-size-sm);">Please wait and try again</span>
            `;
            
            // Auto-clear rate limit message after 30 seconds
            setTimeout(() => {
                this.updateApiStatus();
            }, 30000);
        }
    }

    // ===============================================
    // PRESET MANAGEMENT
    // ===============================================

    async loadPresets() {
        try {
            console.log('🎨 Popup: Loading presets...');
            
            // Get presets from storage (try sync first, then local)
            let { presets = {}, selectedPresetId = null } = await chrome.storage.sync.get(['presets', 'selectedPresetId']);
            console.log('🔍 Popup: Retrieved from sync storage:', { presets, selectedPresetId });
            
            // If no presets found in sync, try local storage
            if (Object.keys(presets).length === 0) {
                console.log('🔍 Popup: No presets in sync storage, trying local...');
                const localData = await chrome.storage.local.get(['presets', 'selectedPresetId']);
                presets = localData.presets || {};
                selectedPresetId = localData.selectedPresetId || selectedPresetId;
                console.log('🔍 Popup: Retrieved from local storage:', { presets, selectedPresetId });
            }
            
            // Clear existing pills
            const pillsContainer = this.elements.presetPills;
            if (!pillsContainer) {
                console.error('❌ Popup: presetPills container not found!');
                return;
            }
            console.log('✅ Popup: Found presetPills container');
            
            pillsContainer.innerHTML = '';
            
            // Add "Off" pill first
            const offPill = document.createElement('div');
            offPill.className = 'preset-pill off';
            offPill.dataset.presetId = '';
            offPill.textContent = 'Off';
            pillsContainer.appendChild(offPill);
            
            // Add preset pills
            const presetArray = Object.values(presets).filter(preset => preset.enabled);
            console.log('🔍 Popup: Found presets:', presetArray.length, presetArray.map(p => p.name));
            
            // Sort presets: system presets first, then by usage/name
            presetArray.sort((a, b) => {
                if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
                if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount;
                return a.name.localeCompare(b.name);
            });
            
            presetArray.forEach(preset => {
                console.log('🔍 Popup: Adding preset pill:', preset.name, preset.id);
                const pill = document.createElement('div');
                pill.className = 'preset-pill';
                pill.dataset.presetId = preset.id;
                pill.textContent = preset.name;
                if (preset.isSystem) {
                    pill.textContent += ' ✨'; // System preset indicator
                }
                pillsContainer.appendChild(pill);
            });
            
            // Set active pill
            this.setActivePill(selectedPresetId);
            this.updatePresetStatus(selectedPresetId);
            
            console.log(`✅ Popup: Loaded ${presetArray.length} presets, selected: ${selectedPresetId}`);
            
        } catch (error) {
            console.error('❌ Popup: Failed to load presets:', error);
        }
    }

    setActivePill(selectedPresetId) {
        // Remove active class from all pills
        const pills = this.elements.presetPills.querySelectorAll('.preset-pill');
        pills.forEach(pill => pill.classList.remove('active'));
        
        // Add active class to selected pill
        const targetPill = selectedPresetId 
            ? this.elements.presetPills.querySelector(`[data-preset-id="${selectedPresetId}"]`)
            : this.elements.presetPills.querySelector('[data-preset-id=""]'); // Off pill
            
        if (targetPill) {
            targetPill.classList.add('active');
        }
    }

    async handlePresetChange(presetId) {
        try {
            console.log('🎯 Popup: Preset changed to:', presetId);
            
            // Save selected preset
            await chrome.storage.sync.set({ selectedPresetId: presetId || null });
            
            // Update UI
            this.setActivePill(presetId);
            this.updatePresetStatus(presetId);
            
            // Send message to content script to update preset
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'PRESET_CHANGED',
                    presetId: presetId || null
                }).catch(error => {
                    // Content script might not be loaded, that's okay
                    console.log('Note: Content script not available for preset update');
                });
            }
            
        } catch (error) {
            console.error('❌ Popup: Failed to change preset:', error);
        }
    }

    updatePresetStatus(presetId) {
        const statusElement = this.elements.presetStatus;
        if (!statusElement) return;
        
        const indicator = statusElement.querySelector('.preset-indicator');
        const text = statusElement.querySelector('.preset-text');
        
        if (presetId) {
            // Get preset name from active pill
            const activePill = this.elements.presetPills.querySelector(`[data-preset-id="${presetId}"]`);
            const presetName = activePill ? activePill.textContent : 'Unknown';
            
            indicator.classList.add('active');
            text.textContent = `Active: ${presetName}`;
        } else {
            indicator.classList.remove('active');
            text.textContent = 'Enhancement disabled';
        }
    }

    async initializePresets() {
        try {
            // Load presets on popup open
            await this.loadPresets();
            
            // Listen for preset changes from other parts of the extension
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'sync' && (changes.presets || changes.selectedPresetId)) {
                    console.log('🔄 Popup: Presets changed, reloading...');
                    this.loadPresets();
                }
            });
            
        } catch (error) {
            console.error('❌ Popup: Failed to initialize presets:', error);
        }
    }
}

// ===============================================
// INITIALIZE
// ===============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎮 Popup DOM loaded, initializing...');
    try {
        const popup = new YapprPopup();
        await popup.init();
        console.log('✅ Popup initialized successfully');
    } catch (error) {
        console.error('❌ Popup initialization failed:', error);
    }
});