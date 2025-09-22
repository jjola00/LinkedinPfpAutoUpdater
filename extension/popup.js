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

    console.log('Setting up event listeners...');

    if (fileInput) {
      fileInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    if (uploadArea) {
      uploadArea.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Upload area clicked - triggering file input');
        fileInput?.click();
      });

      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });

      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });

      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer?.files || [];
        if (files.length > 0) {
          this.handleFileUpload(files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        console.log('File input changed');
        const file = e.target.files?.[0];
        if (file) {
          console.log('File selected:', file.name);
          this.handleFileUpload(file);
        }
      });
    }

    if (removePhoto) {
      removePhoto.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeBasePhoto();
      });
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

  handleFileUpload(file) {
    console.log('Handling file upload:', file.name, file.type, file.size);
    if (!file.type.startsWith('image/')) {
      this.showStatus('Please upload an image file.', 'error'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.showStatus('Max file size is 10MB.', 'error'); return;
    }
    const form = new FormData();
    form.append('image', file, file.name);
    this.showStatus('Uploading base photo...', 'info');
    fetch('http://localhost:3000/upload-base', { method: 'POST', body: form })
      .then(r => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Upload failed');
        this.settings.basePhoto = j.filename; // stored in temp on server
        this.saveSettings();
        this.showBasePhoto(URL.createObjectURL(file));
        this.showStatus('Base photo uploaded successfully!', 'success');
      })
      .catch(e => {
        console.error(e);
        this.showStatus('Upload failed. Is the backend running?', 'error');
      });
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
    try {
      const count = Number(document.getElementById('num-images').value || 1);
      this.showStatus(`Generating ${count} images...`, 'info');
      const res = await fetch('http://localhost:3000/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Generation failed');
      this.showStatus(`Generated ${json.files.length} images.`, 'success');
    } catch (e) {
      console.error(e);
      this.showStatus('Generation failed. Check backend logs.', 'error');
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