// Yappr Chrome Extension - Folder Detail Script
// Individual folder view with transcriptions, filtering, and export functionality

// ===============================================
// CONSTANTS AND UTILITIES
// ===============================================
const CONFIG = {
    STORAGE_KEYS: {
        FOLDERS: 'folders',
        HISTORY: 'history'
    },
    UI: {
        TEXT_TRUNCATE_LENGTH: 300,
        SEARCH_DEBOUNCE_MS: 300
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

function formatDateShort(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function copyToClipboard(text) {
    return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => false);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ef4444' : '#22c55e'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        opacity: 0;
        transform: translateX(100px);
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 100);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function downloadFile(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type: `${type};charset=utf-8` });
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
            const largeDataKeys = ['history', 'yapprSessions', 'yapprAnalyses'];
            const requestedKeys = Array.isArray(keys) ? keys : [keys];
            
            const hasLargeDataRequest = requestedKeys.some(key => largeDataKeys.includes(key));
            
            if (hasLargeDataRequest) {
                const localData = await chrome.storage.local.get(keys);
                return Array.isArray(keys) 
                    ? localData
                    : { [keys]: localData[keys] || null };
            } else {
                const syncData = await chrome.storage.sync.get(keys);
                const localData = await chrome.storage.local.get(keys);
                
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
            const largeDataKeys = ['history', 'yapprSessions', 'yapprAnalyses'];
            const hasLargeData = Object.keys(data).some(key => largeDataKeys.includes(key));
            
            if (hasLargeData) {
                await chrome.storage.local.set(data);
            } else {
                try {
                    await chrome.storage.sync.set(data);
                } catch (syncError) {
                    console.warn('Sync storage failed, continuing with local only:', syncError.message);
                }
                await chrome.storage.local.set(data);
            }
            
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    }

    async getFolders() {
        const result = await this.get(CONFIG.STORAGE_KEYS.FOLDERS);
        return result[CONFIG.STORAGE_KEYS.FOLDERS] || [];
    }

    async getHistory() {
        const result = await this.get(CONFIG.STORAGE_KEYS.HISTORY);
        return result[CONFIG.STORAGE_KEYS.HISTORY] || [];
    }

    async setHistory(history) {
        return await this.set({ [CONFIG.STORAGE_KEYS.HISTORY]: history });
    }

    async deleteTranscription(itemId) {
        const history = await this.getHistory();
        const filteredHistory = history.filter(item => item.id !== itemId);
        return await this.setHistory(filteredHistory);
    }

    async updateFolder(folderId, updates) {
        const folders = await this.getFolders();
        const folderIndex = folders.findIndex(f => f.id === folderId);
        if (folderIndex === -1) return false;
        
        folders[folderIndex] = { ...folders[folderIndex], ...updates };
        await this.set({ [CONFIG.STORAGE_KEYS.FOLDERS]: folders });
        return folders[folderIndex];
    }
}

// ===============================================
// FOLDER DETAIL MANAGER
// ===============================================
class FolderDetailManager {
    constructor() {
        this.storageManager = new StorageManager();
        this.folderId = null;
        this.folder = null;
        this.allTranscriptions = [];
        this.filteredTranscriptions = [];
        this.selectedTranscriptions = new Set();
        this.isSelectMode = false;
        this.elements = {};
        this.searchTimeout = null;
        this.exportDropdownOpen = false;
    }

    async init() {
        try {
            console.log('Folder detail page initializing...');
            
            // Get folder ID from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            this.folderId = urlParams.get('id');
            console.log('Folder ID from URL:', this.folderId);
            
            if (!this.folderId) {
                console.error('No folder ID provided in URL');
                showToast('No folder ID provided', 'error');
                window.location.href = 'folders.html';
                return;
            }
            
            console.log('Caching elements...');
            this.cacheElements();
            
            console.log('Loading data...');
            await this.loadData();
            
            console.log('Setting up event listeners...');
            this.setupEventListeners();
            
            console.log('Rendering...');
            this.render();
            
            console.log('Hiding loading...');
            this.hideLoading();
            
            console.log('Folder detail initialization complete');
        } catch (error) {
            console.error('Failed to initialize folder detail:', error);
            showToast('Failed to load folder details', 'error');
        }
    }

