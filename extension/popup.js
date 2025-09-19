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
    // File upload
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('base-photo');
    const removePhoto = document.getElementById('remove-photo');

    console.log('Setting up event listeners...');
    console.log('Upload area:', uploadArea);
    console.log('File input:', fileInput);

    uploadArea.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Upload area clicked');
      console.log('File input element:', fileInput);
      console.log('File input display:', fileInput.style.display);
      console.log('File input visibility:', fileInput.offsetParent);
      
      // Try multiple approaches to trigger file input
      try {
        fileInput.click();
        console.log('File input click() called');
      } catch (error) {
        console.error('Error clicking file input:', error);
      }
      
      // Alternative approach - create a new file input
      setTimeout(() => {
        if (!fileInput.files || fileInput.files.length === 0) {
          console.log('File input not triggered, trying alternative approach');
          const newFileInput = document.createElement('input');
          newFileInput.type = 'file';
          newFileInput.accept = 'image/*';
          newFileInput.style.display = 'none';
          document.body.appendChild(newFileInput);
          
          newFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
              console.log('Alternative file input triggered');
              this.handleFileUpload(e.target.files[0]);
            }
            document.body.removeChild(newFileInput);
          });
          
          newFileInput.click();
        }
      }, 100);
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
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('File input changed, files:', e.target.files.length);
      if (e.target.files.length > 0) {
        console.log('Processing file:', e.target.files[0].name);
        // Use setTimeout to prevent popup from closing
        setTimeout(() => {
          this.handleFileUpload(e.target.files[0]);
        }, 10);
      }
      return false;
    });

    removePhoto.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
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
      console.log('Invalid file type:', file.type);
      this.showStatus('Please select an image file', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      console.log('File too large:', file.size);
      this.showStatus('File size too large (max 10MB)', 'error');
      return;
    }

    console.log('File is valid, reading...');
    const reader = new FileReader();
    reader.onload = async (e) => {
      console.log('File read successfully');
      this.settings.basePhoto = {
        name: file.name,
        data: e.target.result,
        size: file.size,
        type: file.type
      };
      this.showBasePhoto(this.settings.basePhoto);
      this.showStatus('Base photo uploaded successfully', 'success');

      // ✅ Persist to chrome.storage.local immediately (larger quota)
      try {
        await chrome.storage.local.set({ basePhoto: this.settings.basePhoto });
        console.log('Base photo saved to local storage');
      } catch (err) {
        console.error('Error saving base photo:', err);
      }
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

  async removeBasePhoto() {
    this.settings.basePhoto = null;
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('photo-preview').classList.add('hidden');
    
    // Remove from storage
    try {
      await chrome.storage.local.remove(['basePhoto']);
      console.log('Base photo removed from storage');
    } catch (err) {
      console.error('Error removing base photo from storage:', err);
    }
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