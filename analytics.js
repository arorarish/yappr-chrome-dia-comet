// Yappr Analytics Dashboard - Redesigned for 4 Key Sections
// 1. Speed of Talking (WPM) with ideal range
// 2. Most Common Filler Words (Bar Chart)
// 3. Filler Words Trends (Line Chart)
// 4. 7-Day AI Speech Analysis

class YapprAnalytics {
    constructor() {
        this.metricsDB = null;
        this.charts = {};
        this.currentRange = 7; // Default to last 7 days
        this.sessions = [];
        this.aggregatedData = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Yappr Analytics...');
        
        try {
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            // Verify required DOM elements exist
            this.verifyDOMElements();
            
            // Initialize IndexedDB connection
            await this.initDatabase();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load and display data
            await this.loadData();
            
            console.log('✅ Analytics dashboard ready');
        } catch (error) {
            console.error('💥 Failed to initialize analytics:', error);
            this.showError('Failed to load analytics data');
        }
    }

    verifyDOMElements() {
        const requiredElements = [
            'loadingState',
            'onboardingState', 
            'overviewStats',
            'totalSessions',
            'avgWPM',
            'totalWords',
            'avgFillers',
            'wpmTrendsChart',
            'fillerBarChart', 
            'fillerTrendsChart',
            'analysisStatus'
        ];
        
        const missingElements = requiredElements.filter(id => !document.getElementById(id));
        if (missingElements.length > 0) {
            console.warn('⚠️ Missing DOM elements:', missingElements);
        }
    }

