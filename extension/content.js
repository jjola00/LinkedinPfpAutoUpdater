// Content script for LinkedIn automation
class LinkedInAutomation {
  constructor() {
    this.init();
  }

  init() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'updateProfilePicture') {
        this.updateProfilePicture(request.imagePath, request.imageName);
        sendResponse({ success: true });
      }
    });
  }

  async updateProfilePicture(imagePath, imageName) {
    try {
      console.log('Starting profile picture update with:', imageName);
      
      // Navigate to profile edit page if not already there
      if (!window.location.href.includes('/in/me/')) {
        window.location.href = 'https://www.linkedin.com/in/me/';
        await this.waitForPageLoad();
      }

      // Find and click the profile picture edit button
      const editButton = await this.findProfilePictureEditButton();
      if (!editButton) {
        throw new Error('Could not find profile picture edit button');
      }

      editButton.click();
      await this.sleep(1000);

      // Wait for the upload modal to appear
      const fileInput = await this.waitForFileInput();
      if (!fileInput) {
        throw new Error('Could not find file input');
      }

      // Create a file object from the image path
      const file = await this.createFileFromPath(imagePath, imageName);
      if (!file) {
        throw new Error('Could not create file from path');
      }

      // Upload the file
      await this.uploadFile(fileInput, file);
      
      // Wait for upload to complete and save
      await this.waitForUploadComplete();
      await this.saveChanges();

      console.log('Profile picture updated successfully');

    } catch (error) {
      console.error('Error updating profile picture:', error);
      throw error;
    }
  }

  async findProfilePictureEditButton() {
    const selectors = [
      '[data-control-name="edit_photo"]',
      'button[aria-label*="photo"]',
      'button[aria-label*="picture"]',
      '.pv-top-card__photo-edit-button',
      'button:contains("Edit photo")'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        return element;
      }
    }

    // If not found, try to find any button near the profile picture
    const profilePicture = document.querySelector('.pv-top-card__photo img, .profile-photo img');
    if (profilePicture) {
      const parent = profilePicture.closest('.pv-top-card__photo, .profile-photo');
      if (parent) {
        const button = parent.querySelector('button');
        if (button) {
          return button;
        }
      }
    }

    return null;
  }

  async waitForFileInput() {
    const maxAttempts = 10;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput && fileInput.offsetParent !== null) {
        return fileInput;
      }
      await this.sleep(500);
      attempts++;
    }

    return null;
  }

  async createFileFromPath(imagePath, imageName) {
    try {
      // Fetch the image from the backend server
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      const blob = await response.blob();
      const file = new File([blob], imageName, { type: blob.type });
      return file;
    } catch (error) {
      console.error('Error creating file from path:', error);
      return null;
    }
  }

  async uploadFile(fileInput, file) {
    // Create a new FileList with our file
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Trigger the change event
    const changeEvent = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(changeEvent);

    // Also trigger input event
    const inputEvent = new Event('input', { bubbles: true });
    fileInput.dispatchEvent(inputEvent);
  }

  async waitForUploadComplete() {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Look for upload progress indicators
      const progressIndicator = document.querySelector('.upload-progress, .loading, [data-test-id="upload-progress"]');
      if (!progressIndicator) {
        // Upload might be complete
        await this.sleep(1000);
        return;
      }
      await this.sleep(500);
    }

    console.log('Upload timeout reached');
  }

  async saveChanges() {
    // Look for save button
    const saveButton = document.querySelector('button[data-control-name="save"], button:contains("Save"), .save-button');
    if (saveButton) {
      saveButton.click();
      await this.sleep(2000);
    }

    // Also try to find and click any "Done" or "Close" button
    const doneButton = document.querySelector('button:contains("Done"), button:contains("Close"), .done-button');
    if (doneButton) {
      doneButton.click();
      await this.sleep(1000);
    }
  }

  async waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize the automation
const linkedinAutomation = new LinkedInAutomation();
