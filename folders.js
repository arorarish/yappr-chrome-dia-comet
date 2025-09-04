// Yappr Chrome Extension - Folders Management Script
// All functionality for managing folders and viewing transcriptions

// ===============================================
// CONSTANTS AND UTILITIES
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
        TEXT_TRUNCATE_LENGTH: 200,
        SEARCH_DEBOUNCE_MS: 300
    },
    DEFAULT_STATS: {
        totalWords: 0,
        totalMinutes: 0,
        weeklyWords: 0,
        weeklyMinutes: 0,
        lastWeekReset: new Date().toISOString()
    }
};

// ===============================================
// UTILITY FUNCTIONS
// ===============================================
function truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function copyToClipboard(text) {
    return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => false);
}

// showToast function is now provided by shared/notifications.js

function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
                // For small data, try sync first, then local
                console.log('☁️ Getting small data from sync and local storage');
                const syncData = await chrome.storage.sync.get(keys);
                const localData = await chrome.storage.local.get(keys);
                
                // Merge sync data over local data (sync takes precedence)
                return Array.isArray(keys) 
                    ? { ...localData, ...syncData }
                    : { [keys]: syncData[keys] || localData[keys] || null };
            }
        } catch (error) {
            console.error('Storage get error:', error);
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
                // Save small data to both sync and local storage
                console.log('☁️ Saving small data to both sync and local storage');
                try {
                    await chrome.storage.sync.set(data);
                    console.log('✅ Sync storage set successful');
                } catch (syncError) {
                    console.warn('⚠️ Sync storage failed, continuing with local only:', syncError.message);
                }
                
                await chrome.storage.local.set(data);
                console.log('✅ Local storage set successful');
            }
            
            return true;
        } catch (error) {
            console.error('❌ Storage set error:', error);
            return false;
        }
    }

    async getFolders() {
        const result = await this.get(CONFIG.STORAGE_KEYS.FOLDERS);
        return result[CONFIG.STORAGE_KEYS.FOLDERS] || [];
    }

    async setFolders(folders) {
        return await this.set({ [CONFIG.STORAGE_KEYS.FOLDERS]: folders });
    }

    async getHistory() {
        const result = await this.get(CONFIG.STORAGE_KEYS.HISTORY);
        const history = result[CONFIG.STORAGE_KEYS.HISTORY] || [];
        
        // Ensure all items have IDs
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
            folderId: item.folderId === folderId ? null : item.folderId,
            folderName: item.folderId === folderId ? null : item.folderName
        }));
        await this.setHistory(updatedHistory);
        
        return true;
    }

    async deleteTranscription(itemId) {
        const history = await this.getHistory();
        const filteredHistory = history.filter(item => item.id !== itemId);
        return await this.setHistory(filteredHistory);
    }

    async findFolderByActivationPhrase(text) {
        const folders = await this.getFolders();
        return folders.find(folder => 
            text.toLowerCase().trim().startsWith(folder.activationPhrase.toLowerCase().trim())
        );
    }

    async getFolderStats() {
        const folders = await this.getFolders();
        const history = await this.getHistory();
        
        // Calculate transcription count for each folder
        const folderStats = folders.map(folder => {
            const transcriptionCount = history.filter(item => item.folderId === folder.id).length;
            return {
                ...folder,
                transcriptionCount
            };
        });
        
        return folderStats;
    }
}

// ===============================================
// FOLDERS MANAGER
// ===============================================
class YapprFoldersManager {
    constructor() {
        this.storageManager = new StorageManager();
        this.folders = [];
        this.history = [];
        this.filteredFolders = [];
        this.filteredHistory = [];
        this.currentView = 'folders';
        this.viewMode = 'grid'; // grid or list
        this.searchTerm = '';
        this.elements = {};
        this.currentEditingFolderId = null;
        this.searchTimeout = null;
    }

    async init() {
        try {
            this.cacheElements();
            await this.loadData();
            this.setupEventListeners();
            this.render();
            this.hideLoading();
        } catch (error) {
            console.error('Failed to initialize folders manager:', error);
            this.showError('Failed to load folders data');
        }
    }

