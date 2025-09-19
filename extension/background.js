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

      // Get the current tab (LinkedIn)
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        console.log('No active tab found');
        return;
      }

      const currentTab = tabs[0];
      
      // Check if we're on LinkedIn
      if (!currentTab.url.includes('linkedin.com')) {
        console.log('Not on LinkedIn, skipping update');
        return;
      }

      // Execute content script to update profile picture
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: this.updateProfilePicture,
        args: [settings.currentImageIndex, images]
      });

      // Update index for next time
      const nextIndex = (settings.currentImageIndex + 1) % images.length;
      await chrome.storage.sync.set({ 
        currentImageIndex: nextIndex,
        lastUpdate: Date.now()
      });

      console.log('Profile picture updated successfully');

    } catch (error) {
      console.error('Error during scheduled update:', error);
    }
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

  // Function to be injected into content script
  updateProfilePicture(imageIndex, images) {
    // This function runs in the content script context
    console.log('Updating profile picture with image:', images[imageIndex]);
    
    // Find and click the profile picture edit button
    const editButton = document.querySelector('[data-control-name="edit_photo"]');
    if (editButton) {
      editButton.click();
      
      // Wait for modal to open, then handle file upload
      setTimeout(() => {
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
          // This would need to be handled by the content script
          // as we can't directly access local files from background script
          console.log('File input found, ready for upload');
        }
      }, 1000);
    }
  }

  async scheduleNextUpdate() {
    const settings = await chrome.storage.sync.get();
    
    if (!settings.isEnabled) {
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
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes
    });

    console.log(`Next update scheduled in ${intervalMinutes} minutes`);
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
}

// Initialize the auto updater
const autoUpdater = new LinkedInAutoUpdater();

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
  }
});
