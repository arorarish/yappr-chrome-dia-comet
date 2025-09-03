// Yappr Privacy-Safe Usage Analytics Tracker
// Tracks local usage patterns without compromising user privacy

class YapprUsageTracker {
    constructor() {
        this.isEnabled = true;
        this.events = [];
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        
        this.init();
    }

    async init() {
        try {
            // Check if analytics are enabled (opt-out system)
            const settings = await chrome.storage.sync.get(['analyticsEnabled']);
            this.isEnabled = settings.analyticsEnabled !== false; // Default to enabled (opt-out)
            
            if (!this.isEnabled) {
                console.log('📊 Analytics disabled by user preference');
                return;
            }

            console.log('📊 Initializing privacy-safe usage analytics...');
            
            // Load existing analytics data
            await this.loadAnalyticsData();
            
            // Setup periodic data aggregation (every 5 minutes)
            setInterval(() => this.aggregateAndStore(), 5 * 60 * 1000);
            
            // Track page view
            this.trackEvent('page_view', {
                page: this.getCurrentPage(),
                referrer: document.referrer || 'direct'
            });

            console.log('✅ Usage analytics initialized');
        } catch (error) {
            console.error('❌ Error initializing usage analytics:', error);
        }
    }

    // Event tracking methods
    trackEvent(eventType, properties = {}) {
        if (!this.isEnabled) return;

        const event = {
            id: this.generateEventId(),
            type: eventType,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            page: this.getCurrentPage(),
            properties: this.sanitizeProperties(properties)
        };

        this.events.push(event);
        console.log(`📊 Event tracked: ${eventType}`, properties);

        // Store immediately if it's a critical event
        if (this.isCriticalEvent(eventType)) {
            this.aggregateAndStore();
        }
    }

    // Feature usage tracking
    trackFeatureUsage(feature, action = 'used', metadata = {}) {
        this.trackEvent('feature_usage', {
            feature,
            action,
            ...metadata
        });
    }

    // Folder analytics
    trackFolderAction(action, folderData = {}) {
        const safeData = {
            action, // 'created', 'accessed', 'deleted', 'modified'
            folderCount: folderData.folderCount || 0,
            transcriptionCount: folderData.transcriptionCount || 0,
            hasActivationPhrase: Boolean(folderData.hasActivationPhrase)
        };
        
        this.trackEvent('folder_action', safeData);
    }

    // Export tracking
    trackExport(format, itemCount = 1, source = 'unknown') {
        this.trackEvent('export_action', {
            format, // 'text', 'csv', 'json'
            itemCount,
            source // 'history', 'folder', 'single'
        });
    }

    // Recording session tracking
    trackRecordingSession(sessionData = {}) {
        const safeData = {
            duration: sessionData.duration || 0,
            wordCount: sessionData.wordCount || 0,
            service: sessionData.service || 'unknown',
            hasCleanup: Boolean(sessionData.hasCleanup),
            folderAssigned: Boolean(sessionData.folderId)
        };
        
        this.trackEvent('recording_session', safeData);
    }

    // Settings changes
    trackSettingChange(setting, newValue = null) {
        const safeData = {
            setting,
            valueType: typeof newValue,
            // Don't store actual values for privacy
            hasValue: newValue !== null && newValue !== undefined
        };
        
        this.trackEvent('setting_change', safeData);
    }

    // UI interaction tracking
    trackUIInteraction(element, action = 'click') {
        this.trackEvent('ui_interaction', {
            element,
            action
        });
    }

    // Error tracking (for debugging/improvement)
    trackError(errorType, context = '') {
        this.trackEvent('error_occurred', {
            errorType,
            context,
            page: this.getCurrentPage()
        });
    }

    // Privacy-safe utilities
    sanitizeProperties(properties) {
        const safe = {};
        
        for (const [key, value] of Object.entries(properties)) {
            // Only allow safe data types and specific whitelisted keys
            if (this.isSafeProperty(key, value)) {
                safe[key] = this.sanitizeValue(value);
            }
        }
        
        return safe;
    }

