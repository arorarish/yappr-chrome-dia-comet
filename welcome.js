document.getElementById('openSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
});

document.getElementById('testRecording').addEventListener('click', () => {
    // Close welcome and open popup for test recording
    window.close();
    chrome.action.openPopup();
});

// Mark welcome as seen
chrome.storage.local.set({ welcomeSeen: true });