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
      // Removed the openFilePicker handler since we're doing it directly in popup
    });
  }

  async updateProfilePicture(imagePath, imageName) {
    try {
      console.log('Starting profile picture update with:', imageName);

      // Avoid navigating here; background should ensure correct page
      if (!/linkedin\.com\/in\//i.test(location.href)) {
        console.warn('Not on a LinkedIn profile page. Open your profile and try again.');
        return;
      }

      const editButton = await this.findProfilePictureEditButton();
      if (!editButton) {
        throw new Error('Could not find profile picture edit button');
      }

      editButton.click();
      await this.sleep(1000);

      const fileInput = await this.waitForFileInput();
      if (!fileInput) {
        throw new Error('Could not find file input');
      }

      const file = await this.createFileFromPath(imagePath, imageName);
      if (!file) {
        throw new Error('Could not create file from path');
      }

      await this.uploadFile(fileInput, file);
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
      'button[aria-label*="photo" i]',
      'button[aria-label*="picture" i]',
      '.pv-top-card__photo-edit-button'
    ];

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element && element.offsetParent !== null) {
          return element;
        }
      } catch (_) {}
    }

    // Try any button near the profile picture
    const profilePicture = document.querySelector('.pv-top-card__photo img, .profile-photo img');
    if (profilePicture) {
      const parent = profilePicture.closest('.pv-top-card__photo, .profile-photo') || profilePicture.parentElement;
      if (parent) {
        const btn = Array.from(parent.querySelectorAll('button, [role="button"]')).find(b =>
          this.textMatches(b, ['edit photo', 'change photo', 'edit picture', 'change picture'])
        );
        if (btn) return btn;
      }
    }

    // Fallback: scan all buttons by text
    const btnByText = this.findButtonByText(['edit photo', 'change photo', 'edit picture', 'change picture']);
    if (btnByText) return btnByText;

    return null;
  }

  findButtonByText(texts) {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    return buttons.find(b => this.textMatches(b, texts));
  }

  textMatches(el, texts) {
    const t = (el.textContent || '').trim().toLowerCase();
    return texts.some(x => t.includes(x));
  }

  async waitForFileInput() {
    const maxAttempts = 20;
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
      // imagePath should be a URL like http://localhost:3000/images/<file>
      const res = await fetch(imagePath, { cache: 'no-store' });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const blob = await res.blob();
      const type = blob.type || 'image/jpeg';
      return new File([blob], imageName || 'profile.jpg', { type });
    } catch (error) {
      console.error('createFileFromPath error:', error);
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
    // Look for explicit save buttons by attribute or class
    let saveButton = document.querySelector('button[data-control-name="save"], .save-button');
    if (!saveButton) {
      saveButton = this.findButtonByText(['save', 'apply', 'done']);
    }
    if (saveButton) {
      saveButton.click();
      await this.sleep(2000);
    }

    // Also try to find and click any "Done" or "Close" button
    let doneButton = document.querySelector('.done-button');
    if (!doneButton) {
      doneButton = this.findButtonByText(['done', 'close']);
    }
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
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize the automation
const linkedinAutomation = new LinkedInAutomation();