    isSafeProperty(key, value) {
        // Whitelist of allowed property keys
        const allowedKeys = [
            'feature', 'action', 'page', 'element', 'format', 'source',
            'duration', 'wordCount', 'service', 'setting', 'valueType',
            'hasValue', 'hasCleanup', 'folderAssigned', 'folderCount',
            'transcriptionCount', 'hasActivationPhrase', 'itemCount',
            'errorType', 'context', 'referrer'
        ];
        
        return allowedKeys.includes(key) && this.isSafeValue(value);
    }

    isSafeValue(value) {
        // Only allow safe data types
        if (value === null || value === undefined) return true;
        
        const type = typeof value;
        return ['string', 'number', 'boolean'].includes(type) && 
               (type !== 'string' || value.length < 100); // Limit string length
    }

    sanitizeValue(value) {
        if (typeof value === 'string') {
            // Remove any potentially sensitive data
            return value.toLowerCase().trim().substring(0, 50);
        }
        return value;
    }

    // Data aggregation and storage
    async aggregateAndStore() {
        if (!this.isEnabled || this.events.length === 0) return;

        try {
            const aggregatedData = this.aggregateEvents();
            await this.storeAggregatedData(aggregatedData);
            
            // Clear processed events
            this.events = [];
            
            console.log('📊 Analytics data aggregated and stored');
        } catch (error) {
            console.error('❌ Error storing analytics data:', error);
        }
    }

    aggregateEvents() {
        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];
        
        // Initialize aggregated structure
        const aggregated = {
            date: today,
            timestamp: now,
            sessionId: this.sessionId,
            sessionDuration: now - this.startTime,
            
            // Feature usage counts
            features: {},
            
            // Folder statistics
            folders: {
                actions: {},
                totalFolders: 0,
                totalTranscriptions: 0
            },
            
            // Export statistics
            exports: {
                byFormat: {},
                bySource: {},
                totalExports: 0,
                totalItemsExported: 0
            },
            
            // Recording statistics
            recordings: {
                totalSessions: 0,
                totalDuration: 0,
                totalWords: 0,
                services: {},
                withCleanup: 0,
                withFolder: 0
            },
            
            // UI interactions
            ui: {
                interactions: {},
                pageViews: {}
            },
            
            // Settings activity
            settings: {
                changes: {}
            },
            
            // Errors
            errors: {
                types: {}
            }
        };

        // Process each event
        this.events.forEach(event => {
            this.aggregateEvent(event, aggregated);
        });

