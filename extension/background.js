// Background service worker for scheduling and automation
class LinkedInAutoUpdater {
  constructor() {
    this.backendUrl = 'http://localhost:3000';
    this.init();
  }

  async init() {
    // Set up alarm listener
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'linkedin-profile-update') {
        this.handleScheduledUpdate();
      }
    });

    // Initialize default settings
    await this.initializeSettings();

    // Schedule on startup
    await this.scheduleNextUpdate();
  }

  async initializeSettings() {
    const defaultSettings = {
      isEnabled: true,
      frequency: 'weekly', // daily, weekly, custom
      customInterval: 7, // days for custom frequency
      numImages: 10,
      currentImageIndex: 0,
      lastUpdate: null,
      storagePath: './generated-images'
    };

    const result = await chrome.storage.sync.get(defaultSettings);
    await chrome.storage.sync.set(result);
  }

  async handleScheduledUpdate() {
    try {
      const settings = await chrome.storage.sync.get();
      
      if (!settings.isEnabled) {
        console.log('Auto-update is disabled');
        return;
      }

      // Check if we have generated images
      const images = await this.getStoredImages();
      if (images.length === 0) {
        console.log('No images available for update');
        return;
      }

      // Ensure we have a LinkedIn profile tab open
      let [tab] = await chrome.tabs.query({ url: '*://www.linkedin.com/*' });
      if (!tab) {
        tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/in/me/' });
      } else if (!/linkedin\.com\/in\//i.test(tab.url)) {
        await chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/in/me/' });
      }

      // Wait for the page to load
      await this.waitForTabLoad(tab.id);

      // Pick current image
      const image = images[settings.currentImageIndex % images.length];

      // Tell content script to update
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'updateProfilePicture',
        imagePath: image.path,
        imageName: image.name
      }).catch(err => ({ success: false, error: err?.message }));

      if (!response || response.success !== true) {
        console.warn('Content script did not confirm update start:', response?.error || 'No response');
      }

      // Update index for next time
      const nextIndex = (settings.currentImageIndex + 1) % images.length;
      await chrome.storage.sync.set({ 
        currentImageIndex: nextIndex,
        lastUpdate: Date.now()
      });

      console.log('Profile picture update triggered');

    } catch (error) {
      console.error('Error during scheduled update:', error);
    }
  }

  async waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  async getStoredImages() {
    try {
      const response = await fetch(`${this.backendUrl}/images`);
      const data = await response.json();
      
      if (data.success) {
        return data.images.map(img => ({
          path: `${this.backendUrl}/images/${img.filename}`,
          name: img.filename
        }));
      } else {
        console.error('Error fetching stored images:', data.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching stored images:', error);
      return [];
    }
  }

  async scheduleNextUpdate() {
    const settings = await chrome.storage.sync.get();
    
    if (!settings.isEnabled) {
      await chrome.alarms.clear('linkedin-profile-update');
      return;
    }

    let intervalMinutes;
    switch (settings.frequency) {
      case 'daily':
        intervalMinutes = 24 * 60;
        break;
      case 'weekly':
        intervalMinutes = 7 * 24 * 60;
        break;
      case 'custom':
        intervalMinutes = settings.customInterval * 24 * 60;
        break;
      default:
        intervalMinutes = 7 * 24 * 60; // weekly default
    }

    // Clear existing alarm
    await chrome.alarms.clear('linkedin-profile-update');
    
    // Set new alarm
    await chrome.alarms.create('linkedin-profile-update', {
      delayInMinutes: 1, // first run soon for testing; then period applies
      periodInMinutes: intervalMinutes
    });

    console.log(`Next update scheduled every ${intervalMinutes} minutes`);
  }

  async forceUpdate() {
    await this.handleScheduledUpdate();
  }

  async generateImages(basePhoto, numImages) {
    try {
      const response = await fetch(`${this.backendUrl}/generate-images-base64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          basePhoto: basePhoto.data,
          numImages: numImages
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`Generated ${result.count} images successfully`);
        return { success: true, count: result.count };
      } else {
        console.error('Error generating images:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error generating images:', error);
      return { success: false, error: error.message };
    }
  }

  async generateFromBase(numImages) {
    try {
      const response = await fetch(`${this.backendUrl}/generate-from-base`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numImages })
      });
      const result = await response.json();
      if (result.success) {
        console.log(`Generated ${result.count} images from base folder`);
        return { success: true, count: result.count };
      } else {
        console.error('Error generating from base:', result.error);
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Error generating from base:', error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize the auto updater
const autoUpdater = new LinkedInAutoUpdater();

/* Handles uploads so work continues after the popup closes */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'uploadBasePhoto') {
    (async () => {
      try {
        const blob = new Blob([msg.buffer], { type: msg.type || 'application/octet-stream' });
        const form = new FormData();
        form.append('image', blob, msg.name || 'upload.jpg');

        const res = await fetch('http://localhost:3000/upload-base', { method: 'POST', body: form });
        const json = await res.json();
        sendResponse({ ok: res.ok && json?.ok, ...json });
      } catch (e) {
        console.error('uploadBasePhoto failed:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // keep the message channel open for async response
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'scheduleUpdate':
      autoUpdater.scheduleNextUpdate();
      sendResponse({ success: true });
      break;
    case 'forceUpdate':
      autoUpdater.forceUpdate();
      sendResponse({ success: true });
      break;
    case 'generateImages':
      autoUpdater.generateImages(request.basePhoto, request.numImages)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open for async response
    case 'getSettings':
      chrome.storage.sync.get().then(settings => {
        sendResponse({ settings });
      });
      return true; // Keep message channel open for async response
    case 'updateSettings':
      chrome.storage.sync.set(request.settings).then(() => {
        autoUpdater.scheduleNextUpdate();
        sendResponse({ success: true });
      });
      return true;
    case 'generateFromBase':
      autoUpdater.generateFromBase(request.numImages)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
  }
});