    cacheElements() {
        console.log('🔍 Caching DOM elements...');
        this.elements = {
            // Controls
            searchBox: document.getElementById('searchBox'),
            gridViewBtn: document.getElementById('gridViewBtn'),
            listViewBtn: document.getElementById('listViewBtn'),
            // createFolderBtn removed - now using card in grid
            
            // Views
            loading: document.getElementById('loading'),
            foldersView: document.getElementById('foldersView'),
            
            // Folders view
            emptyFoldersState: document.getElementById('emptyFoldersState'),
            foldersGrid: document.getElementById('foldersGrid'),
            
            // Modals
            createFolderModal: document.getElementById('createFolderModal'),
            createFolderForm: document.getElementById('createFolderForm'),
            folderName: document.getElementById('folderName'),
            activationPhrase: document.getElementById('activationPhrase'),
            cancelCreateBtn: document.getElementById('cancelCreateBtn'),
            
            editFolderModal: document.getElementById('editFolderModal'),
            editFolderForm: document.getElementById('editFolderForm'),
            editFolderName: document.getElementById('editFolderName'),
            editActivationPhrase: document.getElementById('editActivationPhrase'),
            cancelEditBtn: document.getElementById('cancelEditBtn'),
            
            confirmModal: document.getElementById('confirmModal'),
            confirmMessage: document.getElementById('confirmMessage'),
            confirmCancel: document.getElementById('confirmCancel'),
            confirmDelete: document.getElementById('confirmDelete')
        };
        
        // Debug: Check for missing elements
        const missingElements = [];
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                missingElements.push(key);
            }
        }
        
        if (missingElements.length > 0) {
            console.warn('❌ Missing DOM elements:', missingElements);
        } else {
            console.log('✅ All DOM elements cached successfully');
        }
    }

    async loadData() {
        this.folders = await this.storageManager.getFolderStats();
        this.history = await this.storageManager.getHistory();
        this.applyFilters();
    }

    setupEventListeners() {
        console.log('🔗 Setting up event listeners...');
        
        // Search
        if (this.elements.searchBox) {
            this.elements.searchBox.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        } else {
            console.error('❌ searchBox element not found');
        }

        // View toggle
        if (this.elements.gridViewBtn) {
            this.elements.gridViewBtn.addEventListener('click', () => {
                this.switchViewMode('grid');
            });
        } else {
            console.error('❌ gridViewBtn element not found');
        }

        if (this.elements.listViewBtn) {
            this.elements.listViewBtn.addEventListener('click', () => {
                this.switchViewMode('list');
            });
        } else {
            console.error('❌ listViewBtn element not found');
        }

        // Modal form events
        if (this.elements.createFolderForm) {
            this.elements.createFolderForm.addEventListener('submit', (e) => {
                this.handleCreateFolder(e);
            });
        } else {
            console.error('❌ createFolderForm element not found');
        }

        if (this.elements.editFolderForm) {
            this.elements.editFolderForm.addEventListener('submit', (e) => {
                this.handleEditFolder(e);
            });
        } else {
            console.error('❌ editFolderForm element not found');
        }

        // Modal button events
        if (this.elements.cancelCreateBtn) {
            this.elements.cancelCreateBtn.addEventListener('click', () => {
                this.hideCreateFolderModal();
            });
        } else {
            console.error('❌ cancelCreateBtn element not found');
        }

        if (this.elements.cancelEditBtn) {
            this.elements.cancelEditBtn.addEventListener('click', () => {
                this.hideEditFolderModal();
            });
        } else {
            console.error('❌ cancelEditBtn element not found');
        }

        if (this.elements.confirmCancel) {
            this.elements.confirmCancel.addEventListener('click', () => {
                this.hideConfirmModal();
            });
        } else {
            console.error('❌ confirmCancel element not found');
        }

        if (this.elements.confirmDelete) {
            this.elements.confirmDelete.addEventListener('click', () => {
                this.handleConfirmDelete();
            });
        } else {
            console.error('❌ confirmDelete element not found');
        }

        // Modal backdrop clicks
        if (this.elements.createFolderModal) {
            this.elements.createFolderModal.addEventListener('click', (e) => {
                if (e.target === this.elements.createFolderModal) {
                    this.hideCreateFolderModal();
                }
            });
        } else {
            console.error('❌ createFolderModal element not found');
        }

        if (this.elements.editFolderModal) {
            this.elements.editFolderModal.addEventListener('click', (e) => {
                if (e.target === this.elements.editFolderModal) {
                    this.hideEditFolderModal();
                }
            });
        } else {
            console.error('❌ editFolderModal element not found');
        }

        if (this.elements.confirmModal) {
            this.elements.confirmModal.addEventListener('click', (e) => {
                if (e.target === this.elements.confirmModal) {
                    this.hideConfirmModal();
                }
            });
        } else {
            console.error('❌ confirmModal element not found');
        }

        // Delegate events for dynamic content
        if (this.elements.foldersGrid) {
            this.elements.foldersGrid.addEventListener('click', (e) => {
                this.handleFolderAction(e);
            });
        } else {
            console.error('❌ foldersGrid element not found');
        }
    }

    handleSearch(term) {
        this.searchTerm = term;
        
        // Debounce search
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        this.searchTimeout = setTimeout(() => {
            this.applyFilters();
            this.render();
        }, CONFIG.UI.SEARCH_DEBOUNCE_MS);
    }

    applyFilters() {
        const term = this.searchTerm.toLowerCase();
        
        if (!term) {
            this.filteredFolders = [...this.folders];
            this.filteredHistory = [...this.history];
            return;
        }

        // Filter folders
        this.filteredFolders = this.folders.filter(folder => 
            folder.name.toLowerCase().includes(term) ||
            folder.activationPhrase.toLowerCase().includes(term)
        );

        // Filter history
        this.filteredHistory = this.history.filter(item => 
            item.text.toLowerCase().includes(term) ||
            (item.folderName && item.folderName.toLowerCase().includes(term))
        );
    }

    switchViewMode(mode) {
        this.viewMode = mode;
        
        // Update buttons
        this.elements.gridViewBtn.classList.toggle('active', mode === 'grid');
        this.elements.listViewBtn.classList.toggle('active', mode === 'list');
        
        // Update grid classes
        this.elements.foldersGrid.classList.toggle('list-view', mode === 'list');
        
        // Re-render to apply any mode-specific changes
        this.render();
    }

    render() {
        this.renderFolders();
    }

    renderFolders() {
        const folders = this.filteredFolders;
        
        // Always show folders grid and hide empty state when there's a create card
        this.elements.emptyFoldersState.style.display = 'none';
        
        // Create the "Create New Folder" card as the first item
        const createFolderCard = `
            <div class="folder-card create-new" id="createFolderCard">
                <span class="material-icons">add</span>
                <div class="create-text">Create New Folder</div>
            </div>
        `;
        
        // If no folders, show only the create card
        if (folders.length === 0) {
            this.elements.foldersGrid.innerHTML = createFolderCard;
            return;
        }
        
        // Show create card followed by existing folders
        this.elements.foldersGrid.innerHTML = createFolderCard + folders.map(folder => `
            <div class="folder-card folder-clickable" data-folder-id="${folder.id}">
                <div class="folder-header">
                    <div class="folder-info">
                        <div class="folder-name">
                            <span class="folder-icon material-icons">folder</span>
                            ${folder.name}
                        </div>
                        <div class="folder-phrase">"${folder.activationPhrase}"</div>
                        <div class="folder-stats">
                            ${folder.transcriptionCount} transcription${folder.transcriptionCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <div class="folder-actions">
                        <button class="folder-action-btn" data-action="edit" data-folder-id="${folder.id}" title="Edit">
                            <span class="material-icons">edit</span>
                        </button>
                        <button class="folder-action-btn delete" data-action="delete" data-folder-id="${folder.id}" title="Delete">
                            <span class="material-icons">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // renderAllTranscriptions removed - no longer needed

    async handleFolderAction(e) {
        // Check if it's an action button first (to prevent folder opening)
        const actionBtn = e.target.closest('.folder-action-btn');
        if (actionBtn) {
            e.stopPropagation(); // Prevent folder click
            const action = actionBtn.dataset.action;
            const folderId = actionBtn.dataset.folderId;
            
            if (action === 'edit') {
                this.showEditFolderModal(folderId);
            } else if (action === 'delete') {
                this.showDeleteFolderConfirmation(folderId);
            }
            return;
        }
        
        // Check if it's the create folder card click
        const createCard = e.target.closest('.create-new');
        if (createCard) {
            this.showCreateFolderModal();
            return;
        }
        
        // Check if it's a folder card click (to open folder detail)
        const folderCard = e.target.closest('.folder-card:not(.create-new)');
        if (folderCard) {
            const folderId = folderCard.dataset.folderId;
            if (folderId) {
                this.openFolderDetail(folderId);
            }
            return;
        }
    }

    openFolderDetail(folderId) {
        // Open folder detail page in the same tab
        window.location.href = `folder-detail.html?id=${folderId}`;
    }

    // Transcription action functions removed - no longer needed for folders page

    showCreateFolderModal() {
        if (this.elements.createFolderModal && this.elements.folderName) {
            this.elements.createFolderModal.classList.add('visible');
            this.elements.folderName.focus();
        } else {
            console.error('❌ Cannot show create folder modal - elements not found');
        }
    }

    hideCreateFolderModal() {
        if (this.elements.createFolderModal && this.elements.createFolderForm) {
            this.elements.createFolderModal.classList.remove('visible');
            this.elements.createFolderForm.reset();
        } else {
            console.error('❌ Cannot hide create folder modal - elements not found');
        }
    }

    showEditFolderModal(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;
        
        if (this.elements.editFolderModal && this.elements.editFolderName && 
            this.elements.editActivationPhrase) {
            this.currentEditingFolderId = folderId;
            this.elements.editFolderName.value = folder.name;
            this.elements.editActivationPhrase.value = folder.activationPhrase;
            this.elements.editFolderModal.classList.add('visible');
            this.elements.editFolderName.focus();
        } else {
            console.error('❌ Cannot show edit folder modal - elements not found');
        }
    }

    hideEditFolderModal() {
        if (this.elements.editFolderModal && this.elements.editFolderForm) {
            this.elements.editFolderModal.classList.remove('visible');
            this.elements.editFolderForm.reset();
            this.currentEditingFolderId = null;
        } else {
            console.error('❌ Cannot hide edit folder modal - elements not found');
        }
    }

    showDeleteFolderConfirmation(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (!folder) return;
        
        if (this.elements.confirmModal && this.elements.confirmMessage) {
            this.currentEditingFolderId = folderId;
            this.elements.confirmMessage.textContent = 
                `Are you sure you want to delete the folder "${folder.name}"? This will remove the folder assignment from ${folder.transcriptionCount} transcription${folder.transcriptionCount !== 1 ? 's' : ''}.`;
            this.elements.confirmModal.classList.add('visible');
        } else {
            console.error('❌ Cannot show delete confirmation - elements not found');
        }
    }

    showDeleteTranscriptionConfirmation(transcriptionId) {
        if (this.elements.confirmModal && this.elements.confirmMessage) {
            this.currentEditingFolderId = transcriptionId;
            this.elements.confirmMessage.textContent = 
                'Are you sure you want to delete this transcription? This action cannot be undone.';
            this.elements.confirmModal.classList.add('visible');
        } else {
            console.error('❌ Cannot show delete confirmation - elements not found');
        }
    }

    hideConfirmModal() {
        if (this.elements.confirmModal) {
            this.elements.confirmModal.classList.remove('visible');
            this.currentEditingFolderId = null;
        } else {
            console.error('❌ Cannot hide confirm modal - element not found');
        }
    }

    async handleCreateFolder(e) {
        e.preventDefault();
        
        if (!this.elements.folderName || !this.elements.activationPhrase) {
            console.error('❌ Cannot create folder - form elements not found');
            return;
        }
        
        const name = this.elements.folderName.value.trim();
        const activationPhrase = this.elements.activationPhrase.value.trim();
        
        if (!name || !activationPhrase) {
            showToast('Please fill in all fields', 'error');
            return;
        }
        
        // Check for duplicate names
        if (this.folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
            showToast('A folder with this name already exists', 'error');
            return;
        }
        
        // Check for duplicate activation phrases
        if (this.folders.some(f => f.activationPhrase.toLowerCase() === activationPhrase.toLowerCase())) {
            showToast('A folder with this activation phrase already exists', 'error');
            return;
        }
        
        try {
            await this.storageManager.createFolder({ name, activationPhrase });
            await this.loadData();
            this.render();
            this.hideCreateFolderModal();
            showToast(`Folder "${name}" created successfully!`);
        } catch (error) {
            console.error('Error creating folder:', error);
            showToast('Failed to create folder', 'error');
        }
    }

    async handleEditFolder(e) {
        e.preventDefault();
        
        if (!this.currentEditingFolderId) return;
        
        if (!this.elements.editFolderName || !this.elements.editActivationPhrase) {
            console.error('❌ Cannot edit folder - form elements not found');
            return;
        }
        
        const name = this.elements.editFolderName.value.trim();
        const activationPhrase = this.elements.editActivationPhrase.value.trim();
        
        if (!name || !activationPhrase) {
            showToast('Please fill in all fields', 'error');
            return;
        }
        
        const currentFolder = this.folders.find(f => f.id === this.currentEditingFolderId);
        if (!currentFolder) return;
        
        // Check for duplicate names (excluding current folder)
        if (this.folders.some(f => f.id !== this.currentEditingFolderId && f.name.toLowerCase() === name.toLowerCase())) {
            showToast('A folder with this name already exists', 'error');
            return;
        }
        
        // Check for duplicate activation phrases (excluding current folder)
        if (this.folders.some(f => f.id !== this.currentEditingFolderId && f.activationPhrase.toLowerCase() === activationPhrase.toLowerCase())) {
            showToast('A folder with this activation phrase already exists', 'error');
            return;
        }
        
        try {
            await this.storageManager.updateFolder(this.currentEditingFolderId, { name, activationPhrase });
            
            // Update folder name in history items
            const history = await this.storageManager.getHistory();
            const updatedHistory = history.map(item => 
                item.folderId === this.currentEditingFolderId 
                    ? { ...item, folderName: name }
                    : item
            );
            await this.storageManager.setHistory(updatedHistory);
            
            await this.loadData();
            this.render();
            this.hideEditFolderModal();
            showToast(`Folder "${name}" updated successfully!`);
        } catch (error) {
            console.error('Error updating folder:', error);
            showToast('Failed to update folder', 'error');
        }
    }

    async handleConfirmDelete() {
        if (!this.currentEditingFolderId) return;
        
        try {
            // Check if this is a folder or transcription deletion
            const isFolder = this.folders.some(f => f.id === this.currentEditingFolderId);
            
            if (isFolder) {
                await this.storageManager.deleteFolder(this.currentEditingFolderId);
                showToast('Folder deleted successfully!');
            } else {
                await this.storageManager.deleteTranscription(this.currentEditingFolderId);
                showToast('Transcription deleted successfully!');
            }
            
            await this.loadData();
            this.render();
            this.hideConfirmModal();
        } catch (error) {
            console.error('Error deleting:', error);
            showToast('Failed to delete', 'error');
        }
    }

    hideLoading() {
        if (this.elements.loading) {
            this.elements.loading.style.display = 'none';
        } else {
            console.error('❌ Cannot hide loading - element not found');
        }
    }

    showError(message) {
        showToast(message, 'error');
    }
}

// ===============================================
// INITIALIZATION
// ===============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🗂️ Folders page loaded, initializing...');
    try {
        const foldersManager = new YapprFoldersManager();
        await foldersManager.init();
        console.log('✅ Folders manager initialized successfully');
    } catch (error) {
        console.error('❌ Folders manager initialization failed:', error);
    }
});