        return aggregated;
    }

    aggregateEvent(event, aggregated) {
        const { type, properties } = event;

        switch (type) {
            case 'feature_usage':
                const feature = properties.feature || 'unknown';
                aggregated.features[feature] = (aggregated.features[feature] || 0) + 1;
                break;

            case 'folder_action':
                const action = properties.action || 'unknown';
                aggregated.folders.actions[action] = (aggregated.folders.actions[action] || 0) + 1;
                
                if (properties.folderCount) {
                    aggregated.folders.totalFolders = Math.max(aggregated.folders.totalFolders, properties.folderCount);
                }
                if (properties.transcriptionCount) {
                    aggregated.folders.totalTranscriptions += properties.transcriptionCount;
                }
                break;

            case 'export_action':
                const format = properties.format || 'unknown';
                const source = properties.source || 'unknown';
                const itemCount = properties.itemCount || 1;
                
                aggregated.exports.byFormat[format] = (aggregated.exports.byFormat[format] || 0) + 1;
                aggregated.exports.bySource[source] = (aggregated.exports.bySource[source] || 0) + 1;
                aggregated.exports.totalExports += 1;
                aggregated.exports.totalItemsExported += itemCount;
                break;

            case 'recording_session':
                aggregated.recordings.totalSessions += 1;
                aggregated.recordings.totalDuration += properties.duration || 0;
                aggregated.recordings.totalWords += properties.wordCount || 0;
                
                const service = properties.service || 'unknown';
                aggregated.recordings.services[service] = (aggregated.recordings.services[service] || 0) + 1;
                
                if (properties.hasCleanup) aggregated.recordings.withCleanup += 1;
                if (properties.folderAssigned) aggregated.recordings.withFolder += 1;
                break;

            case 'ui_interaction':
                const element = properties.element || 'unknown';
                aggregated.ui.interactions[element] = (aggregated.ui.interactions[element] || 0) + 1;
                break;

            case 'page_view':
                const page = properties.page || 'unknown';
                aggregated.ui.pageViews[page] = (aggregated.ui.pageViews[page] || 0) + 1;
                break;

            case 'setting_change':
                const setting = properties.setting || 'unknown';
                aggregated.settings.changes[setting] = (aggregated.settings.changes[setting] || 0) + 1;
                break;

            case 'error_occurred':
                const errorType = properties.errorType || 'unknown';
                aggregated.errors.types[errorType] = (aggregated.errors.types[errorType] || 0) + 1;
                break;
        }
    }

    async storeAggregatedData(aggregatedData) {
        try {
            // Get existing analytics data
            const result = await chrome.storage.local.get(['yapprUsageAnalytics']);
            const existingData = result.yapprUsageAnalytics || [];
            
            // Add new aggregated data
            existingData.push(aggregatedData);
            
            // Keep only last 90 days of data
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            const filteredData = existingData.filter(item => 
                new Date(item.timestamp) > cutoffDate
            );
            
            // Store back to chrome.storage
            await chrome.storage.local.set({ yapprUsageAnalytics: filteredData });
            
            console.log(`📊 Stored analytics data (${filteredData.length} entries)`);
        } catch (error) {
            console.error('❌ Error storing aggregated data:', error);
        }
    }

    async loadAnalyticsData() {
        try {
            const result = await chrome.storage.local.get(['yapprUsageAnalytics']);
            const existingData = result.yapprUsageAnalytics || [];
            console.log(`📊 Loaded ${existingData.length} existing analytics entries`);
            return existingData;
        } catch (error) {
            console.error('❌ Error loading analytics data:', error);
            return [];
        }
    }

    // Privacy controls
    async setAnalyticsEnabled(enabled) {
        this.isEnabled = enabled;
        await chrome.storage.sync.set({ analyticsEnabled: enabled });
        
        if (!enabled) {
            // Clear events when disabled
            this.events = [];
            console.log('📊 Analytics disabled - events cleared');
        } else {
            console.log('📊 Analytics enabled');
        }
    }

    async getAnalyticsEnabled() {
        const settings = await chrome.storage.sync.get(['analyticsEnabled']);
        return settings.analyticsEnabled !== false; // Default to enabled
    }

    async clearAnalyticsData() {
        try {
            await chrome.storage.local.remove(['yapprUsageAnalytics']);
            this.events = [];
            console.log('📊 All analytics data cleared');
        } catch (error) {
            console.error('❌ Error clearing analytics data:', error);
        }
    }

    async exportAnalyticsData() {
        try {
            const data = await this.loadAnalyticsData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `yappr-analytics-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('📊 Analytics data exported');
        } catch (error) {
            console.error('❌ Error exporting analytics data:', error);
        }
    }

    // Public API for other components
    getUsageStats() {
        return this.loadAnalyticsData();
    }

    // Utility methods
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        return page.replace('.html', '');
    }

    isCriticalEvent(eventType) {
        return ['error_occurred', 'recording_session'].includes(eventType);
    }

    // Cleanup on page unload
    async onBeforeUnload() {
        if (this.events.length > 0) {
            await this.aggregateAndStore();
        }
    }
}

// Global instance
let yapprTracker;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    yapprTracker = new YapprUsageTracker();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (yapprTracker) {
        yapprTracker.onBeforeUnload();
    }
});

// Export for use by other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YapprUsageTracker;
}