    cacheElements() {
        this.elements = {
            loading: document.getElementById('loading'),
            folderContent: document.getElementById('folderContent'),
            
            // Header elements
            folderName: document.getElementById('folderName'),
            activationPhrase: document.getElementById('activationPhrase'),
            transcriptionCount: document.getElementById('transcriptionCount'),
            createdDate: document.getElementById('createdDate'),
            totalWords: document.getElementById('totalWords'),
            editFolderBtn: document.getElementById('editFolderBtn'),
            
            // Controls
            searchBox: document.getElementById('searchBox'),
            dateFrom: document.getElementById('dateFrom'),
            dateTo: document.getElementById('dateTo'),
            
            // Export and bulk actions
            selectBtn: document.getElementById('selectBtn'),
            exportBtn: document.getElementById('exportBtn'),
            exportDropdown: document.getElementById('exportDropdown'),
            selectionInfo: document.getElementById('selectionInfo'),
            bulkActions: document.getElementById('bulkActions'),
            copySelectedBtn: document.getElementById('copySelectedBtn'),
            exportSelectedBtn: document.getElementById('exportSelectedBtn'),
            selectAll: document.getElementById('selectAll'),
            deselectAll: document.getElementById('deselectAll'),
            deleteSelected: document.getElementById('deleteSelected'),
            
            // Content
            transcriptionGrid: document.getElementById('transcriptionGrid'),
            emptyState: document.getElementById('emptyState'),
            
            // Edit folder modal
            editFolderModal: document.getElementById('editFolderModal'),
            editFolderForm: document.getElementById('editFolderForm'),
            editFolderName: document.getElementById('editFolderName'),
            editActivationPhrase: document.getElementById('editActivationPhrase'),
            cancelEditBtn: document.getElementById('cancelEditBtn'),
            saveEditBtn: document.getElementById('saveEditBtn'),
            
            // Confirmation modal
            confirmModal: document.getElementById('confirmModal'),
            confirmTitle: document.getElementById('confirmTitle'),
            confirmMessage: document.getElementById('confirmMessage'),
            confirmCancel: document.getElementById('confirmCancel'),
            confirmDelete: document.getElementById('confirmDelete')
        };
    }

    async loadData() {
        try {
            console.log('Loading folders...');
            // Load folder data
            const folders = await this.storageManager.getFolders();
            console.log('Folders loaded:', folders.length);
            
            this.folder = folders.find(f => f.id === this.folderId);
            console.log('Found folder:', this.folder);
            
            if (!this.folder) {
                console.error('Folder not found with ID:', this.folderId);
                showToast('Folder not found', 'error');
                window.location.href = 'folders.html';
                return;
            }
            
            console.log('Loading history...');
            // Load transcriptions for this folder
            const history = await this.storageManager.getHistory();
            console.log('History loaded:', history.length, 'total items');
            
            this.allTranscriptions = history
                .filter(item => item.folderId === this.folderId)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            console.log('Filtered transcriptions for this folder:', this.allTranscriptions.length);
            
            this.applyFilters();
        } catch (error) {
            console.error('Error loading folder data:', error);
            showToast('Failed to load folder data', 'error');
        }
    }

