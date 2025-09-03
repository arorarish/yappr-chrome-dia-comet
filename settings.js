// Yappr Settings - Streamlined for ElevenLabs STT + OpenAI AI Features
// Phase 2: Removed OpenAI STT, unified OpenAI key for all AI features

class YapprSettings {
    constructor() {
        this.validateKeyTimeout = null;
        this.elements = {};
        this.init();
    }

    async init() {
        console.log('🚀 Initializing Yappr Settings...');
        
        try {
            console.log('🔄 Step 1: Loading elements...');
            await this.loadElements();
            
            console.log('🔄 Step 2: Loading stored values...');
            await this.loadStoredValues();
            
            console.log('🔄 Step 3: Setting up event listeners...');
            this.setupEventListeners();
            
            console.log('🔄 Step 4: Setting up storage listener...');
            this.setupStorageListener();
            
            console.log('✅ Settings initialized successfully');
        } catch (error) {
            console.error('❌ Settings initialization failed:', error);
            console.error('Error details:', error);
        }
    }

    setupStorageListener() {
        // Listen for changes to preset data and automatically reload UI
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                let shouldReloadPresets = false;
                
                // Check if preset-related data changed
                if (changes.presets || changes.selectedPresetId) {
                    shouldReloadPresets = true;
                }
                
                if (shouldReloadPresets) {
                    console.log('🔄 Storage changed, reloading preset data...');
                    this.loadPresetDataFromStorage();
                }
            }
        });
    }

    async loadPresetDataFromStorage() {
        try {
            const storage = await chrome.storage.sync.get(['presets', 'selectedPresetId']);
            await this.loadPresetData(storage);
        } catch (error) {
            console.error('❌ Error reloading preset data from storage:', error);
        }
    }

    async loadElements() {
        this.elements = {
            // API Key inputs - SIMPLIFIED: Only ElevenLabs + OpenAI (for AI features)
            elevenlabsApiKey: document.getElementById('elevenlabsApiKey'),
            gptApiKey: document.getElementById('gptApiKey'), // Now unified OpenAI key
            
            // Status indicators
            elevenlabsStatus: document.getElementById('elevenlabsStatus'),
            gptStatus: document.getElementById('gptStatus'),
            
            // Error messages
            elevenlabsError: document.getElementById('elevenlabsError'),
            gptError: document.getElementById('gptError'),
            
            // Note: Text cleanup and analysis features removed - now handled by presets
            
            // Preset Management features
            currentPresetDisplay: document.getElementById('currentPresetDisplay'),
            currentPresetName: document.getElementById('currentPresetName'),
            usageStats: document.getElementById('usageStats'),
            presetsList: document.getElementById('presetsList'),
            presetCount: document.getElementById('presetCount'),
            addPresetBtn: document.getElementById('addPresetBtn'),
            testPresetBtn: document.getElementById('testPresetBtn'),
            testResults: document.getElementById('testResults'),
            
            // Preset editor modal (reuse existing modal)
            presetEditorModal: document.getElementById('presetEditorModal'),
            presetName: document.getElementById('presetName'),
            presetDomains: document.getElementById('presetDomains'),
            presetPrompt: document.getElementById('presetPrompt'),
            promptCharCount: document.getElementById('promptCharCount'),
            presetEnabledToggle: document.getElementById('presetEnabledToggle'),
            cancelPresetEdit: document.getElementById('cancelPresetEdit'),
            savePresetEdit: document.getElementById('savePresetEdit'),
            modalClose: document.querySelectorAll('.modal-close'),
            modalOverlay: document.querySelector('.modal-overlay'),
            
            // Action buttons
            testAllBtn: document.getElementById('testAllBtn'),
            saveBtn: document.getElementById('saveBtn'),
            successMessage: document.getElementById('successMessage')
        };

        // Debug log missing elements
        const missingElements = Object.keys(this.elements).filter(key => !this.elements[key]);
        if (missingElements.length > 0) {
            console.warn('⚠️ Missing elements:', missingElements);
        }
        
        // Debug preset-related elements specifically
        console.log('🔍 Preset elements check:', {
            presetsList: !!this.elements.presetsList,
            presetCount: !!this.elements.presetCount,
            currentPresetName: !!this.elements.currentPresetName,
            usageStats: !!this.elements.usageStats
        });
    }

    async loadStoredValues() {
        try {
            // Load only the keys we need: ElevenLabs + OpenAI + Presets
            const storage = await chrome.storage.sync.get([
                'elevenlabsApiKey', 
                'gptApiKey',
                'enableCleanup',
                'cleanupPrompt',
                'enableAnalysis',
                'analysisSchedule',
                'presets',
                'selectedPresetId'
            ]);

            console.log('📊 Loaded settings:', Object.keys(storage));

            // Populate API key fields
            if (this.elements.elevenlabsApiKey && storage.elevenlabsApiKey) {
                this.elements.elevenlabsApiKey.value = storage.elevenlabsApiKey;
                this.updateStatus('elevenlabs', 'success');
            }

            if (this.elements.gptApiKey && storage.gptApiKey) {
                this.elements.gptApiKey.value = storage.gptApiKey;
                this.updateStatus('gpt', 'success');
            }

            // Load feature toggles
            if (this.elements.enableCleanup) {
                const isEnabled = storage.enableCleanup === true;
                this.elements.enableCleanup.setAttribute('aria-checked', isEnabled);
                this.elements.enableCleanup.classList.toggle('active', isEnabled);
                this.toggleCleanupPrompt(isEnabled);
            }

            if (this.elements.cleanupPrompt && storage.cleanupPrompt) {
                this.elements.cleanupPrompt.value = storage.cleanupPrompt;
            }

            // Load analysis settings
            if (this.elements.enableAnalysis) {
                const isEnabled = storage.enableAnalysis === true;
                this.elements.enableAnalysis.setAttribute('aria-checked', isEnabled);
                this.elements.enableAnalysis.classList.toggle('active', isEnabled);
                this.toggleAnalysisSchedule(isEnabled);
            }

            // Load analysis schedule
            const schedule = storage.analysisSchedule || 'manual';
            const scheduleInput = document.querySelector(`input[name="analysisSchedule"][value="${schedule}"]`);
            if (scheduleInput) {
                scheduleInput.checked = true;
            }

            // Load preset management data
            await this.loadPresetData(storage);

        } catch (error) {
            console.error('❌ Error loading stored values:', error);
        }
    }

    async loadPresetData(storage) {
        try {
            let { presets = {}, selectedPresetId = null } = storage;
            
            console.log('🔍 Settings: Loading preset data...', { 
                presetCount: Object.keys(presets).length, 
                selectedPresetId,
                presetKeys: Object.keys(presets)
            });
            
            // If no presets exist, create default ones
            if (Object.keys(presets).length === 0) {
                console.log('🎯 Settings: No presets found, creating defaults...');
                presets = await this.createDefaultPresets();
                console.log('✅ Settings: Default presets created:', Object.keys(presets));
            }
            
            // Update current preset display
            this.updateCurrentPresetDisplay(selectedPresetId, presets);
            
            // Update usage statistics
            this.updateUsageStats(presets);
            
            // Update presets list
            this.updatePresetsList(presets);
            
            console.log('✅ Settings: Preset data loading complete');
            
        } catch (error) {
            console.error('❌ Error loading preset data:', error);
        }
    }

    async createDefaultPresets() {
        try {
            const defaultPresets = {
                'default-email': {
                    id: 'default-email',
                    name: 'Email',
                    prompt: `Reformat the user message.
- Structure it for email communication.
- Include a greeting and a sign-off.
- Check for correct grammar and punctuation.
- Do not change the tone.
- Do not use markdown.
- Use as much of the original text as possible.
- Sign off each email just "Thanks," or "Cheers,".
- If the name of the recipient isn't known use "Hey," for greeting.

Original transcript: {transcript}`,
                    isSystem: true,
                    enabled: true,
                    usageCount: 0,
                    createdAt: new Date().toISOString(),
                    lastUsed: null
                },
                'default-professional': {
                    id: 'default-professional',
                    name: 'Professional',
                    prompt: `Transform this transcript into polished, professional content suitable for business communication.

Guidelines:
- Use formal, professional language
- Remove all filler words and casual expressions
- Structure with clear paragraphs and logical flow
- Add appropriate transitions between ideas
- Ensure proper grammar and punctuation
- Maintain authoritative yet approachable tone
- Include actionable insights or conclusions

Focus on: Professional credibility, clarity, and business-appropriate communication.

Original transcript: {transcript}`,
                    isSystem: true,
                    enabled: true,
                    usageCount: 0,
                    createdAt: new Date().toISOString(),
                    lastUsed: null
                },
                'default-basic': {
                    id: 'default-basic',
                    name: 'Basic',
                    prompt: `Clean up this transcription by following these rules:

1. Remove filler words: "um", "uh", "er", "ah", "like", "you know", "so", "well", "anyway", "basically", "literally", "actually", "I mean"
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
                    isSystem: true,
                    enabled: true,
                    usageCount: 0,
                    createdAt: new Date().toISOString(),
                    lastUsed: null
                }
            };

            // Save to storage
            await chrome.storage.sync.set({ presets: defaultPresets });
            console.log('✅ Settings: Created 3 default presets');
            
            return defaultPresets;
        } catch (error) {
            console.error('❌ Settings: Failed to create default presets:', error);
            return {};
        }
    }

    updateCurrentPresetDisplay(selectedPresetId, presets) {
        if (!this.elements.currentPresetName) return;
        
        const presetDot = document.querySelector('.preset-dot');
        
        if (selectedPresetId && presets[selectedPresetId]) {
            const preset = presets[selectedPresetId];
            this.elements.currentPresetName.textContent = preset.name;
            if (presetDot) {
                presetDot.classList.add('active');
            }
        } else {
            this.elements.currentPresetName.textContent = 'Off (No enhancement)';
            if (presetDot) {
                presetDot.classList.remove('active');
            }
        }
    }

    updateUsageStats(presets) {
        if (!this.elements.usageStats) return;
        
        const usageArray = Object.values(presets)
            .filter(preset => preset.usageCount > 0)
            .sort((a, b) => b.usageCount - a.usageCount)
            .slice(0, 5); // Top 5 most used
        
        if (usageArray.length === 0) {
            this.elements.usageStats.innerHTML = '<div class="usage-item">No presets used yet</div>';
            return;
        }
        
        this.elements.usageStats.innerHTML = usageArray.map(preset => `
            <div class="usage-item">
                <span class="usage-preset-name">${preset.name}</span>
                <span class="usage-count">${preset.usageCount} uses</span>
            </div>
        `).join('');
    }

    updatePresetsList(presets) {
        console.log('🔍 Settings: updatePresetsList called with:', { 
            presetsCount: Object.keys(presets).length,
            elementExists: !!this.elements.presetsList 
        });
        
        if (!this.elements.presetsList) {
            console.error('❌ Settings: presetsList element not found!');
            return;
        }
        
        const presetArray = Object.values(presets).sort((a, b) => {
            // System presets first, then custom presets
            if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        
        console.log('🔍 Settings: Rendering', presetArray.length, 'presets:', presetArray.map(p => p.name));
        
        this.elements.presetsList.innerHTML = presetArray.map(preset => `
            <div class="preset-card" data-preset-id="${preset.id}">
                <div class="preset-header">
                    <div class="preset-info">
                        <div class="preset-name">
                            <span class="material-icons preset-icon">${this.getPresetIcon(preset.id)}</span>
                            ${preset.name}
                            ${preset.isSystem ? ' ✨' : ''}
                        </div>
                        <div class="preset-domains">${this.getPresetDescription(preset)}</div>
                    </div>
                    <div class="preset-controls">
                        <div class="toggle small ${preset.enabled ? 'active' : ''}" 
                             data-preset-id="${preset.id}" 
                             role="switch" 
                             aria-checked="${preset.enabled}" 
                             tabindex="0">
                            <div class="toggle-slider"></div>
                        </div>
                        <button class="btn-ghost btn-small edit-preset-btn" data-preset-id="${preset.id}">
                            <span class="material-icons">edit</span>
                        </button>
                        ${!preset.isSystem ? `
                            <button class="btn-ghost btn-small delete-preset-btn" data-preset-id="${preset.id}">
                                <span class="material-icons">delete</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="preset-description">${preset.prompt.substring(0, 100)}...</div>
            </div>
        `).join('');
        
        // Update preset count
        if (this.elements.presetCount) {
            this.elements.presetCount.textContent = presetArray.length;
        }
        
        // Add event listeners to the new elements
        this.setupPresetListeners();
    }

    getPresetIcon(presetId) {
        const icons = {
            'default-email': 'email',
            'default-professional': 'business',
            'default-basic': 'cleaning_services'
        };
        return icons[presetId] || 'auto_fix_high';
    }

    getPresetDescription(preset) {
        if (preset.isSystem) {
            const descriptions = {
                'default-email': 'Professional email structure',
                'default-professional': 'Formal tone and language',
                'default-basic': 'Remove filler words, fix grammar'
            };
            return descriptions[preset.id] || 'System preset';
        }
        return `Custom preset • ${preset.usageCount || 0} uses`;
    }

    setupEventListeners() {
        // API Key validation with debouncing
        if (this.elements.elevenlabsApiKey) {
            this.elements.elevenlabsApiKey.addEventListener('input', () => this.debouncedValidateKey('elevenlabs'));
            this.elements.elevenlabsApiKey.addEventListener('blur', () => this.validateKey('elevenlabs'));
        }

        if (this.elements.gptApiKey) {
            this.elements.gptApiKey.addEventListener('input', () => this.debouncedValidateKey('gpt'));
            this.elements.gptApiKey.addEventListener('blur', () => this.validateKey('gpt'));
        }

        // Feature toggles
        if (this.elements.enableCleanup) {
            this.elements.enableCleanup.addEventListener('click', () => this.toggleCleanup());
            this.elements.enableCleanup.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleCleanup();
                }
            });
        }

        if (this.elements.enableAnalysis) {
            this.elements.enableAnalysis.addEventListener('click', () => this.toggleAnalysis());
            this.elements.enableAnalysis.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleAnalysis();
                }
            });
        }

        // Preset management buttons
        if (this.elements.addPresetBtn) {
            this.elements.addPresetBtn.addEventListener('click', () => this.showAddPresetDialog());
        }

        if (this.elements.testPresetBtn) {
            this.elements.testPresetBtn.addEventListener('click', () => this.testCurrentPreset());
        }

        // Modal functionality (reused for preset editing)
        if (this.elements.presetEditorModal) {
            // Close modal buttons
            if (this.elements.modalClose) {
                this.elements.modalClose.forEach(btn => {
                    btn.addEventListener('click', () => this.closePresetEditor());
                });
            }

            // Close on overlay click
            if (this.elements.modalOverlay) {
                this.elements.modalOverlay.addEventListener('click', () => this.closePresetEditor());
            }

            // Cancel button
            if (this.elements.cancelPresetEdit) {
                this.elements.cancelPresetEdit.addEventListener('click', () => this.closePresetEditor());
            }

            // Save button
            if (this.elements.savePresetEdit) {
                this.elements.savePresetEdit.addEventListener('click', () => this.savePresetChanges());
            }

            // Character counter for prompt textarea
            if (this.elements.presetPrompt) {
                this.elements.presetPrompt.addEventListener('input', () => this.updateCharacterCounter());
            }

            // Toggle in modal
            if (this.elements.presetEnabledToggle) {
                this.elements.presetEnabledToggle.addEventListener('click', () => this.toggleModalPreset());
                this.elements.presetEnabledToggle.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.toggleModalPreset();
                    }
                });
            }
        }

        // Setup initial preset listeners
        this.setupPresetListeners();

        // Action buttons
        if (this.elements.testAllBtn) {
            this.elements.testAllBtn.addEventListener('click', () => this.testAllKeys());
        }

        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', () => this.saveSettings());
        }

        if (this.elements.resetPromptBtn) {
            this.elements.resetPromptBtn.addEventListener('click', () => this.resetCleanupPrompt());
        }


    }

    debouncedValidateKey(service) {
        clearTimeout(this.validateKeyTimeout);
        this.validateKeyTimeout = setTimeout(() => this.validateKey(service), 500);
    }

    async validateKey(service) {
        const element = this.elements[`${service}ApiKey`];
        if (!element) return;

        const apiKey = element.value.trim();
        
        if (!apiKey) {
            this.updateStatus(service, 'empty');
            return;
        }

        this.updateStatus(service, 'validating');

        try {
            const isValid = await this.testApiKey(service, apiKey);
            this.updateStatus(service, isValid ? 'success' : 'error');
            
            if (!isValid) {
                this.showError(service, 'Invalid API key format or authentication failed');
            } else {
                this.clearError(service);
            }
        } catch (error) {
            console.error(`Error validating ${service} key:`, error);
            this.updateStatus(service, 'error');
            this.showError(service, 'Unable to validate API key');
        }
    }

    async testApiKey(service, apiKey) {
        if (service === 'elevenlabs') {
            // ElevenLabs key validation - basic format check
            return apiKey.length > 10; // Simple validation
        } else if (service === 'gpt') {
            // OpenAI key validation
            if (!apiKey.startsWith('sk-')) return false;
            
            try {
                const response = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                return response.ok;
            } catch (error) {
                console.error('OpenAI API test failed:', error);
                return false;
            }
        }
        return false;
    }

    updateStatus(service, status) {
        const statusElement = this.elements[`${service}Status`];
        if (!statusElement) return;

        statusElement.className = `status-indicator status-indicator--${status}`;
        
        const symbols = {
            empty: '○',
            validating: '◐',
            success: '●',
            error: '●'
        };
        
        statusElement.textContent = symbols[status] || '○';
    }

    showError(service, message) {
        const errorElement = this.elements[`${service}Error`];
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    clearError(service) {
        const errorElement = this.elements[`${service}Error`];
        if (errorElement) {
            errorElement.style.display = 'none';
            errorElement.textContent = '';
        }
    }

    toggleCleanup() {
        const isEnabled = this.elements.enableCleanup.getAttribute('aria-checked') === 'true';
        const newState = !isEnabled;
        
        this.elements.enableCleanup.setAttribute('aria-checked', newState);
        this.elements.enableCleanup.classList.toggle('active', newState);
        
        this.toggleCleanupPrompt(newState);
    }

    toggleCleanupPrompt(show) {
        if (this.elements.cleanupPromptGroup) {
            this.elements.cleanupPromptGroup.style.display = show ? 'block' : 'none';
        }
    }

    toggleAnalysis() {
        const isEnabled = this.elements.enableAnalysis.getAttribute('aria-checked') === 'true';
        const newState = !isEnabled;
        
        this.elements.enableAnalysis.setAttribute('aria-checked', newState);
        this.elements.enableAnalysis.classList.toggle('active', newState);
        this.toggleAnalysisSchedule(newState);
    }

    toggleAnalysisSchedule(show) {
        // This method would show/hide analysis schedule options if they existed in the UI
        // For now, it's a placeholder to prevent the error
        console.log('🔄 Analysis schedule toggle:', show);
    }

    async testAllKeys() {
        console.log('🧪 Testing all API keys...');
        
        const tests = [];
        
        if (this.elements.elevenlabsApiKey?.value.trim()) {
            tests.push(this.validateKey('elevenlabs'));
        }
        
        if (this.elements.gptApiKey?.value.trim()) {
            tests.push(this.validateKey('gpt'));
        }

        try {
            await Promise.all(tests);
            this.showSuccessMessage('API key validation complete');
        } catch (error) {
            console.error('Error testing keys:', error);
        }
    }

    setupPresetListeners() {
        // Handle dynamic preset card interactions using event delegation
        document.addEventListener('click', (e) => {
            // Toggle preset enabled/disabled
            if (e.target.matches('.toggle[data-preset-id]') || e.target.closest('.toggle[data-preset-id]')) {
                const toggle = e.target.matches('.toggle[data-preset-id]') ? e.target : e.target.closest('.toggle[data-preset-id]');
                const presetId = toggle.dataset.presetId;
                if (presetId) {
                    this.togglePresetEnabled(presetId);
                }
            }
            
            // Edit preset button
            if (e.target.matches('.edit-preset-btn') || e.target.closest('.edit-preset-btn')) {
                const btn = e.target.matches('.edit-preset-btn') ? e.target : e.target.closest('.edit-preset-btn');
                const presetId = btn.dataset.presetId;
                if (presetId) {
                    this.editPreset(presetId);
                }
            }
            
            // Delete preset button
            if (e.target.matches('.delete-preset-btn') || e.target.closest('.delete-preset-btn')) {
                const btn = e.target.matches('.delete-preset-btn') ? e.target : e.target.closest('.delete-preset-btn');
                const presetId = btn.dataset.presetId;
                if (presetId) {
                    this.deletePreset(presetId);
                }
            }
        });
    }

    async showAddPresetDialog() {
        try {
            // Check if user can add more presets (max 2 custom presets)
            const { presets = {} } = await chrome.storage.sync.get(['presets']);
            const customPresets = Object.values(presets).filter(preset => !preset.isSystem);
            
            if (customPresets.length >= 2) {
                alert('Maximum of 2 custom presets allowed. Delete an existing custom preset to add a new one.');
                return;
            }
            
            // Open modal for creating new preset
            this.currentEditingPreset = null; // null = new preset
            
            // Clear and setup form for new preset
            if (this.elements.presetName) {
                this.elements.presetName.value = '';
                this.elements.presetName.readOnly = false;
                this.elements.presetName.placeholder = 'Enter preset name...';
            }
            
            // Hide domains field for custom presets
            if (this.elements.presetDomains && this.elements.presetDomains.parentElement) {
                this.elements.presetDomains.parentElement.style.display = 'none';
            }
            
            if (this.elements.presetPrompt) {
                this.elements.presetPrompt.value = '';
                this.elements.presetPrompt.placeholder = 'Enter your enhancement prompt here...\n\nExample: Transform this transcript into engaging social media content with:\n- Clear, concise language\n- Relevant hashtags\n- Call to action\n\nOriginal transcript: {transcript}';
            }
            
            // Set preset as enabled by default
            if (this.elements.presetEnabledToggle) {
                this.elements.presetEnabledToggle.setAttribute('aria-checked', 'true');
                this.elements.presetEnabledToggle.classList.add('active');
            }
            
            // Update modal title
            const title = document.getElementById('presetEditorTitle');
            if (title) {
                title.textContent = 'Create New Preset';
            }
            
            this.updateCharacterCounter();
            
            // Show modal
            if (this.elements.presetEditorModal) {
                this.elements.presetEditorModal.style.display = 'flex';
                // Focus on preset name field after modal opens
                setTimeout(() => {
                    if (this.elements.presetName) {
                        this.elements.presetName.focus();
                    }
                }, 100);
            }
            
        } catch (error) {
            console.error('❌ Error opening add preset dialog:', error);
            alert('Error opening preset dialog. Please try again.');
        }
    }

    async testCurrentPreset() {
        try {
            // Get currently selected preset
            const { selectedPresetId, presets } = await chrome.storage.sync.get(['selectedPresetId', 'presets']);
            
            if (!selectedPresetId || !presets || !presets[selectedPresetId]) {
                alert('No preset selected. Please select a preset in the popup first.');
                return;
            }
            
            const preset = presets[selectedPresetId];
            const sampleText = "Um, so I was thinking, you know, about how we could, like, improve our, uh, marketing strategy. I think we should definitely focus on, um, social media and maybe, you know, create more engaging content that really, like, resonates with our target audience.";
            
            // Show test results
            if (this.elements.testResults) {
                this.elements.testResults.style.display = 'block';
                this.elements.testResults.innerHTML = `
                    <div class="test-result-item">
                        <div class="test-result-label">Selected Preset: ${preset.name}</div>
                        <div class="test-result-content">${preset.prompt}</div>
                    </div>
                    <div class="test-result-item">
                        <div class="test-result-label">Sample Input</div>
                        <div class="test-result-content">${sampleText}</div>
                    </div>
                    <div class="test-result-item">
                        <div class="test-result-label">Expected Processing</div>
                        <div class="test-result-content">This sample text would be processed using the above prompt when you record with this preset selected. The actual enhancement happens during recording.</div>
                    </div>
                `;
            }
            
            console.log('🧪 Preset test completed:', { presetId: selectedPresetId, presetName: preset.name });
            
        } catch (error) {
            console.error('❌ Error testing preset:', error);
            alert('Error testing preset. Please try again.');
        }
    }

    async togglePresetEnabled(presetId) {
        try {
            console.log('🔄 Toggling preset enabled:', presetId);
            
            // Get current presets from storage
            const { presets = {} } = await chrome.storage.sync.get(['presets']);
            
            if (!presets[presetId]) {
                console.error('Preset not found:', presetId);
                return;
            }
            
            // Toggle the enabled state
            presets[presetId].enabled = !presets[presetId].enabled;
            
            // Save back to storage
            await chrome.storage.sync.set({ presets });
            
            console.log(`✅ Preset ${presetId} ${presets[presetId].enabled ? 'enabled' : 'disabled'}`);
            
            // UI will be updated automatically by storage change listener
            
        } catch (error) {
            console.error('❌ Error toggling preset:', error);
            alert('Error updating preset. Please try again.');
        }
    }

    async editPreset(presetId) {
        try {
            console.log('✏️ Editing preset:', presetId);
            
            // Get preset data from storage
            const { presets = {} } = await chrome.storage.sync.get(['presets']);
            const preset = presets[presetId];
            
            if (!preset) {
                console.error('Preset not found:', presetId);
                alert('Preset not found.');
                return;
            }
            
            // Set current editing preset
            this.currentEditingPreset = presetId;
            
            // Populate modal with preset data
            if (this.elements.presetName) {
                this.elements.presetName.value = preset.name;
                this.elements.presetName.readOnly = preset.isSystem; // System presets can't be renamed
            }
            
            // Show/hide domains field based on preset type
            if (this.elements.presetDomains && this.elements.presetDomains.parentElement) {
                if (preset.isSystem) {
                    this.elements.presetDomains.value = preset.domains || 'Universal (works on all websites)';
                    this.elements.presetDomains.parentElement.style.display = 'block';
                } else {
                    this.elements.presetDomains.parentElement.style.display = 'none';
                }
            }
            
            if (this.elements.presetPrompt) {
                this.elements.presetPrompt.value = preset.prompt || '';
            }
            
            // Set enabled state
            if (this.elements.presetEnabledToggle) {
                this.elements.presetEnabledToggle.setAttribute('aria-checked', preset.enabled);
                this.elements.presetEnabledToggle.classList.toggle('active', preset.enabled);
            }
            
            // Update modal title
            const title = document.getElementById('presetEditorTitle');
            if (title) {
                title.textContent = `Edit ${preset.name} Preset`;
            }
            
            this.updateCharacterCounter();
            
            // Show modal
            if (this.elements.presetEditorModal) {
                this.elements.presetEditorModal.style.display = 'flex';
                // Focus on prompt textarea after modal opens
                setTimeout(() => {
                    if (this.elements.presetPrompt) {
                        this.elements.presetPrompt.focus();
                    }
                }, 100);
            }
            
        } catch (error) {
            console.error('❌ Error editing preset:', error);
            alert('Error opening preset editor. Please try again.');
        }
    }

    async deletePreset(presetId) {
        try {
            console.log('🗑️ Deleting preset:', presetId);
            
            // Get preset data from storage
            const { presets = {} } = await chrome.storage.sync.get(['presets']);
            const preset = presets[presetId];
            
            if (!preset) {
                console.error('Preset not found:', presetId);
                alert('Preset not found.');
                return;
            }
            
            // Check if it's a system preset
            if (preset.isSystem) {
                alert('System presets cannot be deleted. You can disable them instead.');
                return;
            }
            
            // Confirm deletion
            const confirmDelete = confirm(`Are you sure you want to delete the "${preset.name}" preset? This action cannot be undone.`);
            if (!confirmDelete) {
                return;
            }
            
            // Remove preset from storage
            delete presets[presetId];
            await chrome.storage.sync.set({ presets });
            
            // If this was the selected preset, clear the selection
            const { selectedPresetId } = await chrome.storage.sync.get(['selectedPresetId']);
            if (selectedPresetId === presetId) {
                await chrome.storage.sync.set({ selectedPresetId: null });
            }
            
            console.log(`✅ Preset ${presetId} deleted successfully`);
            this.showSuccessMessage(`Preset "${preset.name}" deleted successfully!`);
            
            // UI will be updated automatically by storage change listener
            
        } catch (error) {
            console.error('❌ Error deleting preset:', error);
            alert('Error deleting preset. Please try again.');
        }
    }

    async saveSettings() {
        try {
            console.log('💾 Saving settings...');
            
            const settingsData = {
                // API Keys
                elevenlabsApiKey: this.elements.elevenlabsApiKey?.value.trim() || '',
                gptApiKey: this.elements.gptApiKey?.value.trim() || '',
                
                // Note: cleanup and analysis settings removed - now handled by presets
                
                // Analysis schedule
                analysisSchedule: document.querySelector('input[name="analysisSchedule"]:checked')?.value || 'manual'
                
                // Note: Preset data is managed separately through preset management methods
                // and is stored in the 'presets' and 'selectedPresetId' storage keys
            };

            await chrome.storage.sync.set(settingsData);
            console.log('✅ Settings saved successfully');
            this.showSuccessMessage('Settings saved successfully!');
            
        } catch (error) {
            console.error('❌ Error saving settings:', error);
            this.showSuccessMessage('Error saving settings. Please try again.', true);
        }
    }

    resetCleanupPrompt() {
        const defaultPrompt = `Clean up this transcription by:
1. Removing filler words (um, uh, like, you know)
2. Fixing grammar and punctuation
3. Removing speaker tags and audio descriptions
4. Making it more readable while preserving the original meaning

Keep the tone casual and natural.`;
        
        if (this.elements.cleanupPrompt) {
            this.elements.cleanupPrompt.value = defaultPrompt;
        }
    }


    openAnalytics() {
        const url = chrome.runtime.getURL('analytics.html');
        chrome.tabs.create({ url });
    }

    showSuccessMessage(message, isError = false) {
        if (this.elements.successMessage) {
            this.elements.successMessage.textContent = message;
            this.elements.successMessage.className = `success-message ${isError ? 'error' : 'success'}`;
            this.elements.successMessage.style.display = 'block';
            
            setTimeout(() => {
                if (this.elements.successMessage) {
                    this.elements.successMessage.style.display = 'none';
                }
            }, 3000);
        }
    }

    // Preset editor modal methods (reusing existing modal for new preset system)
    closePresetEditor() {
        if (this.elements.presetEditorModal) {
            this.elements.presetEditorModal.style.display = 'none';
        }
        this.currentEditingPreset = null;
    }

    updateCharacterCounter() {
        if (!this.elements.presetPrompt || !this.elements.promptCharCount) return;
        
        const length = this.elements.presetPrompt.value.length;
        const counter = this.elements.promptCharCount;
        
        counter.textContent = length;
        
        // Update counter styling based on length
        counter.parentElement.classList.remove('warning', 'danger');
        if (length > 1800) {
            counter.parentElement.classList.add('danger');
        } else if (length > 1500) {
            counter.parentElement.classList.add('warning');
        }
    }

    toggleModalPreset() {
        if (!this.elements.presetEnabledToggle) return;
        
        const isEnabled = this.elements.presetEnabledToggle.getAttribute('aria-checked') === 'true';
        const newState = !isEnabled;
        
        this.elements.presetEnabledToggle.setAttribute('aria-checked', newState);
        this.elements.presetEnabledToggle.classList.toggle('active', newState);
    }

    async savePresetChanges() {
        try {
            const presetName = this.elements.presetName?.value.trim();
            const prompt = this.elements.presetPrompt?.value.trim();
            const isEnabled = this.elements.presetEnabledToggle?.getAttribute('aria-checked') === 'true';
            
            // Validate inputs
            if (!presetName) {
                alert('Preset name is required.');
                if (this.elements.presetName) this.elements.presetName.focus();
                return;
            }
            
            if (!prompt) {
                alert('Enhancement prompt is required.');
                if (this.elements.presetPrompt) this.elements.presetPrompt.focus();
                return;
            }
            
            if (prompt.length > 2000) {
                alert('Prompt must be 2000 characters or less.');
                if (this.elements.presetPrompt) this.elements.presetPrompt.focus();
                return;
            }
            
            // Get current presets from storage
            const { presets = {} } = await chrome.storage.sync.get(['presets']);
            
            if (this.currentEditingPreset === null) {
                // Creating new preset
                console.log('💾 Creating new preset:', presetName);
                
                // Check custom preset limit (max 2 custom presets)
                const customPresets = Object.values(presets).filter(preset => !preset.isSystem);
                if (customPresets.length >= 2) {
                    alert('Maximum of 2 custom presets allowed. Delete an existing custom preset first.');
                    return;
                }
                
                // Check for duplicate names
                const duplicateName = Object.values(presets).find(preset => 
                    preset.name.toLowerCase() === presetName.toLowerCase()
                );
                if (duplicateName) {
                    alert('A preset with this name already exists. Please choose a different name.');
                    if (this.elements.presetName) this.elements.presetName.focus();
                    return;
                }
                
                // Generate unique ID for new preset
                const presetId = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
                
                // Create new preset
                presets[presetId] = {
                    id: presetId,
                    name: presetName,
                    prompt: prompt,
                    isSystem: false,
                    enabled: isEnabled,
                    usageCount: 0,
                    createdAt: new Date().toISOString(),
                    lastUsed: null
                };
                
                this.showSuccessMessage(`Preset "${presetName}" created successfully!`);
                
            } else {
                // Editing existing preset
                console.log('💾 Updating existing preset:', this.currentEditingPreset);
                
                const existingPreset = presets[this.currentEditingPreset];
                if (!existingPreset) {
                    alert('Preset not found.');
                    return;
                }
                
                // For system presets, only allow prompt and enabled changes
                if (existingPreset.isSystem) {
                    presets[this.currentEditingPreset] = {
                        ...existingPreset,
                        prompt: prompt,
                        enabled: isEnabled
                    };
                } else {
                    // For custom presets, allow name changes too (but check for duplicates)
                    if (presetName !== existingPreset.name) {
                        const duplicateName = Object.values(presets).find(preset => 
                            preset.id !== this.currentEditingPreset && 
                            preset.name.toLowerCase() === presetName.toLowerCase()
                        );
                        if (duplicateName) {
                            alert('A preset with this name already exists. Please choose a different name.');
                            if (this.elements.presetName) this.elements.presetName.focus();
                            return;
                        }
                    }
                    
                    presets[this.currentEditingPreset] = {
                        ...existingPreset,
                        name: presetName,
                        prompt: prompt,
                        enabled: isEnabled
                    };
                }
                
                this.showSuccessMessage(`Preset "${presetName}" updated successfully!`);
            }
            
            // Save presets back to storage
            await chrome.storage.sync.set({ presets });
            
            console.log('✅ Preset changes saved successfully');
            this.closePresetEditor();
            
        } catch (error) {
            console.error('❌ Error saving preset changes:', error);
            alert('Error saving preset. Please try again.');
        }
    }

}

// Initialize settings when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 DOM loaded, initializing Yappr Settings...');
    try {
        window.yapprSettings = new YapprSettings();
        console.log('✅ YapprSettings class instantiated');
    } catch (error) {
        console.error('❌ Failed to instantiate YapprSettings:', error);
    }
});

// Also log when the script loads
console.log('📜 Settings.js script loaded');