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
        storagePath: './generated-images',
        basePhoto: null
      });
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
    // File upload
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('base-photo');
    const removePhoto = document.getElementById('remove-photo');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileUpload(e.target.files[0]);
      }
    });

    removePhoto.addEventListener('click', () => {
      this.removeBasePhoto();
    });

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
    enabledToggle.addEventListener('click', () => {
      this.settings.isEnabled = !this.settings.isEnabled;
      enabledToggle.classList.toggle('active', this.settings.isEnabled);
    });

    // Buttons
    document.getElementById('generate-images').addEventListener('click', () => {
      this.generateImages();
    });

    document.getElementById('force-update').addEventListener('click', () => {
      this.forceUpdate();
    });

    document.getElementById('save-settings').addEventListener('click', () => {
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
    if (!file.type.startsWith('image/')) {
      this.showStatus('Please select an image file', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      this.showStatus('File size too large (max 10MB)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.settings.basePhoto = {
        name: file.name,
        data: e.target.result,
        size: file.size,
        type: file.type
      };
      this.showBasePhoto(this.settings.basePhoto);
      this.showStatus('Base photo uploaded successfully', 'success');
    };
    reader.readAsDataURL(file);
  }

  showBasePhoto(photo) {
    const uploadArea = document.getElementById('upload-area');
    const photoPreview = document.getElementById('photo-preview');
    const previewImg = document.getElementById('preview-img');

    uploadArea.classList.add('hidden');
    photoPreview.classList.remove('hidden');
    previewImg.src = photo.data;
  }

  removeBasePhoto() {
    this.settings.basePhoto = null;
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('photo-preview').classList.add('hidden');
  }

  async generateImages() {
    if (!this.settings.basePhoto) {
      this.showStatus('Please upload a base photo first', 'error');
      return;
    }

    this.showStatus('Generating images...', 'info');
    
    try {
      // Send message to background script to trigger image generation
      const response = await chrome.runtime.sendMessage({
        action: 'generateImages',
        basePhoto: this.settings.basePhoto,
        numImages: this.settings.numImages
      });

      if (response.success) {
        this.showStatus(`Generated ${this.settings.numImages} images successfully`, 'success');
      } else {
        this.showStatus('Error generating images: ' + response.error, 'error');
      }
    } catch (error) {
      console.error('Error generating images:', error);
      this.showStatus('Error generating images', 'error');
    }
  }

  async forceUpdate() {
    this.showStatus('Updating profile picture...', 'info');
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'forceUpdate' });
      if (response.success) {
        this.showStatus('Profile picture updated successfully', 'success');
      } else {
        this.showStatus('Error updating profile picture', 'error');
      }
    } catch (error) {
      console.error('Error forcing update:', error);
      this.showStatus('Error updating profile picture', 'error');
    }
  }

  showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.classList.remove('hidden');

    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.classList.add('hidden');
      }, 3000);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
