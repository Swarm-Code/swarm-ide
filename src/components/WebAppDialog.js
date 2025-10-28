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
     * Render the dialog
     */
    render() {
        // Create backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.close();
            }
        });

        // Create dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'modal-dialog modal-dialog-webapp';

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
        label.textContent = 'Icon';
        label.className = 'form-label';

        const container = document.createElement('div');
        container.className = 'icon-upload-container';

        // Icon preview
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
            preview.textContent = 'No icon';
        }

        // Upload input
        const uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.id = 'icon-upload';
        uploadInput.accept = 'image/*';
        uploadInput.style.display = 'none';
        uploadInput.addEventListener('change', (e) => this.handleIconUpload(e));

        // Upload button
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.className = 'modal-button modal-button-secondary';
        uploadBtn.textContent = 'Upload Icon';
        uploadBtn.addEventListener('click', () => uploadInput.click());

        // Fetch favicon button
        const fetchBtn = document.createElement('button');
        fetchBtn.type = 'button';
        fetchBtn.className = 'modal-button modal-button-secondary';
        fetchBtn.textContent = 'Auto-Fetch';
        fetchBtn.addEventListener('click', () => this.fetchFavicon());

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'icon-button-group';
        buttonGroup.appendChild(uploadBtn);
        buttonGroup.appendChild(fetchBtn);

        container.appendChild(preview);
        container.appendChild(uploadInput);
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
     * Fetch favicon from URL
     */
    async fetchFavicon() {
        const urlValue = this.formData.url.trim();
        if (!urlValue) {
            await modal.alert('No URL', 'Please enter a URL first');
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
                await modal.alert('Not Found', 'Could not find favicon for this URL. Please upload one manually.');
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
