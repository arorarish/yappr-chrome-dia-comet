// Yappr Chrome Extension - Background Service Worker
// Combined for compatibility

const DEBUG = false; // Set to true for development

// Constants
const MESSAGE_TYPES = {
    TOGGLE_RECORDING: 'toggleRecording',
    GET_RECORDING_STATE: 'getRecordingState',
    RECORDING_STATE_CHANGED: 'recordingStateChanged',
    TRANSCRIPTION_COMPLETE: 'transcriptionComplete',
};

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
    DEFAULT_STATS: {
        totalWords: 0,
        totalMinutes: 0,
        weeklyWords: 0,
        weeklyMinutes: 0,
        lastWeekReset: new Date().toISOString()
    }
};

// Storage Manager
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

    async getStats() {
        const result = await this.get(CONFIG.STORAGE_KEYS.STATS);
        return { ...CONFIG.DEFAULT_STATS, ...result[CONFIG.STORAGE_KEYS.STATS] };
    }

    async getPopupConfig() {
        const result = await this.get([
            CONFIG.STORAGE_KEYS.OPENAI_API_KEY,
            CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY,
            CONFIG.STORAGE_KEYS.GPT_API_KEY,
            CONFIG.STORAGE_KEYS.STATS,
            CONFIG.STORAGE_KEYS.HISTORY,
            CONFIG.STORAGE_KEYS.FOLDERS
        ]);
        
        return {
            openaiApiKey: result[CONFIG.STORAGE_KEYS.OPENAI_API_KEY] || '',
            elevenlabsApiKey: result[CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY] || '',
            gptApiKey: result[CONFIG.STORAGE_KEYS.GPT_API_KEY] || '',
            stats: { ...CONFIG.DEFAULT_STATS, ...result[CONFIG.STORAGE_KEYS.STATS] },
            history: result[CONFIG.STORAGE_KEYS.HISTORY] || [],
            folders: result[CONFIG.STORAGE_KEYS.FOLDERS] || []
        };
    }

    async initialize() {
        const config = await this.getPopupConfig();
        if (!config.stats.lastWeekReset) {
            await this.set({
                [CONFIG.STORAGE_KEYS.STATS]: CONFIG.DEFAULT_STATS
            });
        }
    }
}

const storageManager = new StorageManager();

/**
 * Background service worker class
 */
class YapprBackground {
    constructor() {
        this.init();
    }

    init() {
        if (DEBUG) console.log('🚀 Yappr Background Service Worker initializing...');
        this.setupInstallListener();
        this.setupCommandListener();
        this.setupMessageListener();
        this.setupSuspendListener();
        if (DEBUG) console.log('✅ Yappr Background Service Worker ready');
    }

    setupInstallListener() {
        chrome.runtime.onInstalled.addListener(async (details) => {
            if (details.reason === 'install') {
                // Initialize storage with default values
                await storageManager.initialize();
                
                // Show welcome notification
                this.showWelcomeNotification();
            }
        });
    }

    setupCommandListener() {
        chrome.commands.onCommand.addListener((command) => {
            if (DEBUG) console.log('🎯 Keyboard command received:', command);
            if (command === 'toggle-recording' || command === 'toggle-recording-alt') {
                if (DEBUG) console.log('🎤 Handling toggle recording command');
                this.handleToggleRecording();
            }
        });
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
            if (DEBUG) console.log('📥 Background received message:', message.type);
            
            
            // Handle other inter-component communication
            return true;
        });
    }

    setupSuspendListener() {
        chrome.runtime.onSuspend.addListener(() => {
            if (DEBUG) console.log('Yappr extension suspending...');
        });
    }

    async handleToggleRecording() {
        try {
            if (DEBUG) console.log('🔍 Querying active tab...');
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (DEBUG) console.log('📋 Active tab:', tab?.url);
            
            if (tab) {
                if (DEBUG) console.log('📨 Sending toggle message to tab:', tab.id);
                chrome.tabs.sendMessage(tab.id, { 
                    type: MESSAGE_TYPES.TOGGLE_RECORDING 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        if (DEBUG) console.error('❌ Message sending failed:', chrome.runtime.lastError.message);
                    } else {
                        if (DEBUG) console.log('✅ Message sent successfully, response:', response);
                    }
                });
            } else {
                if (DEBUG) console.warn('⚠️ No active tab found');
            }
        } catch (error) {
            if (DEBUG) console.error('💥 Error handling toggle recording:', error);
        }
    }

    showWelcomeNotification() {
        // Create a simple notification for installation
        const notificationOptions = {
            type: 'basic',
            iconUrl: 'ref/icon48.png',
            title: 'Yappr Installed!',
            message: 'Add your API key in the extension popup to get started.'
        };

        // Try to create notification, but don't fail if permission is denied
        try {
            chrome.notifications.create(notificationOptions, (notificationId) => {
                if (chrome.runtime.lastError) {
                    if (DEBUG) console.log('Notification permission not granted:', chrome.runtime.lastError.message);
                } else {
                    if (DEBUG) console.log('Welcome notification created:', notificationId);
                }
            });
        } catch (error) {
            if (DEBUG) console.log('Notification error:', error);
        }
    }


    /**
     * Handle storage cleanup and maintenance
     */
    async performMaintenance() {
        try {
            // Clean up old data if needed
            const stats = await storageManager.getStats();
            if (DEBUG) console.log('Current stats:', stats);
            
            // Perform any necessary data migrations
            // This could be expanded for future updates
            
        } catch (error) {
            if (DEBUG) console.error('Maintenance error:', error);
        }
    }

    /**
     * Get extension status
     */
    async getStatus() {
        try {
            const config = await storageManager.getPopupConfig();
            return {
                hasOpenAIKey: !!config.openaiApiKey,
                hasElevenLabsKey: !!config.elevenlabsApiKey,
                historyCount: config.history.length,
                totalWords: config.stats.totalWords
            };
        } catch (error) {
            if (DEBUG) console.error('Error getting status:', error);
            return null;
        }
    }
}

// Initialize background service worker
if (DEBUG) console.log('🚀 Background script loading...');
const yapprBackground = new YapprBackground();

// Perform maintenance on startup
yapprBackground.performMaintenance();

// Test if commands are registered
if (DEBUG) console.log('🔑 Testing command registration...');
chrome.commands.getAll((commands) => {
    if (chrome.runtime.lastError) {
        if (DEBUG) console.error('Commands registration error:', chrome.runtime.lastError.message);
        return;
    }
    if (DEBUG) console.log('📋 Registered commands:', commands);
});