    async initDatabase() {
        // Initialize the same MetricsDB as content script
        this.metricsDB = {
            dbName: 'YapprMetrics',
            dbVersion: 2,
            storeName: 'sessions',
            analysisStoreName: 'analyses',
            db: null
        };

        return new Promise((resolve, reject) => {
            console.log('Opening analytics database...');
            const request = indexedDB.open(this.metricsDB.dbName, this.metricsDB.dbVersion);
            
            request.onerror = () => {
                console.error('Failed to open analytics database:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.metricsDB.db = request.result;
                console.log('Analytics database connected successfully');
                resolve(this.metricsDB.db);
            };
            
            request.onupgradeneeded = (event) => {
                console.log('Upgrading analytics database schema...');
                const db = event.target.result;
                
                // Create sessions store if it doesn't exist
                if (!db.objectStoreNames.contains(this.metricsDB.storeName)) {
                    const sessionStore = db.createObjectStore(this.metricsDB.storeName, { 
                        keyPath: 'sessionId' 
                    });
                    sessionStore.createIndex('timestamp', 'timestamp', { unique: false });
                    sessionStore.createIndex('date', 'date', { unique: false });
                }
                
                // Create analyses store if it doesn't exist
                if (!db.objectStoreNames.contains(this.metricsDB.analysisStoreName)) {
                    const analysisStore = db.createObjectStore(this.metricsDB.analysisStoreName, { 
                        keyPath: 'id' 
                    });
                    analysisStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    setupEventListeners() {
        // Date range buttons
        document.querySelectorAll('.segmented-control button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const range = e.target.dataset.range;
                this.changeRange(range);
            });
        });

        // Get Started button
        const getStartedBtn = document.getElementById('getStartedBtn');
        if (getStartedBtn) {
            getStartedBtn.addEventListener('click', () => {
                window.close();
            });
        }

        // Debug: Add manual data check function for testing
        window.debugAnalytics = async () => {
            console.log('🔍 DEBUG: Manual data check...');
            try {
                const chromeResult = await chrome.storage.local.get(['yapprSessions']);
                console.log('Chrome Storage yapprSessions:', chromeResult.yapprSessions?.length || 0, 'sessions');
                if (chromeResult.yapprSessions?.length > 0) {
                    console.log('Sample session:', chromeResult.yapprSessions[0]);
                }
                
                // Try IndexedDB
                if (this.metricsDB.db) {
                    const indexedSessions = await new Promise((resolve) => {
                        const transaction = this.metricsDB.db.transaction([this.metricsDB.storeName], 'readonly');
                        const store = transaction.objectStore(this.metricsDB.storeName);
                        const request = store.getAll();
                        request.onsuccess = () => resolve(request.result || []);
                        request.onerror = () => resolve([]);
                    });
                    console.log('IndexedDB sessions:', indexedSessions.length);
                }
            } catch (error) {
                console.log('Debug error:', error);
            }
        };

        // Analysis button
        const runAnalysisBtn = document.getElementById('runAnalysisBtn');
        if (runAnalysisBtn) {
            runAnalysisBtn.addEventListener('click', () => {
                this.runSevenDayAnalysis();
            });
        }

        // Refresh analysis button
        const refreshAnalysisBtn = document.getElementById('refreshAnalysisBtn');
        if (refreshAnalysisBtn) {
            refreshAnalysisBtn.addEventListener('click', () => {
                this.runSevenDayAnalysis();
            });
        }
    }

    changeRange(range) {
        // Update active button
        document.querySelectorAll('.segmented-control button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === range);
        });
        
        // Convert range to number for filtering
        if (range === 'all') {
            this.currentRange = null; // null means all time
        } else {
            this.currentRange = parseInt(range);
        }
        
        console.log(`📅 Changed time range to: ${range === 'all' ? 'All Time' : range + ' days'}`);
        
        // Reload data with new range
        this.loadData();
    }

    filterSessionsByRange(sessions, rangeDays) {
        if (!rangeDays) {
            // Return all sessions for "All Time"
            return sessions;
        }
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - rangeDays);
        cutoffDate.setHours(0, 0, 0, 0); // Start of day
        
        return sessions.filter(session => {
            // Handle different timestamp formats
            let sessionDate;
            if (session.timestamp) {
                sessionDate = new Date(session.timestamp);
            } else if (session.date) {
                sessionDate = new Date(session.date);
            } else {
                // Fallback: assume recent if no date
                return true;
            }
            
            return sessionDate >= cutoffDate;
        });
    }

    async loadData() {
        console.log('📊 Loading analytics data...');
        
        try {
            // Show loading state
            this.showLoadingState();
            
            // Load sessions from IndexedDB
            const allSessions = await this.loadSessionsFromDB();
            
            // Filter sessions by selected date range
            this.sessions = this.filterSessionsByRange(allSessions, this.currentRange);
            console.log(`📊 Loaded ${allSessions.length} total sessions, filtered to ${this.sessions.length} for ${this.currentRange || 'all time'}`);
            
            if (this.sessions.length === 0) {
                this.showOnboardingState();
                return;
            }
            
            // Process and aggregate data
            this.aggregatedData = this.aggregateSessionData(this.sessions);
            console.log('📊 Aggregated data:', this.aggregatedData);
            
            // Update all UI components
            this.hideLoadingState();
            this.updateOverviewStats();
            this.renderCharts();
            this.updateAnalysisSection();
            
        } catch (error) {
            console.error('Error loading analytics data:', error);
            this.showError('Failed to load analytics data');
        }
    }

    async loadSessionsFromDB() {
        // First try IndexedDB
        if (this.metricsDB.db) {
            try {
                const sessions = await new Promise((resolve, reject) => {
                    const transaction = this.metricsDB.db.transaction([this.metricsDB.storeName], 'readonly');
                    const store = transaction.objectStore(this.metricsDB.storeName);
                    const request = store.getAll();
                    
                    request.onsuccess = () => {
                        const sessions = request.result || [];
                        console.log(`📊 Retrieved ${sessions.length} sessions from IndexedDB`);
                        resolve(sessions);
                    };
                    
                    request.onerror = () => {
                        console.error('Error loading sessions from IndexedDB:', request.error);
                        reject(request.error);
                    };
                });
                
                if (sessions.length > 0) {
                    return sessions;
                }
            } catch (error) {
                console.warn('Failed to load from IndexedDB:', error.message);
            }
        }

        // Fallback to Chrome Storage if IndexedDB is empty or fails
        try {
            console.log('📦 Trying Chrome Storage fallback...');
            const result = await chrome.storage.local.get(['yapprSessions']);
            const chromeStorageSessions = result.yapprSessions || [];
            console.log(`📊 Retrieved ${chromeStorageSessions.length} sessions from Chrome Storage`);
            return chromeStorageSessions;
        } catch (error) {
            console.error('Error loading sessions from Chrome Storage:', error);
            return [];
        }
    }

    aggregateSessionData(sessions) {
        console.log('📊 Aggregating session data...');
        
        if (!sessions || sessions.length === 0) {
            return {
                dailyData: [],
                totalSessions: 0,
                totalWords: 0,
                avgWPM: 0,
                avgFillers: 0,
                topFillerWords: [],
                dateRange: { start: null, end: null }
            };
        }

        // Group sessions by date for trends
        const dailyData = {};
        
        sessions.forEach(session => {
            const date = session.date || session.timestamp.split('T')[0];
            
            if (!dailyData[date]) {
                dailyData[date] = {
                    date,
                    sessions: [],
                    totalWords: 0,
                    totalDuration: 0,
                    totalFillers: 0,
                    sessionCount: 0
                };
            }
            
            const day = dailyData[date];
            day.sessions.push(session);
            day.totalWords += session.totalWords || 0;
            day.totalDuration += session.sessionDuration || 0;
            day.totalFillers += session.fillerWords || 0;
            day.sessionCount++;
        });
        
        // Calculate daily averages
        Object.values(dailyData).forEach(day => {
            day.avgWPM = day.totalDuration > 0 ? Math.round((day.totalWords / day.totalDuration) * 60) : 0;
            day.avgFillersPerMin = day.totalDuration > 0 ? Math.round((day.totalFillers / day.totalDuration) * 60 * 10) / 10 : 0;
        });
        
        // Sort by date
        const sortedDays = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Aggregate top filler words across all sessions
        const topFillerWords = this.aggregateTopFillerWords(sessions);
        
        return {
            dailyData: sortedDays,
            totalSessions: sessions.length,
            totalWords: sessions.reduce((sum, s) => sum + (s.totalWords || 0), 0),
            avgWPM: this.calculateOverallAverage(sessions, 'wordsPerMinute'),
            avgFillers: this.calculateOverallAverage(sessions, 'fillerWords'),
            topFillerWords,
            dateRange: {
                start: sortedDays[0]?.date,
                end: sortedDays[sortedDays.length - 1]?.date
            }
        };
    }

    aggregateTopFillerWords(sessions) {
        const fillerCounts = {};
        
        sessions.forEach(session => {
            if (session.fillerWordsBreakdown) {
                Object.entries(session.fillerWordsBreakdown).forEach(([word, count]) => {
                    fillerCounts[word] = (fillerCounts[word] || 0) + count;
                });
            }
        });
        
        // Convert to array and sort by count
        return Object.entries(fillerCounts)
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8); // Top 8 filler words
    }

