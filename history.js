class WhisperHistoryPage {
    constructor() {
        this.fullHistory = [];
        this.filteredHistory = [];
        this.selectedIds = new Set();
        this.isSelectMode = false;
        this.init();
    }

    async init() {
        console.log('History page initializing...');
        
        this.elements = {
            grid: document.getElementById('historyGrid'),
            loading: document.getElementById('loading'),
            emptyState: document.getElementById('emptyState'),
            searchBox: document.getElementById('searchBox'),
            exportBtn: document.getElementById('exportBtn'),
            clearBtn: document.getElementById('clearBtn'),
            selectBtn: document.getElementById('selectBtn'),
            bulkActions: document.getElementById('bulkActions'),
            selectionInfo: document.getElementById('selectionInfo'),
            copySelectedBtn: document.getElementById('copySelectedBtn'),
            exportSelectedBtn: document.getElementById('exportSelectedBtn'),
            assignFolderBtn: document.getElementById('assignFolderBtn'),
            deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),
            modal: document.getElementById('confirmModal'),
            modalTitle: document.getElementById('modalTitle'),
            modalBody: document.getElementById('modalBody'),
            modalConfirm: document.getElementById('modalConfirm'),
            modalCancel: document.getElementById('modalCancel'),
        };

        console.log('Elements found:', Object.keys(this.elements).filter(key => this.elements[key]));
        console.log('Missing elements:', Object.keys(this.elements).filter(key => !this.elements[key]));

        // Fix for potential click target issues on icons.
        // This ensures the button is the direct target of the click event.
        const style = document.createElement('style');
        style.textContent = '.action-btn .material-icons { pointer-events: none; }';
        document.head.appendChild(style);

        console.log('Loading data...');
        await this.loadData();
        console.log('Binding event listeners...');
        this.bindEventListeners();
        console.log('Rendering...');
        this.render();
        console.log('History page initialization complete');
    }

    async loadData() {
        console.log('loadData: Getting history from storage...');
        let { history = [] } = await chrome.storage.local.get('history');
        console.log('loadData: Raw history from storage:', history);
        console.log('loadData: History length:', history.length);
        
        let historyWasModified = false;

        // Data migration: Ensure all items have a unique ID for backward compatibility.
        // This handles items stored before the `id` field was introduced.
        history.forEach(item => {
            if (!item.id) {
                item.id = crypto.randomUUID();
                historyWasModified = true;
            }
        });

        // If we had to add IDs, save the updated history back to storage.
        if (historyWasModified) {
            console.log('loadData: Adding missing IDs and saving back to storage');
            await chrome.storage.local.set({ history });
        }
        
        this.fullHistory = history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Most recent first
        this.filteredHistory = [...this.fullHistory];
        
        console.log('loadData: Processed history length:', this.fullHistory.length);
        console.log('loadData: First item:', this.fullHistory[0]);
        
        if (this.elements.loading) {
            this.elements.loading.style.display = 'none';
            console.log('loadData: Hidden loading indicator');
        } else {
            console.log('loadData: Loading element not found!');
        }
    }

    bindEventListeners() {
        this.elements.searchBox.addEventListener('input', (e) => this.handleSearch(e.target.value));
        this.elements.grid.addEventListener('click', (e) => this.handleGridClick(e));
        
        this.elements.exportBtn.addEventListener('click', () => this.exportAll());
        this.elements.clearBtn.addEventListener('click', () => this.confirmClearAll());

        // Selection mode listeners
        this.elements.selectBtn.addEventListener('click', () => this.toggleSelectMode());
        this.elements.copySelectedBtn.addEventListener('click', () => this.copySelected());
        this.elements.exportSelectedBtn.addEventListener('click', () => this.showExportOptions());
        this.elements.assignFolderBtn.addEventListener('click', () => this.showFolderAssignOptions());
        this.elements.deleteSelectedBtn.addEventListener('click', () => this.confirmDeleteSelected());

        // Modal listeners
        this.elements.modalCancel.addEventListener('click', () => this.closeModal());
        this.elements.modal.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) this.closeModal();
        });

        // Listen for storage changes to refresh history
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.history) {
                console.log('History storage changed, refreshing...');
                this.loadData().then(() => this.render());
            }
        });

        // Also refresh when page becomes visible (in case user switched tabs)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('Page became visible, refreshing history...');
                this.loadData().then(() => this.render());
            }
        });
    }

    handleSearch(query) {
        console.log('Search triggered with query:', query);
        const searchTerm = query.trim().toLowerCase();
        
        if (!searchTerm) {
            this.filteredHistory = [...this.fullHistory];
            console.log('Empty search, showing all history:', this.filteredHistory.length);
        } else {
            this.filteredHistory = this.fullHistory.filter(item => {
                const date = new Date(item.timestamp).toLocaleString().toLowerCase();
                const textMatch = item.text && item.text.toLowerCase().includes(searchTerm);
                const dateMatch = date.includes(searchTerm);
                return textMatch || dateMatch;
            });
            console.log('Filtered history:', this.filteredHistory.length, 'items found');
        }
        
        this.render();
    }

    handleGridClick(e) {
        // Handle selection mode - make entire card clickable
        if (this.isSelectMode) {
            // Don't handle selection if clicking on action buttons
            const actionBtn = e.target.closest('.action-btn');
            if (actionBtn) {
                // Handle action button clicks normally even in selection mode
                const id = actionBtn.dataset.id;
                const action = actionBtn.dataset.action;
                this.handleActionClick(action, id);
                return;
            }
            
            // Handle card selection - find the history item
            const historyItem = e.target.closest('.history-item');
            if (historyItem) {
                // Find the checkbox inside this item to get the ID
                const checkbox = historyItem.querySelector('.selection-checkbox');
                if (checkbox) {
                    const id = checkbox.dataset.id;
                    this.toggleSelection(id);
                    return;
                }
            }
            return;
        }

        // Normal mode - only handle action button clicks
        const button = e.target.closest('.action-btn');
        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;
        this.handleActionClick(action, id);
    }
    
    handleActionClick(action, id) {
        switch (action) {
            case 'copy':
                this.copyText(id);
                break;
            case 'download':
                this.downloadText(id);
                break;
            case 'delete':
                this.confirmDeleteOne(id);
                break;
        }
    }
    
    render() {
        this.elements.grid.innerHTML = '';

        if (this.filteredHistory.length === 0) {
            this.elements.emptyState.style.display = 'block';
            this.elements.grid.style.display = 'none';
        } else {
            this.elements.emptyState.style.display = 'none';
            this.elements.grid.style.display = 'grid';
            const fragment = document.createDocumentFragment();
            this.filteredHistory.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = `history-item ${this.isSelectMode ? 'selection-mode' : ''} ${this.selectedIds.has(item.id) ? 'selected' : ''}`;
                itemEl.innerHTML = this.getItemHTML(item);
                fragment.appendChild(itemEl);
            });
            this.elements.grid.appendChild(fragment);
        }

        // Update selection info
        this.updateSelectionInfo();
    }
    

    getItemHTML(item) {
        const date = new Date(item.timestamp);
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const duration = item.duration ? `${Math.round(item.duration)}s` : 'N/A';
        const words = item.wordCount ? `${item.wordCount} words` : 'N/A';

        const checkbox = this.isSelectMode ? 
            `<input type="checkbox" class="selection-checkbox" id="checkbox-${item.id}" data-id="${item.id}" ${this.selectedIds.has(item.id) ? 'checked' : ''}>
             <label class="checkbox-label" for="checkbox-${item.id}">
                 <span class="custom-checkbox"></span>
             </label>` 
            : '';

        return `
            <div class="item-content">
                ${checkbox}
                <div class="item-main">
                    <div class="item-header">
                        <div class="item-meta">
                            <div class="date">${dateStr} at ${timeStr}</div>
                            <div class="stats">${words} &bull; ${duration}</div>
                        </div>
                        <div class="item-actions">
                            <button class="action-btn" data-action="copy" data-id="${item.id}" title="Copy"><span class="material-icons">content_copy</span></button>
                            <button class="action-btn" data-action="download" data-id="${item.id}" title="Download"><span class="material-icons">download</span></button>
                            <button class="action-btn" data-action="delete" data-id="${item.id}" title="Delete"><span class="material-icons">delete</span></button>
                        </div>
                    </div>
                    <p class="item-text">${item.text}</p>
                </div>
            </div>
        `;
    }

    // --- Actions ---

    async copyText(id) {
        const item = this.fullHistory.find(i => i.id === id);
        if (item) {
            await navigator.clipboard.writeText(item.text);
            this.showToast('Copied to clipboard!');
        }
    }

    downloadText(id) {
        const item = this.fullHistory.find(i => i.id === id);
        if (item) {
            const blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whisper-transcription-${item.timestamp.split('T')[0]}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
    
    async deleteOne(id) {
        this.fullHistory = this.fullHistory.filter(i => i.id !== id);
        await this.saveHistory();
        this.handleSearch(this.elements.searchBox.value); // Re-filter and render
        this.showToast('Transcription deleted.');
    }

    async clearAll() {
        this.fullHistory = [];
        await this.saveHistory();
        this.handleSearch('');
        this.showToast('All history cleared.');
    }

    exportAll() {
        if(this.fullHistory.length === 0) {
            this.showToast('Nothing to export.', 'warning');
            return;
        }
        const dataStr = JSON.stringify(this.fullHistory, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whisper-history-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    async saveHistory() {
        await chrome.storage.local.set({ history: this.fullHistory });
    }

    // --- Modal Logic ---

    openModal(title, body, onConfirm) {
        this.elements.modalTitle.textContent = title;
        this.elements.modalBody.textContent = body;
        this.elements.modal.classList.add('visible');
        
        // Clone and replace the confirm button to remove old event listeners
        const newConfirmBtn = this.elements.modalConfirm.cloneNode(true);
        this.elements.modalConfirm.parentNode.replaceChild(newConfirmBtn, this.elements.modalConfirm);
        this.elements.modalConfirm = newConfirmBtn;
        
        this.elements.modalConfirm.addEventListener('click', () => {
            onConfirm();
            this.closeModal();
        }, { once: true });
    }

    closeModal() {
        this.elements.modal.classList.remove('visible');
    }

    confirmDeleteOne(id) {
        this.openModal(
            'Delete Transcription?',
            'Are you sure you want to permanently delete this transcription?',
            () => this.deleteOne(id)
        );
    }

    confirmClearAll() {
        if (this.fullHistory.length === 0) {
            this.showToast('History is already empty.', 'warning');
            return;
        }
        this.openModal(
            'Clear All History?',
            `Are you sure you want to permanently delete all ${this.fullHistory.length} transcriptions? This cannot be undone.`,
            () => this.clearAll()
        );
    }

    showToast(message, type = 'success') {
        // Use shared notification system
        window.NotificationManager.show(message, type);
    }

    // --- Selection Mode Functions ---

    toggleSelectMode() {
        this.isSelectMode = !this.isSelectMode;
        this.selectedIds.clear();
        
        // Update button state
        this.elements.selectBtn.classList.toggle('active', this.isSelectMode);
        this.elements.selectBtn.innerHTML = this.isSelectMode ? 
            '<span class="material-icons">close</span>Cancel' : 
            '<span class="material-icons">checklist</span>Select';
        
        // Show/hide bulk actions
        this.elements.bulkActions.classList.toggle('show', this.isSelectMode);
        
        this.render();
    }

    toggleSelection(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this.render();
    }

    selectAll() {
        this.filteredHistory.forEach(item => {
            this.selectedIds.add(item.id);
        });
        this.render();
    }

    deselectAll() {
        this.selectedIds.clear();
        this.render();
    }

    updateSelectionInfo() {
        if (this.elements.selectionInfo) {
            const count = this.selectedIds.size;
            this.elements.selectionInfo.textContent = `${count} selected`;
            
            // Add select/deselect all functionality to the selection info
            this.elements.selectionInfo.onclick = () => {
                if (this.selectedIds.size === this.filteredHistory.length) {
                    this.deselectAll();
                } else {
                    this.selectAll();
                }
            };
            this.elements.selectionInfo.style.cursor = 'pointer';
            this.elements.selectionInfo.title = this.selectedIds.size === this.filteredHistory.length ? 
                'Click to deselect all' : 'Click to select all';
        }
    }

    async copySelected() {
        if (this.selectedIds.size === 0) {
            this.showToast('No items selected', 'warning');
            return;
        }

        const selectedItems = this.fullHistory.filter(item => this.selectedIds.has(item.id));
        const text = selectedItems.map(item => item.text).join('\n\n---\n\n');
        
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(`Copied ${selectedItems.length} transcriptions to clipboard!`);
        } catch (error) {
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }

    showExportOptions() {
        if (this.selectedIds.size === 0) {
            this.showToast('No items selected', 'warning');
            return;
        }

        // Create export options modal
        const modal = document.createElement('div');
        modal.className = 'modal visible';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 1;
            visibility: visible;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background-color: rgba(26,26,47,0.95);
                backdrop-filter: blur(20px);
                border: 1px solid var(--color-outline);
                border-radius: 12px;
                padding: 24px;
                max-width: 400px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                transform: scale(1);
            ">
                <h3 style="margin-bottom: 16px; color: var(--color-text-primary);">Export Selected Transcriptions</h3>
                <p style="margin-bottom: 20px; color: var(--color-text-secondary);">Choose export format for ${this.selectedIds.size} selected transcriptions:</p>
                <div class="modal-buttons" style="
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                ">
                    <button class="btn-secondary" id="exportSingleFile" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 16px;
                        min-width: auto;
                    ">
                        <span class="material-icons">description</span>
                        Single Text File
                    </button>
                    <button class="btn-secondary" id="exportZipFile" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 16px;
                        min-width: auto;
                    ">
                        <span class="material-icons">archive</span>
                        Zipped Files
                    </button>
                    <button class="btn-danger" id="cancelExport" style="
                        padding: 12px 16px;
                        min-width: auto;
                    ">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle export option clicks
        modal.querySelector('#exportSingleFile').onclick = () => {
            this.exportSelectedAsSingleFile();
            modal.remove();
        };

        modal.querySelector('#exportZipFile').onclick = () => {
            this.exportSelectedAsZip();
            modal.remove();
        };

        modal.querySelector('#cancelExport').onclick = () => {
            modal.remove();
        };

        // Close on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    exportSelectedAsSingleFile() {
        const selectedItems = this.fullHistory.filter(item => this.selectedIds.has(item.id));
        const today = new Date().toISOString().split('T')[0];
        const filename = `${today}-History-Yappr-Export.txt`;
        
        const content = selectedItems.map(item => {
            const date = new Date(item.timestamp);
            const dateStr = date.toLocaleDateString();
            const timeStr = date.toLocaleTimeString();
            return `[${dateStr} ${timeStr}]\n${item.text}`;
        }).join('\n\n---\n\n');

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast(`Exported ${selectedItems.length} transcriptions as ${filename}`);
    }

    async exportSelectedAsZip() {
        // Simple zip implementation using a library would be ideal,
        // but for now we'll create a simple archive format
        const selectedItems = this.fullHistory.filter(item => this.selectedIds.has(item.id));
        const today = new Date().toISOString().split('T')[0];
        
        // Create individual files content
        const files = selectedItems.map((item, index) => {
            const date = new Date(item.timestamp);
            const dateStr = date.toISOString().split('T')[0];
            const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
            const filename = `transcription_${dateStr}_${timeStr}.txt`;
            
            return {
                name: filename,
                content: item.text
            };
        });

        // For now, create a tar-like format (simple concatenation with headers)
        let tarContent = '';
        files.forEach(file => {
            tarContent += `=== ${file.name} ===\n${file.content}\n\n`;
        });

        const blob = new Blob([tarContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${today}-History-Yappr-Export.txt`;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast(`Exported ${selectedItems.length} transcriptions as archive`);
    }

    confirmDeleteSelected() {
        if (this.selectedIds.size === 0) {
            this.showToast('No items selected', 'warning');
            return;
        }

        this.openModal(
            'Delete Selected Transcriptions?',
            `Are you sure you want to permanently delete ${this.selectedIds.size} selected transcriptions? This cannot be undone.`,
            () => this.deleteSelected()
        );
    }

    async deleteSelected() {
        const selectedIds = Array.from(this.selectedIds);
        this.fullHistory = this.fullHistory.filter(item => !selectedIds.includes(item.id));
        await this.saveHistory();
        
        this.selectedIds.clear();
        this.isSelectMode = false;
        this.toggleSelectMode(); // Reset UI
        
        this.handleSearch(this.elements.searchBox.value);
        this.showToast(`Deleted ${selectedIds.length} transcriptions`);
    }

    async showFolderAssignOptions() {
        if (this.selectedIds.size === 0) {
            this.showToast('No items selected', 'warning');
            return;
        }

        // Get folders from storage
        const { folders = [] } = await chrome.storage.local.get('folders');
        
        if (folders.length === 0) {
            this.showToast('No folders available. Create folders first.', 'warning');
            return;
        }

        // Create folder selection modal
        const modal = document.createElement('div');
        modal.className = 'modal visible';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 1;
            visibility: visible;
        `;
        modal.innerHTML = `
            <div class="modal-content" style="
                background-color: rgba(26,26,47,0.95);
                backdrop-filter: blur(20px);
                border: 1px solid var(--color-outline);
                border-radius: 12px;
                padding: 24px;
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                transform: scale(1);
            ">
                <h3 style="margin-bottom: 16px; color: var(--color-text-primary);">Assign to Folder</h3>
                <p style="margin-bottom: 20px; color: var(--color-text-secondary);">Assign ${this.selectedIds.size} selected transcriptions to:</p>
                <div class="folder-options" style="max-height: 300px; overflow-y: auto; margin: 16px 0;">
                    ${folders.map(folder => `
                        <div class="folder-option" data-folder-id="${folder.id}" style="
                            padding: 12px; 
                            border: 1px solid var(--color-outline); 
                            border-radius: 8px; 
                            margin-bottom: 8px; 
                            cursor: pointer;
                            transition: all 0.2s ease;
                        ">
                            <div style="font-weight: bold; color: var(--color-text-primary);">${folder.name}</div>
                            <div style="font-size: 0.9em; color: var(--color-text-secondary); font-style: italic;">"${folder.activationPhrase}"</div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-buttons" style="
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                ">
                    <button class="btn-secondary" id="unassignFolder" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 16px;
                        min-width: auto;
                    ">
                        <span class="material-icons">folder_off</span>
                        Remove from Folders
                    </button>
                    <button class="btn-danger" id="cancelAssign" style="
                        padding: 12px 16px;
                        min-width: auto;
                    ">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add hover effects to folder options
        const style = document.createElement('style');
        style.textContent = `
            .folder-option:hover {
                background-color: rgba(169, 111, 255, 0.1) !important;
                border-color: var(--accent) !important;
            }
        `;
        document.head.appendChild(style);

        // Handle folder selection
        modal.querySelectorAll('.folder-option').forEach(option => {
            option.onclick = () => {
                const folderId = option.dataset.folderId;
                const folderName = option.querySelector('div').textContent;
                this.assignSelectedToFolder(folderId, folderName);
                modal.remove();
                style.remove();
            };
        });

        // Handle unassign
        modal.querySelector('#unassignFolder').onclick = () => {
            this.assignSelectedToFolder(null, null);
            modal.remove();
            style.remove();
        };

        modal.querySelector('#cancelAssign').onclick = () => {
            modal.remove();
            style.remove();
        };

        // Close on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                style.remove();
            }
        };
    }

    async assignSelectedToFolder(folderId, folderName) {
        const selectedIds = Array.from(this.selectedIds);
        
        // Update history items
        this.fullHistory = this.fullHistory.map(item => {
            if (selectedIds.includes(item.id)) {
                return {
                    ...item,
                    folderId: folderId,
                    folderName: folderName
                };
            }
            return item;
        });

        await this.saveHistory();
        this.handleSearch(this.elements.searchBox.value);
        
        if (folderId) {
            this.showToast(`Assigned ${selectedIds.length} transcriptions to "${folderName}"`);
        } else {
            this.showToast(`Removed ${selectedIds.length} transcriptions from folders`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WhisperHistoryPage();
});