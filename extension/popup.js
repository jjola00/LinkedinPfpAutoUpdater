// Popup UI logic
class PopupController {
  constructor() {
    this.settings = {};
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        isEnabled: true,
        frequency: 'weekly',
        customInterval: 7,
        numImages: 10,
        currentImageIndex: 0,
        lastUpdate: null,
        storagePath: './generated-images'
      });
      
      // Load base photo from local storage (larger quota)
      const localResult = await chrome.storage.local.get(['basePhoto']);
      result.basePhoto = localResult.basePhoto || null;
      
      this.settings = result;
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showStatus('Error loading settings', 'error');
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set(this.settings);
      this.showStatus('Settings saved successfully', 'success');
      
      // Notify background script to reschedule
      chrome.runtime.sendMessage({ action: 'updateSettings', settings: this.settings });
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showStatus('Error saving settings', 'error');
    }
  }

  setupEventListeners() {
    if (this._listenersSetup) return; // prevent duplicates
    this._listenersSetup = true;

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('base-photo');
    const removePhoto = document.getElementById('remove-photo');

    if (uploadArea && fileInput) {
      uploadArea.addEventListener('click', () => {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const [file] = e.target.files || [];
        if (!file) return;
        await this.handleFileUpload(file);
        // do not depend on popup staying open
      });
    }

    if (removePhoto) {
      removePhoto.addEventListener('click', () => this.removeBasePhoto());
    }

    // Number of images slider
    const numImagesSlider = document.getElementById('num-images');
    const numImagesValue = document.getElementById('num-images-value');
    
    numImagesSlider.addEventListener('input', (e) => {
      const value = e.target.value;
      numImagesValue.textContent = value;
      this.settings.numImages = parseInt(value);
    });

    // Frequency dropdown
    const frequencySelect = document.getElementById('frequency');
    const customInterval = document.getElementById('custom-interval');
    
    frequencySelect.addEventListener('change', (e) => {
      this.settings.frequency = e.target.value;
      if (e.target.value === 'custom') {
        customInterval.classList.remove('hidden');
      } else {
        customInterval.classList.add('hidden');
      }
    });

    // Custom interval input
    const customDays = document.getElementById('custom-days');
    customDays.addEventListener('input', (e) => {
      this.settings.customInterval = parseInt(e.target.value);
    });

    // Toggle switch
    const enabledToggle = document.getElementById('enabled');
    enabledToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.settings.isEnabled = !this.settings.isEnabled;
      enabledToggle.classList.toggle('active', this.settings.isEnabled);
    });

    // Buttons
    document.getElementById('generate-images').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.generateImages();
    });

    document.getElementById('force-update').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.forceUpdate();
    });

    document.getElementById('save-settings').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.saveSettings();
    });
  }

  updateUI() {
    // Update slider
    document.getElementById('num-images').value = this.settings.numImages;
    document.getElementById('num-images-value').textContent = this.settings.numImages;

    // Update frequency
    document.getElementById('frequency').value = this.settings.frequency;
    if (this.settings.frequency === 'custom') {
      document.getElementById('custom-interval').classList.remove('hidden');
    }
    document.getElementById('custom-days').value = this.settings.customInterval;

    // Update toggle
    const enabledToggle = document.getElementById('enabled');
    enabledToggle.classList.toggle('active', this.settings.isEnabled);

    // Update base photo if exists
    if (this.settings.basePhoto) {
      this.showBasePhoto(this.settings.basePhoto);
    }
  }

  async handleFileUpload(file) {
    try {
      if (!file.type.startsWith('image/')) {
        this.showStatus('Please upload an image file.', 'error'); return;
      }
      if (file.size > 10 * 1024 * 1024) {
        this.showStatus('Max file size is 10MB.', 'error'); return;
      }

      this.showStatus('Uploading base photo...', 'info');

      const buffer = await file.arrayBuffer();
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'uploadBasePhoto', name: file.name, type: file.type, buffer },
          (res) => resolve(res || { ok: false, error: chrome.runtime.lastError?.message })
        );
      });

      if (!resp?.ok) throw new Error(resp?.error || 'Upload failed');

      // Save minimal state and update preview; background already stored file
      this.settings.basePhoto = resp.filename || 'base.jpg';
      await this.saveSettings();

      this.showBasePhoto(URL.createObjectURL(file));
      this.showStatus('Base photo uploaded successfully!', 'success');
    } catch (e) {
      console.error(e);
      this.showStatus('Upload failed. Is the backend running?', 'error');
    }
  }

  showBasePhoto(photoUrl) {
    const uploadArea = document.getElementById('upload-area');
    uploadArea.style.backgroundImage = `url(${photoUrl})`;
    uploadArea.style.backgroundSize = 'cover';
    uploadArea.classList.add('has-image');
  }

  async removeBasePhoto() {
    try {
      this.settings.basePhoto = null;
      
      // Update UI
      document.getElementById('upload-area').classList.remove('hidden');
      document.getElementById('photo-preview').classList.add('hidden');
      
      // Remove from chrome storage
      await chrome.storage.local.remove(['basePhoto']);
      console.log('Base photo removed from storage');
      
      // Clear file input
      document.getElementById('base-photo').value = '';
      
      this.showStatus('Base photo removed', 'info');
    } catch (error) {
      console.error('Error removing base photo:', error);
      this.showStatus('Error removing photo', 'error');
    }
  }

  async generateImages() {
    // Prefer generating from local base folder to avoid popup upload issues
    const num = this.settings.numImages || Number(document.getElementById('num-images')?.value) || 10;
    this.showStatus('Generating images from base folder...', 'info');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'generateFromBase', numImages: num });
      if (response && response.success) {
        this.showStatus(`Generated ${response.count} images`, 'success');
      } else {
        this.showStatus(`Generation failed: ${response?.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Error generating from base:', error);
      this.showStatus('Error generating images', 'error');
    }
  }

  async forceUpdate() {
    this.showStatus('Updating profile picture...', 'info');
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'forceUpdate' });
      if (response && response.success) {
        this.showStatus('Profile picture updated successfully', 'success');
      } else {
        this.showStatus('Error updating profile picture', 'error');
      }
    } catch (error) {
      console.error('Error forcing update:', error);
      this.showStatus('Error updating profile picture', 'error');
    }
  }

  showStatus(message, type = 'info') {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = message;
    el.className = `status ${type}`;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing popup controller');
  new PopupController();
});