    calculateOverallAverage(sessions, field) {
        if (!sessions || sessions.length === 0) return 0;
        const sum = sessions.reduce((acc, session) => acc + (session[field] || 0), 0);
        return Math.round(sum / sessions.length);
    }

    updateOverviewStats() {
        const data = this.aggregatedData;
        console.log('📊 Updating overview stats with data:', data);
        
        // Update stats with null checks
        const totalSessionsEl = document.getElementById('totalSessions');
        if (totalSessionsEl) totalSessionsEl.textContent = data.totalSessions?.toLocaleString() || '0';
        
        const avgWPMEl = document.getElementById('avgWPM');
        if (avgWPMEl) avgWPMEl.textContent = data.avgWPM || '0';
        
        const totalWordsEl = document.getElementById('totalWords');
        if (totalWordsEl) totalWordsEl.textContent = data.totalWords?.toLocaleString() || '0';
        
        const avgFillersEl = document.getElementById('avgFillers');
        if (avgFillersEl) avgFillersEl.textContent = data.avgFillers || '0';
        
        // Hide change indicators for now
        document.querySelectorAll('.overview-change').forEach(el => el.style.display = 'none');
        
        console.log('✅ Overview stats updated');
    }

    renderCharts() {
        console.log('📊 Rendering charts...');
        
        if (!this.aggregatedData || this.aggregatedData.dailyData.length === 0) {
            console.log('No data available for charts');
            return;
        }

        this.renderWPMTrendsChart();
        this.renderFillerBarChart();
        this.renderFillerTrendsChart();
    }

