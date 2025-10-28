/**
 * WebAppDialog - Modal form for creating/editing web apps
 * 
 * Features:
 * - Real-time input validation
 * - Icon upload with preview
 * - Favicon auto-fetch
 * - Create and edit modes
 */

const eventBus = require('../modules/EventBus');
const { getInstance: getManagerInstance } = require('../modules/WebAppsManager');
const WebAppService = require('../services/WebAppService');
const modal = require('./Modal');
const logger = require('../utils/Logger');

class WebAppDialog {
    constructor(appToEdit = null) {
        this.manager = null;
        this.appToEdit = appToEdit;
        this.dialog = null;
        this.isEditMode = !!appToEdit;
        this.formData = {
            name: appToEdit?.name || '',
            url: appToEdit?.url || '',
            icon: appToEdit?.icon || null,
            customIcon: appToEdit?.customIcon || false
        };
        this.isValid = false;
        this.isSubmitting = false;

        this.init();
    }

    /**
     * Initialize the dialog
     */
    async init() {
        try {
            this.manager = await getManagerInstance();
            this.render();
            logger.info('webApps', '✓ WebAppDialog initialized');
        } catch (error) {
            logger.error('webApps', 'Failed to initialize WebAppDialog:', error.message);
        }
    }

    /**
     * Inject CSS styles for the modal
     */
    injectStyles() {
        // Check if styles already injected
        if (document.getElementById('webapp-modal-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'webapp-modal-styles';
        style.textContent = `
            .modal-dialog {
                position: relative;
                background: var(--bg-primary, #1e1e1e);
                border: 1px solid var(--border-color, #3e3e3e);
                border-radius: 8px;
                padding: 0;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
                z-index: 10001;
            }

            .modal-dialog-webapp {
                min-width: 450px;
            }

            .modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 20px;
                border-bottom: 1px solid var(--border-color, #3e3e3e);
                background: var(--bg-secondary, #252526);
            }

            .modal-header h2 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: var(--text-primary, #cccccc);
            }

            .modal-close-btn {
                background: none;
                border: none;
                color: var(--text-primary, #cccccc);
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s ease;
            }

            .modal-close-btn:hover {
                color: var(--text-secondary, #999999);
            }

            .modal-content {
                padding: 20px;
            }

            .form-group {
                margin-bottom: 20px;
            }

            .form-label,
            label {
                display: block;
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text-primary, #cccccc);
            }

            .form-input {
                width: 100%;
                padding: 8px 12px;
                background: var(--bg-secondary, #252525);
                border: 1px solid var(--border-color, #3e3e3e);
                color: var(--text-primary, #cccccc);
                border-radius: 4px;
                font-family: inherit;
                font-size: 13px;
                box-sizing: border-box;
                transition: border-color 0.2s ease;
            }

            .form-input:focus {
                outline: none;
                border-color: var(--accent-color, #007acc);
                box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
            }

            .form-input.input-error {
                border-color: #f48771;
            }

            .form-help {
                display: block;
                font-size: 11px;
                color: var(--text-secondary, #999999);
                margin-top: 4px;
            }

            .form-error {
                display: block;
                font-size: 11px;
                color: #f48771;
                margin-top: 4px;
            }

            .icon-section {
                margin-bottom: 20px;
                padding: 12px;
                background: var(--bg-secondary, #252525);
                border-radius: 4px;
                border: 1px solid var(--border-color, #3e3e3e);
            }

            .icon-upload-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .icon-preview {
                width: 80px;
                height: 80px;
                border: 2px dashed var(--border-color, #3e3e3e);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--bg-primary, #1e1e1e);
                margin-bottom: 8px;
            }

            .icon-preview img {
                max-width: 100%;
                max-height: 100%;
                border-radius: 2px;
            }

            .icon-url-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .icon-button-group {
                display: flex;
                gap: 8px;
            }

            .modal-button-group {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
                padding-top: 12px;
                border-top: 1px solid var(--border-color, #3e3e3e);
                margin-top: 20px;
            }

            .modal-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .modal-button-primary {
                background: var(--accent-color, #007acc);
                color: white;
            }

            .modal-button-primary:hover:not(:disabled) {
                background: #1177bb;
            }

            .modal-button-primary:disabled {
                background: var(--accent-color, #007acc);
                opacity: 0.5;
                cursor: not-allowed;
            }

            .modal-button-secondary {
                background: var(--bg-secondary, #252525);
                color: var(--text-primary, #cccccc);
                border: 1px solid var(--border-color, #3e3e3e);
            }

            .modal-button-secondary:hover:not(:disabled) {
                background: var(--border-color, #3e3e3e);
                border-color: var(--text-primary, #cccccc);
            }

            .modal-button-secondary:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Render the dialog
     */
    render() {
        // Inject CSS styles if not already present
        this.injectStyles();

        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.close();
            }
        });

        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'modal-dialog modal-dialog-webapp';
        this.dialog.style.cssText = `
            max-width: 500px;
            width: 90%;
            background: var(--bg-primary, #1e1e1e);
            border: 1px solid var(--border-color, #3e3e3e);
            border-radius: 8px;
            padding: 0;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
            max-height: 90vh;
            overflow-y: auto;
            z-index: 10001;
        `;

        // Title
        const title = document.createElement('div');
        title.className = 'modal-header';
        const titleText = document.createElement('h2');
        titleText.textContent = this.isEditMode ? 'Edit Web App' : 'Add Web App';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this.close());
        title.appendChild(titleText);
        title.appendChild(closeBtn);

        // Content
        const content = document.createElement('div');
        content.className = 'modal-content';

        // Name field
        const nameGroup = this.createFormGroup(
            'App Name',
            'name',
            'text',
            'Google',
            'Max 50 characters'
        );
        content.appendChild(nameGroup);

        // URL field
        const urlGroup = this.createFormGroup(
            'Website URL',
            'url',
            'url',
            'https://google.com',
            'Must start with http:// or https://'
        );
        content.appendChild(urlGroup);

        // Icon section
        const iconSection = this.createIconSection();
        content.appendChild(iconSection);

        // Buttons
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'modal-button-group';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-button modal-button-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = document.createElement('button');
        saveBtn.className = 'modal-button modal-button-primary';
        saveBtn.id = 'webapp-save-btn';
        saveBtn.textContent = this.isEditMode ? 'Update' : 'Add';
        saveBtn.addEventListener('click', () => this.submit());

        buttonGroup.appendChild(cancelBtn);
        buttonGroup.appendChild(saveBtn);

        content.appendChild(buttonGroup);

        // Assemble dialog
        this.dialog.appendChild(title);
        this.dialog.appendChild(content);
        backdrop.appendChild(this.dialog);

        // Add to DOM
        document.body.appendChild(backdrop);

        // Restore form data if editing
        if (this.isEditMode) {
            this.restoreFormData();
        }

        // Setup input listeners
        this.setupInputListeners();

        // Validate on init
        this.validateForm();
    }

    /**
     * Create a form group (label + input + help text)
     */
    createFormGroup(label, fieldName, type, placeholder, helpText) {
        const group = document.createElement('div');
        group.className = 'form-group';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = `webapp-${fieldName}`;
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.id = `webapp-${fieldName}`;
        input.className = 'form-input';
        input.type = type;
        input.placeholder = placeholder;
        input.value = this.formData[fieldName] || '';
        input.addEventListener('input', (e) => {
            this.formData[fieldName] = e.target.value;
            this.validateForm();
        });
        input.addEventListener('blur', () => {
            this.validateField(fieldName, input);
        });

        const help = document.createElement('span');
        help.className = 'form-help';
        help.textContent = helpText;

        const error = document.createElement('span');
        error.className = 'form-error';
        error.id = `error-${fieldName}`;
        error.style.display = 'none';

        group.appendChild(labelEl);
        group.appendChild(input);
        group.appendChild(help);
        group.appendChild(error);

        return group;
    }

    /**
     * Create icon selection section
     */
    createIconSection() {
        const section = document.createElement('div');
        section.className = 'icon-section';

        const label = document.createElement('label');
        label.textContent = 'Icon (Optional)';
        label.className = 'form-label';

        const container = document.createElement('div');
        container.className = 'icon-upload-container';

        // Icon preview - positioned at top
        const preview = document.createElement('div');
        preview.className = 'icon-preview';
        preview.id = 'icon-preview';
        if (this.formData.icon) {
            const img = document.createElement('img');
            img.src = this.formData.icon;
            img.onerror = () => {
                img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwNzhENCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+';
            };
            preview.appendChild(img);
        } else {
            const emptyIcon = document.createElement('div');
            emptyIcon.style.cssText = 'font-size: 32px; color: #0e639c; opacity: 0.5;';
            emptyIcon.textContent = '📷';
            preview.appendChild(emptyIcon);
        }

        // Upload input (hidden)
        const uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.id = 'icon-upload';
        uploadInput.accept = 'image/*';
        uploadInput.style.display = 'none';
        uploadInput.addEventListener('change', (e) => this.handleIconUpload(e));

        // Icon URL input group
        const urlGroup = document.createElement('div');
        urlGroup.className = 'icon-url-group';

        const urlLabel = document.createElement('label');
        urlLabel.htmlFor = 'icon-url-input';
        urlLabel.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px; display: block;';
        urlLabel.textContent = 'Or paste icon URL:';

        const urlInput = document.createElement('input');
        urlInput.id = 'icon-url-input';
        urlInput.type = 'text';
        urlInput.className = 'form-input';
        urlInput.placeholder = 'https://example.com/icon.png';
        urlInput.style.cssText = 'margin-bottom: 8px;';
        urlInput.addEventListener('change', () => this.fetchIconFromUrl(urlInput.value));

        urlGroup.appendChild(urlLabel);
        urlGroup.appendChild(urlInput);

        // Buttons
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.className = 'modal-button modal-button-secondary';
        uploadBtn.textContent = 'Upload File';
        uploadBtn.style.cssText = 'flex: 1;';
        uploadBtn.addEventListener('click', () => uploadInput.click());

        const fetchBtn = document.createElement('button');
        fetchBtn.type = 'button';
        fetchBtn.className = 'modal-button modal-button-secondary';
        fetchBtn.textContent = 'Auto-Fetch';
        fetchBtn.style.cssText = 'flex: 1;';
        fetchBtn.addEventListener('click', () => this.fetchFavicon());

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'icon-button-group';
        buttonGroup.appendChild(uploadBtn);
        buttonGroup.appendChild(fetchBtn);

        container.appendChild(preview);
        container.appendChild(uploadInput);
        container.appendChild(urlGroup);
        container.appendChild(buttonGroup);

        section.appendChild(label);
        section.appendChild(container);

        return section;
    }

    /**
     * Handle icon file upload
     */
    handleIconUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            this.formData.icon = base64;
            this.formData.customIcon = true;
            this.updateIconPreview(base64);
            logger.debug('webApps', 'Icon uploaded');
        };
        reader.onerror = () => {
            logger.error('webApps', 'Error reading icon file');
        };
        reader.readAsDataURL(file);
    }

    /**
     * Fetch icon from a pasted URL
     */
    async fetchIconFromUrl(url) {
        if (!url || url.trim().length === 0) {
            return; // User cleared the field
        }

        try {
            const trimmedUrl = url.trim();
            
            // Validate it's a real URL
            try {
                new URL(trimmedUrl);
            } catch (e) {
                await modal.alert('Invalid URL', 'Please enter a valid URL (e.g., https://example.com/icon.png)');
                return;
            }

            // Show loading state
            const preview = document.getElementById('icon-preview');
            const originalContent = preview.innerHTML;
            preview.innerHTML = '<div style="color: #0e639c; font-size: 12px;">Loading...</div>';

            // Fetch the image
            const response = await fetch(trimmedUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();
            
            // Validate it's an image
            if (!blob.type.startsWith('image/')) {
                throw new Error('URL does not point to an image');
            }

            // Convert to base64
            const reader = new FileReader();
            reader.onload = () => {
                this.formData.icon = reader.result;
                this.formData.customIcon = true;
                this.updateIconPreview(reader.result);
                logger.debug('webApps', 'Icon loaded from URL');
            };
            reader.onerror = () => {
                preview.innerHTML = originalContent;
                logger.error('webApps', 'Error reading icon');
            };
            reader.readAsDataURL(blob);

        } catch (error) {
            logger.error('webApps', 'Error loading icon from URL:', error.message);
            const preview = document.getElementById('icon-preview');
            const emptyIcon = document.createElement('div');
            emptyIcon.style.cssText = 'font-size: 32px; color: #f48771; opacity: 0.5;';
            emptyIcon.textContent = '❌';
            preview.innerHTML = '';
            preview.appendChild(emptyIcon);
            
            await modal.alert('Failed to Load Icon', `Could not load image: ${error.message}`);
        }
    }

    /**
     * Fetch favicon from URL
     */
    async fetchFavicon() {
        const urlValue = this.formData.url.trim();
        if (!urlValue) {
            await modal.alert('No URL', 'Please enter a website URL first to auto-fetch its favicon');
            return;
        }

        try {
            const saveBtn = document.getElementById('webapp-save-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Fetching...';

            const icon = await WebAppService.fetchFavicon(urlValue);
            if (icon) {
                this.formData.icon = icon;
                this.formData.customIcon = false;
                this.updateIconPreview(icon);
                logger.debug('webApps', 'Favicon fetched successfully');
            } else {
                await modal.alert('Not Found', 'Could not find favicon. Try uploading your own or pasting an icon URL.');
            }
        } catch (error) {
            logger.error('webApps', 'Error fetching favicon:', error.message);
            await modal.alert('Error', 'Failed to fetch favicon: ' + error.message);
        } finally {
            const saveBtn = document.getElementById('webapp-save-btn');
            saveBtn.disabled = false;
            saveBtn.textContent = this.isEditMode ? 'Update' : 'Add';
        }
    }

    /**
     * Update icon preview
     */
    updateIconPreview(iconData) {
        const preview = document.getElementById('icon-preview');
        preview.innerHTML = '';
        const img = document.createElement('img');
        img.src = iconData;
        img.onerror = () => {
            img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzAwNzhENCIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+';
        };
        preview.appendChild(img);
    }

    /**
     * Setup input listeners
     */
    setupInputListeners() {
        // Real-time validation as user types
        const nameInput = document.getElementById('webapp-name');
        const urlInput = document.getElementById('webapp-url');

        if (nameInput) {
            nameInput.addEventListener('input', () => {
                this.formData.name = nameInput.value;
                this.validateForm();
            });
        }

        if (urlInput) {
            urlInput.addEventListener('input', () => {
                this.formData.url = urlInput.value;
                this.validateForm();
            });
        }
    }

    /**
     * Validate a single field
     */
    validateField(fieldName, inputEl) {
        const errorEl = document.getElementById(`error-${fieldName}`);
        if (!errorEl) return true;

        let isValid = true;
        let errorMsg = '';

        if (fieldName === 'name') {
            const validation = this.manager.validateName(this.formData.name);
            isValid = validation.valid;
            errorMsg = validation.error || '';
        } else if (fieldName === 'url') {
            const validation = this.manager.validateUrl(this.formData.url);
            isValid = validation.valid;
            errorMsg = validation.error || '';
        }

        if (isValid) {
            inputEl.classList.remove('input-error');
            errorEl.style.display = 'none';
        } else {
            inputEl.classList.add('input-error');
            errorEl.style.display = 'block';
            errorEl.textContent = errorMsg;
        }

        return isValid;
    }

    /**
     * Validate entire form
     */
    validateForm() {
        const nameInput = document.getElementById('webapp-name');
        const urlInput = document.getElementById('webapp-url');

        let nameValid = true;
        let urlValid = true;

        if (nameInput) {
            nameValid = this.validateField('name', nameInput);
        }

        if (urlInput) {
            urlValid = this.validateField('url', urlInput);
        }

        this.isValid = nameValid && urlValid;
        const saveBtn = document.getElementById('webapp-save-btn');
        if (saveBtn) {
            saveBtn.disabled = !this.isValid || this.isSubmitting;
        }
    }

    /**
     * Restore form data when editing
     */
    restoreFormData() {
        const nameInput = document.getElementById('webapp-name');
        const urlInput = document.getElementById('webapp-url');

        if (nameInput) nameInput.value = this.formData.name;
        if (urlInput) urlInput.value = this.formData.url;

        if (this.formData.icon) {
            this.updateIconPreview(this.formData.icon);
        }
    }

    /**
     * Submit form
     */
    async submit() {
        if (!this.isValid || this.isSubmitting) return;

        this.isSubmitting = true;
        const saveBtn = document.getElementById('webapp-save-btn');
        const originalText = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            if (this.isEditMode) {
                // Update existing
                await this.manager.updateWebApp(this.appToEdit.id, this.formData);
                logger.info('webApps', 'Web app updated');
            } else {
                // Create new
                await this.manager.addWebApp(this.formData);
                logger.info('webApps', 'Web app added');
            }

            eventBus.emit('dialog:closed', { success: true });
            this.close();
        } catch (error) {
            logger.error('webApps', 'Error saving web app:', error.message);
            
            if (error.validationError) {
                await modal.alert('Validation Error', error.message);
            } else {
                await modal.alert('Error', 'Failed to save web app: ' + error.message);
            }
        } finally {
            this.isSubmitting = false;
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }

    /**
     * Close dialog
     */
    close() {
        const backdrop = this.dialog?.parentElement;
        if (backdrop) {
            backdrop.remove();
        }
        eventBus.emit('dialog:closed', { success: false });
        logger.debug('webApps', 'WebAppDialog closed');
    }

    /**
     * Cleanup
     */
    destroy() {
        const backdrop = this.dialog?.parentElement;
        if (backdrop) {
            backdrop.remove();
        }
        logger.info('webApps', '✓ WebAppDialog destroyed');
    }
}

module.exports = WebAppDialog;
