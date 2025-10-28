/**
 * WebAppService - Utility service for web app operations
 * 
 * Handles:
 * - Favicon fetching from URLs
 * - Icon conversion and caching
 * - URL normalization
 * - Fallback icon handling
 */

const logger = require('../utils/Logger');

class WebAppService {
    constructor() {
        this.faviconCache = new Map(); // URL -> base64 icon
        this.faviconTimeout = 5000; // 5 second timeout for favicon fetch
    }

    /**
     * Fetch favicon for a URL
     * Tries multiple approaches with fallbacks
     * @param {string} url - Website URL
     * @returns {Promise<string|null>} Base64 icon data or null
     */
    async fetchFavicon(url) {
        try {
            // Extract domain from URL
            const urlObj = new URL(url);
            const domain = urlObj.origin;
            const cacheKey = domain;

            // Check cache first
            if (this.faviconCache.has(cacheKey)) {
                logger.debug('webApps', `Favicon cache hit for ${domain}`);
                return this.faviconCache.get(cacheKey);
            }

            logger.debug('webApps', `Fetching favicon for ${domain}`);

            // Try favicon.io API
            const faviconUrl = `https://favicon.io/fallback/${domain}/`;
            const icon = await this.fetchAndConvertIcon(faviconUrl);

            if (icon) {
                // Cache successful result
                this.faviconCache.set(cacheKey, icon);
                logger.debug('webApps', `Successfully fetched favicon for ${domain}`);
                return icon;
            }

            logger.debug('webApps', `Failed to fetch favicon for ${domain}`);
            return null;
        } catch (error) {
            logger.warn('webApps', 'Error fetching favicon:', error.message);
            return null;
        }
    }

    /**
     * Fetch icon from URL and convert to base64
     * @param {string} iconUrl - URL to icon image
     * @returns {Promise<string|null>} Base64 data or null
     */
    async fetchAndConvertIcon(iconUrl) {
        return new Promise((resolve) => {
            // Set timeout
            const timeout = setTimeout(() => {
                logger.warn('webApps', `Favicon fetch timeout for ${iconUrl}`);
                resolve(null);
            }, this.faviconTimeout);

            try {
                // Use fetch if available (Electron/modern browsers)
                if (typeof fetch === 'function') {
                    fetch(iconUrl, { timeout: this.faviconTimeout })
                        .then(response => {
                            clearTimeout(timeout);
                            
                            if (!response.ok) {
                                resolve(null);
                                return;
                            }
                            
                            return response.blob();
                        })
                        .then(blob => {
                            if (!blob) return;
                            
                            // Convert blob to base64
                            const reader = new FileReader();
                            reader.onload = () => {
                                resolve(reader.result);
                            };
                            reader.onerror = () => {
                                logger.warn('webApps', 'Error reading icon blob');
                                resolve(null);
                            };
                            reader.readAsDataURL(blob);
                        })
                        .catch(error => {
                            clearTimeout(timeout);
                            logger.warn('webApps', 'Error fetching icon:', error.message);
                            resolve(null);
                        });
                } else {
                    clearTimeout(timeout);
                    resolve(null);
                }
            } catch (error) {
                clearTimeout(timeout);
                logger.warn('webApps', 'Exception fetching icon:', error.message);
                resolve(null);
            }
        });
    }

    /**
     * Normalize URL - add http:// if no protocol
     * @param {string} url - URL to normalize
     * @returns {string} Normalized URL
     */
    normalizeUrl(url) {
        if (!url) return '';
        
        const trimmed = url.trim();
        
        // If no protocol, add http://
        if (!trimmed.includes('://')) {
            return `http://${trimmed}`;
        }
        
        return trimmed;
    }

    /**
     * Get fallback icon (SVG data URL)
     * Returns a Material Design globe icon
     * @returns {string} Base64 SVG icon
     */
    getDefaultIcon() {
        // Material Design globe icon as SVG
        const svgString = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#0078D4" width="24" height="24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
        `;
        
        // Convert to data URL
        const encoded = btoa(svgString.trim());
        return `data:image/svg+xml;base64,${encoded}`;
    }

    /**
     * Check if icon is valid data URL or base64
     * @param {string} icon - Icon data
     * @returns {boolean} True if valid icon format
     */
    isValidIcon(icon) {
        if (!icon || typeof icon !== 'string') {
            return false;
        }

        // Check if it's a data URL
        if (icon.startsWith('data:')) {
            return true;
        }

        // Check if it's valid base64 (roughly)
        if (/^[A-Za-z0-9+/=]+$/.test(icon.replace(/\s/g, ''))) {
            return true;
        }

        return false;
    }

    /**
     * Resize/optimize icon to fit display (24x24px)
     * For simplicity, we just return the icon as-is
     * Real implementation might use canvas to resize
     * @param {string} icon - Icon data
     * @returns {string} Icon data
     */
    optimizeIcon(icon) {
        // TODO: Implement actual image resizing if needed
        return icon;
    }

    /**
     * Clear favicon cache (for testing or when needed)
     */
    clearCache() {
        this.faviconCache.clear();
        logger.debug('webApps', 'Favicon cache cleared');
    }
}

// Export singleton
const instance = new WebAppService();
module.exports = instance;
