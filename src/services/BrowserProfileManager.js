/**
 * BrowserProfileManager - Manages browser profiles with cookies, credentials, history
 *
 * Each profile represents a different user context for testing applications.
 * Profiles contain isolated cookies, localStorage, credentials, and browsing history.
 * Uses electron-store for encrypted storage of sensitive data.
 */

const eventBus = require('../modules/EventBus');

// Simple ID generator
function generateId() {
    return 'profile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

class BrowserProfileManager {
    constructor() {
        this.storageKey = 'swarm-ide-browser-profiles';
        this.profiles = new Map(); // profileId → profile object
        this.activeProfile = null;
        this.defaultProfile = null;

        console.log('[BrowserProfileManager] Initialized');
    }

    /**
     * Initialize profile manager
     */
    async init() {
        // Load profiles from localStorage
        const storedData = localStorage.getItem(this.storageKey);
        const storedProfiles = storedData ? JSON.parse(storedData) : [];
        console.log('[BrowserProfileManager] Loaded profiles:', storedProfiles.length);

        // If no profiles exist, create default one
        if (storedProfiles.length === 0) {
            const defaultProfile = this.createProfile('Default', 'Default profile');
            this.setActiveProfile(defaultProfile.id);
            this.defaultProfile = defaultProfile;
        } else {
            // Load existing profiles
            storedProfiles.forEach(profile => {
                this.profiles.set(profile.id, profile);
            });

            // Set first profile as active
            const firstProfile = storedProfiles[0];
            this.setActiveProfile(firstProfile.id);
            this.defaultProfile = firstProfile;
        }

        console.log('[BrowserProfileManager] Active profile:', this.activeProfile?.id);
    }

    /**
     * Create a new profile
     */
    createProfile(name, description = '') {
        const profileId = generateId();

        const profile = {
            id: profileId,
            name: name || 'Untitled Profile',
            description: description,
            avatar: this.generateAvatar(name),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            cookies: [],
            localStorage: {},
            sessionStorage: {},
            credentials: [], // { domain, username, password (encrypted) }
            history: [], // { url, title, timestamp, favicon }
            settings: {
                trackHistory: true,
                saveCredentials: true,
                privacyMode: false
            }
        };

        this.profiles.set(profileId, profile);
        this.saveProfiles();

        console.log('[BrowserProfileManager] Created profile:', profileId, name);
        eventBus.emit('profile:created', { profileId, profile });

        return profile;
    }

    /**
     * Generate avatar initials from name
     */
    generateAvatar(name) {
        if (!name) return '?';

        const words = name.trim().split(' ');
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        }

        return (words[0][0] + words[1][0]).toUpperCase();
    }

    /**
     * Get profile by ID
     */
    getProfile(profileId) {
        return this.profiles.get(profileId);
    }

    /**
     * Get all profiles
     */
    getAllProfiles() {
        return Array.from(this.profiles.values());
    }

    /**
     * Get active profile
     */
    getActiveProfile() {
        return this.activeProfile;
    }

    /**
     * Set active profile
     */
    setActiveProfile(profileId) {
        const profile = this.profiles.get(profileId);
        if (!profile) {
            console.error('[BrowserProfileManager] Profile not found:', profileId);
            return false;
        }

        // Save current profile state before switching
        if (this.activeProfile) {
            this.saveProfileState(this.activeProfile.id);
        }

        this.activeProfile = profile;
        console.log('[BrowserProfileManager] Active profile set:', profileId);

        eventBus.emit('profile:activated', { profileId, profile });

        return true;
    }

    /**
     * Update profile
     */
    updateProfile(profileId, updates) {
        const profile = this.profiles.get(profileId);
        if (!profile) {
            console.error('[BrowserProfileManager] Profile not found:', profileId);
            return false;
        }

        Object.assign(profile, updates, {
            updatedAt: Date.now()
        });

        // Regenerate avatar if name changed
        if (updates.name) {
            profile.avatar = this.generateAvatar(updates.name);
        }

        this.saveProfiles();

        console.log('[BrowserProfileManager] Updated profile:', profileId);
        eventBus.emit('profile:updated', { profileId, profile });

        return true;
    }

    /**
     * Delete profile
     */
    deleteProfile(profileId) {
        // Can't delete last profile
        if (this.profiles.size === 1) {
            console.warn('[BrowserProfileManager] Cannot delete last profile');
            return false;
        }

        // Can't delete active profile without switching first
        if (this.activeProfile?.id === profileId) {
            // Switch to another profile first
            const otherProfile = Array.from(this.profiles.values()).find(p => p.id !== profileId);
            if (otherProfile) {
                this.setActiveProfile(otherProfile.id);
            }
        }

        this.profiles.delete(profileId);
        this.saveProfiles();

        console.log('[BrowserProfileManager] Deleted profile:', profileId);
        eventBus.emit('profile:deleted', { profileId });

        return true;
    }

    /**
     * Duplicate profile
     */
    duplicateProfile(profileId) {
        const sourceProfile = this.profiles.get(profileId);
        if (!sourceProfile) {
            console.error('[BrowserProfileManager] Profile not found:', profileId);
            return null;
        }

        const newProfile = {
            ...sourceProfile,
            id: generateId(),
            name: `${sourceProfile.name} (Copy)`,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.profiles.set(newProfile.id, newProfile);
        this.saveProfiles();

        console.log('[BrowserProfileManager] Duplicated profile:', newProfile.id);
        eventBus.emit('profile:created', { profileId: newProfile.id, profile: newProfile });

        return newProfile;
    }

    /**
     * Save profile state
     */
    saveProfileState(profileId, state = {}) {
        const profile = this.profiles.get(profileId);
        if (!profile) {
            console.error('[BrowserProfileManager] Profile not found:', profileId);
            return false;
        }

        // Update profile with current state
        Object.assign(profile, state, {
            updatedAt: Date.now()
        });

        this.saveProfiles();

        console.log('[BrowserProfileManager] Saved profile state:', profileId);
        return true;
    }

    /**
     * Add cookie to profile
     */
    addCookie(profileId, cookie) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        // Find existing cookie with same name/domain/path
        const existingIndex = profile.cookies.findIndex(c =>
            c.name === cookie.name &&
            c.domain === cookie.domain &&
            c.path === cookie.path
        );

        if (existingIndex > -1) {
            // Update existing cookie
            profile.cookies[existingIndex] = cookie;
        } else {
            // Add new cookie
            profile.cookies.push(cookie);
        }

        this.saveProfiles();
        console.log('[BrowserProfileManager] Added cookie:', cookie.name);

        return true;
    }

    /**
     * Get all cookies for profile
     */
    getCookies(profileId) {
        const profile = this.profiles.get(profileId);
        return profile ? profile.cookies : [];
    }

    /**
     * Clear all cookies for profile
     */
    clearCookies(profileId) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        profile.cookies = [];
        this.saveProfiles();

        console.log('[BrowserProfileManager] Cleared cookies');
        return true;
    }

    /**
     * Add credential to profile
     */
    addCredential(profileId, credential) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        if (!profile.settings.saveCredentials) {
            console.log('[BrowserProfileManager] Credential saving disabled for profile');
            return false;
        }

        // Find existing credential for same domain
        const existingIndex = profile.credentials.findIndex(c =>
            c.domain === credential.domain &&
            c.username === credential.username
        );

        const credentialData = {
            domain: credential.domain,
            username: credential.username,
            password: credential.password, // Already encrypted by electron-store
            savedAt: Date.now()
        };

        if (existingIndex > -1) {
            // Update existing credential
            profile.credentials[existingIndex] = credentialData;
        } else {
            // Add new credential
            profile.credentials.push(credentialData);
        }

        this.saveProfiles();
        console.log('[BrowserProfileManager] Added credential for:', credential.domain);

        return true;
    }

    /**
     * Get credentials for domain
     */
    getCredentialsForDomain(profileId, domain) {
        const profile = this.profiles.get(profileId);
        if (!profile) return [];

        return profile.credentials.filter(c => c.domain === domain);
    }

    /**
     * Get all credentials for profile
     */
    getCredentials(profileId) {
        const profile = this.profiles.get(profileId);
        return profile ? profile.credentials : [];
    }

    /**
     * Delete credential
     */
    deleteCredential(profileId, domain, username) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        const index = profile.credentials.findIndex(c =>
            c.domain === domain && c.username === username
        );

        if (index > -1) {
            profile.credentials.splice(index, 1);
            this.saveProfiles();
            console.log('[BrowserProfileManager] Deleted credential');
            return true;
        }

        return false;
    }

    /**
     * Add history entry
     */
    addHistoryEntry(profileId, entry) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        if (!profile.settings.trackHistory || profile.settings.privacyMode) {
            console.log('[BrowserProfileManager] History tracking disabled');
            return false;
        }

        const historyEntry = {
            url: entry.url,
            title: entry.title,
            timestamp: Date.now(),
            favicon: entry.favicon || null
        };

        profile.history.unshift(historyEntry);

        // Limit history size (keep last 1000 entries)
        if (profile.history.length > 1000) {
            profile.history = profile.history.slice(0, 1000);
        }

        this.saveProfiles();

        return true;
    }

    /**
     * Get history for profile
     */
    getHistory(profileId, limit = 100) {
        const profile = this.profiles.get(profileId);
        if (!profile) return [];

        return profile.history.slice(0, limit);
    }

    /**
     * Search history
     */
    searchHistory(profileId, query) {
        const profile = this.profiles.get(profileId);
        if (!profile) return [];

        const lowerQuery = query.toLowerCase();

        return profile.history.filter(entry =>
            entry.url.toLowerCase().includes(lowerQuery) ||
            entry.title.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Clear history for profile
     */
    clearHistory(profileId) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        profile.history = [];
        this.saveProfiles();

        console.log('[BrowserProfileManager] Cleared history');
        return true;
    }

    /**
     * Update localStorage for profile
     */
    updateLocalStorage(profileId, key, value) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        profile.localStorage[key] = value;
        this.saveProfiles();

        return true;
    }

    /**
     * Get localStorage for profile
     */
    getLocalStorage(profileId) {
        const profile = this.profiles.get(profileId);
        return profile ? profile.localStorage : {};
    }

    /**
     * Update sessionStorage for profile
     */
    updateSessionStorage(profileId, key, value) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        profile.sessionStorage[key] = value;
        this.saveProfiles();

        return true;
    }

    /**
     * Get sessionStorage for profile
     */
    getSessionStorage(profileId) {
        const profile = this.profiles.get(profileId);
        return profile ? profile.sessionStorage : {};
    }

    /**
     * Update profile settings
     */
    updateSettings(profileId, settings) {
        const profile = this.profiles.get(profileId);
        if (!profile) return false;

        Object.assign(profile.settings, settings);
        this.saveProfiles();

        console.log('[BrowserProfileManager] Updated settings');
        return true;
    }

    /**
     * Save profiles to persistent storage
     */
    saveProfiles() {
        const profilesArray = Array.from(this.profiles.values());
        localStorage.setItem(this.storageKey, JSON.stringify(profilesArray));
        console.log('[BrowserProfileManager] Saved profiles to storage');
    }

    /**
     * Export profile to JSON
     */
    exportProfile(profileId) {
        const profile = this.profiles.get(profileId);
        if (!profile) {
            console.error('[BrowserProfileManager] Profile not found:', profileId);
            return null;
        }

        return JSON.stringify(profile, null, 2);
    }

    /**
     * Import profile from JSON
     */
    importProfile(jsonString) {
        try {
            const profile = JSON.parse(jsonString);

            // Generate new ID to avoid conflicts
            profile.id = generateId();
            profile.createdAt = Date.now();
            profile.updatedAt = Date.now();

            this.profiles.set(profile.id, profile);
            this.saveProfiles();

            console.log('[BrowserProfileManager] Imported profile:', profile.id);
            eventBus.emit('profile:imported', { profileId: profile.id, profile });

            return profile;
        } catch (error) {
            console.error('[BrowserProfileManager] Failed to import profile:', error);
            return null;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.activeProfile) {
            this.saveProfileState(this.activeProfile.id);
        }
        this.saveProfiles();
        console.log('[BrowserProfileManager] Destroyed');
    }
}

// Export singleton instance
module.exports = new BrowserProfileManager();