    renderWPMTrendsChart() {
        const canvas = document.getElementById('wpmTrendsChart');
        if (!canvas) {
            console.error('WPM trends chart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        const dailyData = this.aggregatedData.dailyData;
        
        // Get last 7 days of data
        const last7Days = dailyData.slice(-7);
        const labels = last7Days.map(day => new Date(day.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        }));

        // Destroy existing chart if it exists
        if (this.charts.wpmTrends) {
            this.charts.wpmTrends.destroy();
        }

        this.charts.wpmTrends = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Your WPM',
                    data: last7Days.map(day => day.avgWPM),
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#4ade80',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }, {
                    label: 'Ideal Range (140-160)',
                    data: labels.map(() => 150), // Show ideal midpoint
                    borderColor: 'rgba(59, 130, 246, 0.3)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 100,
                        max: 200,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#e2e8f0' }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#e2e8f0' }
                    }
                }
            }
        });

        console.log('✅ WPM trends chart rendered');
    }

    renderFillerBarChart() {
        const canvas = document.getElementById('fillerBarChart');
        if (!canvas) {
            console.error('Filler bar chart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        const topFillers = this.aggregatedData.topFillerWords;

        if (topFillers.length === 0) {
            // Show "no data" message
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#64748b';
            ctx.font = '16px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('No filler words detected yet', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Destroy existing chart if it exists
        if (this.charts.fillerBar) {
            this.charts.fillerBar.destroy();
        }

        this.charts.fillerBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: topFillers.map(f => f.word),
                datasets: [{
                    label: 'Count',
                    data: topFillers.map(f => f.count),
                    backgroundColor: [
                        '#ef4444', '#f97316', '#f59e0b', '#eab308',
                        '#84cc16', '#22c55e', '#06b6d4', '#3b82f6'
                    ],
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#e2e8f0' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#e2e8f0' }
                    }
                }
            }
        });

        console.log('✅ Filler bar chart rendered');
    }

    renderFillerTrendsChart() {
        const canvas = document.getElementById('fillerTrendsChart');
        if (!canvas) {
            console.error('Filler trends chart canvas not found');
            return;
        }

        const ctx = canvas.getContext('2d');
        const dailyData = this.aggregatedData.dailyData;
        
        // Get last 7 days of data
        const last7Days = dailyData.slice(-7);
        const labels = last7Days.map(day => new Date(day.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        }));

        // Destroy existing chart if it exists
        if (this.charts.fillerTrends) {
            this.charts.fillerTrends.destroy();
        }

        this.charts.fillerTrends = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Fillers Per Minute',
                    data: last7Days.map(day => day.avgFillersPerMin),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#e2e8f0' }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#e2e8f0' }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#e2e8f0' }
                    }
                }
            }
        });

        console.log('✅ Filler trends chart rendered');
    }

    updateAnalysisSection() {
        const analysisBtn = document.getElementById('runAnalysisBtn');
        const hasSevenDays = this.aggregatedData.dailyData.length >= 7;
        
        if (analysisBtn) {
            analysisBtn.disabled = !hasSevenDays;
            
            if (hasSevenDays) {
                analysisBtn.textContent = 'Analyze Speech Patterns';
                document.getElementById('analysisPlaceholder').querySelector('p').textContent = 
                    'Ready for AI analysis of your speech patterns';
            }
        }

        // Check if we have a recent analysis to display
        this.loadRecentAnalysis();
    }

    async loadRecentAnalysis() {
        // Implementation for loading recent analysis from storage
        // This would check for existing analysis within the last 24 hours
        console.log('📊 Checking for recent analysis...');
    }

    async runSevenDayAnalysis() {
        console.log('🧠 Running 7-day speech analysis...');
        
        // Show loading state
        document.getElementById('analysisPlaceholder').style.display = 'none';
        document.getElementById('analysisResults').style.display = 'none';
        document.getElementById('analysisLoading').style.display = 'block';

        try {
            // Get last 7 days of sessions
            const last7Days = this.aggregatedData.dailyData.slice(-7);
            const recentSessions = last7Days.flatMap(day => day.sessions);
            
            if (recentSessions.length === 0) {
                throw new Error('No sessions found for analysis');
            }

            // Get transcription texts for analysis
            const transcriptionTexts = await this.getTranscriptionTexts(recentSessions);
            
            if (transcriptionTexts.length === 0) {
                throw new Error('No transcription texts found');
            }

            // Get OpenAI API key
            const openaiKey = await this.getOpenAIKey();
            if (!openaiKey) {
                throw new Error('OpenAI API key required for analysis');
            }

            // Call OpenAI API for analysis
            const analysis = await this.callOpenAIAnalysis(transcriptionTexts, openaiKey);
            
            // Display results
            this.displayAnalysisResults(analysis);
            
            // Save analysis to storage
            await this.saveAnalysis(analysis);
            
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showAnalysisError(error.message);
        }
    }

    async getTranscriptionTexts(sessions) {
        // This would fetch the actual transcription texts
        // For now, return sample data
        return sessions.map(s => s.sampleText || 'Sample transcription text').filter(Boolean);
    }

    async getOpenAIKey() {
        try {
            const result = await chrome.storage.sync.get('gptApiKey');
            return result.gptApiKey || '';
        } catch (error) {
            console.error('Failed to get OpenAI key:', error);
            return '';
        }
    }

    async callOpenAIAnalysis(texts, apiKey) {
        const prompt = `Analyze these speech patterns from the last 7 days of transcriptions. Focus on:
1. Clarity of thought - Are ideas expressed concisely?
2. Verbosity - Any unnecessary repetition or wordiness?  
3. Vocabulary richness - Variety and sophistication of word choice
4. Filler word usage patterns

Provide 2-3 specific examples of sentences/phrases that could be improved, showing both the original and a suggested improvement. Keep feedback constructive and actionable for casual conversation improvement.

Transcriptions:
${texts.slice(0, 5).join('\n\n---\n\n')}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful speech coach providing constructive feedback on casual conversation patterns.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 800,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || 'No analysis available';
    }

    displayAnalysisResults(analysis) {
        document.getElementById('analysisLoading').style.display = 'none';
        document.getElementById('analysisResults').style.display = 'block';
        document.getElementById('analysisText').textContent = analysis;
    }

    showAnalysisError(message) {
        document.getElementById('analysisLoading').style.display = 'none';
        document.getElementById('analysisPlaceholder').style.display = 'block';
        
        const placeholder = document.getElementById('analysisPlaceholder');
        placeholder.querySelector('p').textContent = `Analysis failed: ${message}`;
        placeholder.querySelector('button').textContent = 'Retry Analysis';
    }

    async saveAnalysis(analysis) {
        // Save analysis to IndexedDB for future reference
        if (!this.metricsDB.db) return;

        const analysisData = {
            id: `analysis-${Date.now()}`,
            timestamp: new Date().toISOString(),
            content: analysis,
            dateRange: this.aggregatedData.dateRange
        };

        const transaction = this.metricsDB.db.transaction([this.metricsDB.analysisStoreName], 'readwrite');
        const store = transaction.objectStore(this.metricsDB.analysisStoreName);
        
        try {
            await store.add(analysisData);
            console.log('✅ Analysis saved to storage');
        } catch (error) {
            console.error('Failed to save analysis:', error);
        }
    }

    showLoadingState() {
        document.getElementById('loadingState').style.display = 'block';
        document.getElementById('onboardingState').style.display = 'none';
        document.getElementById('overviewStats').style.display = 'none';
    }

    hideLoadingState() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('overviewStats').style.display = 'grid';
    }

    showOnboardingState() {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('onboardingState').style.display = 'block';
        document.getElementById('overviewStats').style.display = 'none';
    }

    showError(message) {
        console.error('Analytics error:', message);
        // Could show a toast or error message in the UI
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('onboardingState').style.display = 'block';
        
        const onboardingTitle = document.querySelector('#onboardingState h2');
        if (onboardingTitle) {
            onboardingTitle.textContent = 'Error Loading Analytics';
        }
    }
}

// Initialize analytics when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 Initializing Yappr Analytics...');
    window.yapprAnalytics = new YapprAnalytics();
});