    setupEventListeners() {
        // Edit folder button
        this.elements.editFolderBtn.addEventListener('click', () => {
            this.showEditFolderModal();
        });

        // Search
        this.elements.searchBox.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        // Clear filters on double-click of search box
        this.elements.searchBox.addEventListener('dblclick', () => {
            this.clearFilters();
        });

        // Clear filters with Escape key
        this.elements.searchBox.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clearFilters();
            }
        });

        // Date filters
        this.elements.dateFrom.addEventListener('change', () => {
            this.applyFilters();
            this.render();
        });

        this.elements.dateTo.addEventListener('change', () => {
            this.applyFilters();
            this.render();
        });


        // Selection mode
        this.elements.selectBtn.addEventListener('click', () => {
            this.toggleSelectMode();
        });

        // Export dropdown
        this.elements.exportBtn.addEventListener('click', () => {
            this.toggleExportDropdown();
        });

        // Export options
        this.elements.exportDropdown.addEventListener('click', (e) => {
            const option = e.target.closest('.dropdown-item');
            if (option) {
                this.handleExport(option.dataset.format);
            }
        });

        // Bulk actions
        this.elements.copySelectedBtn.addEventListener('click', () => {
            this.copySelected();
        });

        this.elements.exportSelectedBtn.addEventListener('click', () => {
            this.handleExport('selected');
        });

        this.elements.selectAll.addEventListener('click', () => {
            this.selectAll();
        });

        this.elements.deselectAll.addEventListener('click', () => {
            this.deselectAll();
        });

        this.elements.deleteSelected.addEventListener('click', () => {
            this.confirmDeleteSelected();
        });

        // Transcription grid (delegated events)
        this.elements.transcriptionGrid.addEventListener('click', (e) => {
            this.handleTranscriptionClick(e);
        });

        // Edit folder modal
        this.elements.editFolderForm.addEventListener('submit', (e) => {
            this.handleEditFolder(e);
        });

        this.elements.cancelEditBtn.addEventListener('click', () => {
            this.hideEditFolderModal();
        });

        this.elements.saveEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleEditFolder(e);
        });

        this.elements.editFolderModal.addEventListener('click', (e) => {
            if (e.target === this.elements.editFolderModal) {
                this.hideEditFolderModal();
            }
        });

        // Confirmation modal
        this.elements.confirmCancel.addEventListener('click', () => {
            this.hideModal();
        });

        this.elements.confirmDelete.addEventListener('click', () => {
            this.handleConfirmDelete();
        });

        this.elements.confirmModal.addEventListener('click', (e) => {
            if (e.target === this.elements.confirmModal) {
                this.hideModal();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.export-dropdown')) {
                this.closeExportDropdown();
            }
        });
    }

    handleSearch(term) {
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
        let filtered = [...this.allTranscriptions];
        
        // Text search
        const searchTerm = this.elements.searchBox.value.toLowerCase().trim();
        if (searchTerm) {
            filtered = filtered.filter(item => 
                item.text.toLowerCase().includes(searchTerm)
            );
        }
        
        // Date filters - now inclusive of start and end dates
        const dateFrom = this.elements.dateFrom.value;
        const dateTo = this.elements.dateTo.value;
        
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0); // Start of day
            filtered = filtered.filter(item => 
                new Date(item.timestamp) >= fromDate
            );
        }
        
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999); // End of day
            filtered = filtered.filter(item => 
                new Date(item.timestamp) <= toDate
            );
        }
        
        this.filteredTranscriptions = filtered;
    }

    clearFilters() {
        this.elements.searchBox.value = '';
        this.elements.dateFrom.value = '';
        this.elements.dateTo.value = '';
        this.applyFilters();
        this.render();
    }

    render() {
        this.renderHeader();
        this.renderTranscriptions();
        this.updateSelectionUI();
    }

    renderHeader() {
        this.elements.folderName.textContent = this.folder.name;
        this.elements.activationPhrase.textContent = this.folder.activationPhrase;
        this.elements.transcriptionCount.textContent = this.allTranscriptions.length;
        this.elements.createdDate.textContent = formatDateShort(this.folder.createdAt);
        
        // Calculate total words
        const totalWords = this.allTranscriptions.reduce((sum, item) => sum + (item.wordCount || 0), 0);
        this.elements.totalWords.textContent = totalWords.toLocaleString();
    }

    renderTranscriptions() {
        const transcriptions = this.filteredTranscriptions;
        
        if (transcriptions.length === 0) {
            this.elements.emptyState.style.display = 'block';
            this.elements.transcriptionGrid.innerHTML = '';
            return;
        }
        
        this.elements.emptyState.style.display = 'none';
        
        this.elements.transcriptionGrid.innerHTML = transcriptions.map(item => {
            const checkbox = this.isSelectMode ? 
                `<input type="checkbox" class="selection-checkbox" id="checkbox-${item.id}" data-id="${item.id}" ${this.selectedTranscriptions.has(item.id) ? 'checked' : ''}>
                 <label class="checkbox-label" for="checkbox-${item.id}">
                     <span class="custom-checkbox"></span>
                 </label>` 
                : '';

            return `
                <div class="transcription-item ${this.isSelectMode ? 'selection-mode' : ''} ${this.selectedTranscriptions.has(item.id) ? 'selected' : ''}" data-id="${item.id}">
                    <div class="item-content">
                        ${checkbox}
                        <div class="item-main">
                            <div class="transcription-header">
                                <div class="transcription-meta">
                                    <div class="transcription-date">${formatDate(item.timestamp)}</div>
                                    <div class="transcription-stats">
                                        ${item.wordCount || 'N/A'} words • 
                                        ${item.duration ? Math.round(item.duration) + 's' : 'N/A'} • 
                                        ${item.service || 'Unknown'} service
                                    </div>
                                </div>
                                <div class="transcription-actions">
                                    <button class="action-btn" data-action="copy" data-id="${item.id}" title="Copy">
                                        <span class="material-icons">content_copy</span>
                                    </button>
                                    <button class="action-btn" data-action="download" data-id="${item.id}" title="Download">
                                        <span class="material-icons">download</span>
                                    </button>
                                    <button class="action-btn delete" data-action="delete" data-id="${item.id}" title="Delete">
                                        <span class="material-icons">delete</span>
                                    </button>
                                </div>
                            </div>
                            <div class="transcription-text">
                                ${truncateText(item.text, CONFIG.UI.TEXT_TRUNCATE_LENGTH)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Helper method to determine if we're showing bulk actions
    isShowingBulkActions() {
        return this.elements.bulkActions && this.elements.bulkActions.style.display === 'flex';
    }

    updateSelectionUI() {
        const selectedCount = this.selectedTranscriptions.size;
        
        // Show/hide bulk actions based on selection mode
        this.elements.bulkActions.classList.toggle('show', this.isSelectMode);
        this.elements.bulkActions.style.display = this.isSelectMode ? 'flex' : 'none';
        
        // Update selection info
        if (this.elements.selectionInfo) {
            this.elements.selectionInfo.textContent = `${selectedCount} selected`;
            
            // Add select/deselect all functionality to the selection info
            this.elements.selectionInfo.onclick = () => {
                if (this.selectedTranscriptions.size === this.filteredTranscriptions.length) {
                    this.deselectAll();
                } else {
                    this.selectAll();
                }
            };
            this.elements.selectionInfo.style.cursor = 'pointer';
            this.elements.selectionInfo.title = this.selectedTranscriptions.size === this.filteredTranscriptions.length ? 
                'Click to deselect all' : 'Click to select all';
        }
    }

    toggleSelectMode() {
        this.isSelectMode = !this.isSelectMode;
        this.selectedTranscriptions.clear();
        
        // Update button state
        this.elements.selectBtn.classList.toggle('active', this.isSelectMode);
        this.elements.selectBtn.innerHTML = this.isSelectMode ? 
            '<span class="material-icons">close</span>Cancel' : 
            '<span class="material-icons">checklist</span>Select';
        
        this.render();
    }

    async copySelected() {
        if (this.selectedTranscriptions.size === 0) {
            showToast('No transcriptions selected', 'error');
            return;
        }

        const selectedItems = this.allTranscriptions.filter(item => this.selectedTranscriptions.has(item.id));
        const text = selectedItems.map(item => item.text).join('\n\n---\n\n');
        
        try {
            await navigator.clipboard.writeText(text);
            showToast(`Copied ${selectedItems.length} transcriptions to clipboard!`);
        } catch (error) {
            showToast('Failed to copy to clipboard', 'error');
        }
    }

    handleTranscriptionClick(e) {
        // Handle selection mode - make entire card clickable
        if (this.isSelectMode) {
            // Don't handle selection if clicking on action buttons
            const actionBtn = e.target.closest('.action-btn');
            if (actionBtn) {
                // Handle action button clicks normally even in selection mode
                const action = actionBtn.dataset.action;
                const itemId = actionBtn.dataset.id;
                const item = this.allTranscriptions.find(t => t.id === itemId);
                
                if (!item) return;
                
                switch (action) {
                    case 'copy':
                        this.copyTranscription(item);
                        break;
                    case 'download':
                        this.downloadTranscription(item);
                        break;
                    case 'delete':
                        this.confirmDeleteTranscription(itemId);
                        break;
                }
                return;
            }
            
            // Handle card selection - find the transcription item
            const transcriptionItem = e.target.closest('.transcription-item');
            if (transcriptionItem) {
                // Find the checkbox inside this item to get the ID
                const checkbox = transcriptionItem.querySelector('.selection-checkbox');
                if (checkbox) {
                    const itemId = checkbox.dataset.id;
                    this.toggleSelection(itemId);
                    return;
                }
            }
            return;
        }

        // Normal mode - only handle action button clicks
        const actionBtn = e.target.closest('.action-btn');
        if (!actionBtn) return;
        
        const action = actionBtn.dataset.action;
        const itemId = actionBtn.dataset.id;
        const item = this.allTranscriptions.find(t => t.id === itemId);
        
        if (!item) return;
        
        switch (action) {
            case 'copy':
                this.copyTranscription(item);
                break;
            case 'download':
                this.downloadTranscription(item);
                break;
            case 'delete':
                this.confirmDeleteTranscription(itemId);
                break;
        }
    }

    toggleSelection(itemId) {
        if (this.selectedTranscriptions.has(itemId)) {
            this.selectedTranscriptions.delete(itemId);
        } else {
            this.selectedTranscriptions.add(itemId);
        }
        this.render();
    }


    selectAll() {
        this.selectedTranscriptions.clear();
        this.filteredTranscriptions.forEach(item => {
            this.selectedTranscriptions.add(item.id);
        });
        this.render();
    }

    deselectAll() {
        this.selectedTranscriptions.clear();
        this.render();
    }

    async copyTranscription(item) {
        const success = await copyToClipboard(item.text);
        if (success) {
            showToast('Transcription copied to clipboard!');
        } else {
            showToast('Failed to copy transcription', 'error');
        }
    }

    downloadTranscription(item) {
        const date = new Date(item.timestamp).toISOString().split('T')[0];
        const filename = `${this.folder.name}-${date}.txt`;
        downloadFile(item.text, filename);
        showToast('Transcription downloaded!');
    }

    showEditFolderModal() {
        this.elements.editFolderName.value = this.folder.name;
        this.elements.editActivationPhrase.value = this.folder.activationPhrase;
        this.elements.editFolderModal.style.display = 'flex';
        this.elements.editFolderName.focus();
    }

    hideEditFolderModal() {
        this.elements.editFolderModal.style.display = 'none';
        this.elements.editFolderForm.reset();
    }

    async handleEditFolder(e) {
        e.preventDefault();
        
        const name = this.elements.editFolderName.value.trim();
        const activationPhrase = this.elements.editActivationPhrase.value.trim();
        
        if (!name || !activationPhrase) {
            showToast('Please fill in all fields', 'error');
            return;
        }
        
        // Check for duplicate names (excluding current folder)
        const folders = await this.storageManager.getFolders();
        if (folders.some(f => f.id !== this.folderId && f.name.toLowerCase() === name.toLowerCase())) {
            showToast('A folder with this name already exists', 'error');
            return;
        }
        
        // Check for duplicate activation phrases (excluding current folder)
        if (folders.some(f => f.id !== this.folderId && f.activationPhrase.toLowerCase() === activationPhrase.toLowerCase())) {
            showToast('A folder with this activation phrase already exists', 'error');
            return;
        }
        
        try {
            // Update folder
            await this.storageManager.updateFolder(this.folderId, { name, activationPhrase });
            
            // Update folder name in history items if name changed
            if (name !== this.folder.name) {
                const history = await this.storageManager.getHistory();
                const updatedHistory = history.map(item => 
                    item.folderId === this.folderId 
                        ? { ...item, folderName: name }
                        : item
                );
                await this.storageManager.setHistory(updatedHistory);
            }
            
            // Reload data and re-render
            await this.loadData();
            this.render();
            this.hideEditFolderModal();
            showToast(`Folder "${name}" updated successfully!`);
        } catch (error) {
            console.error('Error updating folder:', error);
            showToast('Failed to update folder', 'error');
        }
    }

    toggleExportDropdown() {
        this.exportDropdownOpen = !this.exportDropdownOpen;
        this.elements.exportDropdown.classList.toggle('show', this.exportDropdownOpen);
    }

    closeExportDropdown() {
        this.exportDropdownOpen = false;
        this.elements.exportDropdown.classList.remove('show');
    }

    handleExport(format) {
        this.closeExportDropdown();
        
        let dataToExport = format === 'selected' && this.selectedTranscriptions.size > 0
            ? this.filteredTranscriptions.filter(item => this.selectedTranscriptions.has(item.id))
            : this.filteredTranscriptions;
        
        if (dataToExport.length === 0) {
            showToast('No transcriptions to export', 'error');
            return;
        }
        
        const timestamp = new Date().toISOString().split('T')[0];
        const baseName = `${this.folder.name}-${timestamp}`;
        
        switch (format) {
            case 'txt':
            case 'selected':
                this.exportAsText(dataToExport, `${baseName}.txt`);
                break;
            case 'csv':
                this.exportAsCSV(dataToExport, `${baseName}.csv`);
                break;
            case 'json':
                this.exportAsJSON(dataToExport, `${baseName}.json`);
                break;
        }
    }

    exportAsText(data, filename) {
        const content = data.map(item => {
            const date = formatDate(item.timestamp);
            const stats = `${item.wordCount || 'N/A'} words • ${item.duration ? Math.round(item.duration) + 's' : 'N/A'}`;
            return `${date} - ${stats}\n${item.text}\n\n${'='.repeat(50)}\n`;
        }).join('\n');
        
        downloadFile(content, filename);
        showToast(`Exported ${data.length} transcriptions as text!`);
    }

    exportAsCSV(data, filename) {
        const headers = ['Date', 'Text', 'Word Count', 'Duration', 'Service'];
        const rows = data.map(item => [
            formatDate(item.timestamp),
            `"${item.text.replace(/"/g, '""')}"`, // Escape quotes
            item.wordCount || 0,
            item.duration || 0,
            item.service || 'Unknown'
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        downloadFile(csvContent, filename, 'text/csv');
        showToast(`Exported ${data.length} transcriptions as CSV!`);
    }

    exportAsJSON(data, filename) {
        const exportData = {
            folder: {
                name: this.folder.name,
                activationPhrase: this.folder.activationPhrase,
                createdAt: this.folder.createdAt
            },
            transcriptions: data.map(item => ({
                id: item.id,
                text: item.text,
                timestamp: item.timestamp,
                wordCount: item.wordCount,
                duration: item.duration,
                service: item.service
            })),
            exportedAt: new Date().toISOString(),
            totalTranscriptions: data.length
        };
        
        const jsonContent = JSON.stringify(exportData, null, 2);
        downloadFile(jsonContent, filename, 'application/json');
        showToast(`Exported ${data.length} transcriptions as JSON!`);
    }

    confirmDeleteTranscription(itemId) {
        this.currentDeletionId = itemId;
        this.elements.confirmTitle.textContent = 'Delete Transcription';
        this.elements.confirmMessage.textContent = 'Are you sure you want to delete this transcription? This action cannot be undone.';
        this.showModal();
    }

    confirmDeleteSelected() {
        if (this.selectedTranscriptions.size === 0) {
            showToast('No transcriptions selected', 'error');
            return;
        }
        
        this.currentDeletionId = null;
        this.elements.confirmTitle.textContent = 'Delete Selected Transcriptions';
        this.elements.confirmMessage.textContent = `Are you sure you want to delete ${this.selectedTranscriptions.size} selected transcription${this.selectedTranscriptions.size !== 1 ? 's' : ''}? This action cannot be undone.`;
        this.showModal();
    }

    async handleConfirmDelete() {
        try {
            if (this.currentDeletionId) {
                // Delete single transcription
                await this.storageManager.deleteTranscription(this.currentDeletionId);
                showToast('Transcription deleted successfully!');
            } else {
                // Delete selected transcriptions
                const history = await this.storageManager.getHistory();
                const filteredHistory = history.filter(item => !this.selectedTranscriptions.has(item.id));
                await this.storageManager.setHistory(filteredHistory);
                showToast(`${this.selectedTranscriptions.size} transcription${this.selectedTranscriptions.size !== 1 ? 's' : ''} deleted successfully!`);
                this.selectedTranscriptions.clear();
            }
            
            await this.loadData();
            this.render();
            this.hideModal();
        } catch (error) {
            console.error('Error deleting transcription(s):', error);
            showToast('Failed to delete transcription(s)', 'error');
        }
    }

    showModal() {
        this.elements.confirmModal.style.display = 'flex';
    }

    hideModal() {
        this.elements.confirmModal.style.display = 'none';
        this.currentDeletionId = null;
    }

    hideLoading() {
        this.elements.loading.style.display = 'none';
        this.elements.folderContent.style.display = 'block';
    }
}

// ===============================================
// INITIALIZATION
// ===============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📁 Folder detail page loaded, initializing...');
    try {
        const folderDetail = new FolderDetailManager();
        await folderDetail.init();
        console.log('✅ Folder detail initialized successfully');
    } catch (error) {
        console.error('❌ Folder detail initialization failed:', error);
    }
});