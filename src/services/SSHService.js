/**
 * SSHService - Handles all SFTP file operations over SSH
 * This runs in the renderer process and communicates with main via IPC
 */
class SSHService {
  /**
   * List directory contents via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<Array>} Array of file/folder objects
   */
  async readDirectory(connectionId, remotePath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpReadDir(connectionId, remotePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to read directory');
    }

    return result.items;
  }

  /**
   * Read file content via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote file path
   * @returns {Promise<string>} File content
   */
  async readFile(connectionId, remotePath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpReadFile(connectionId, remotePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to read file');
    }

    return result.content;
  }

  /**
   * Write file content via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote file path
   * @param {string} content - File content
   * @returns {Promise<void>}
   */
  async writeFile(connectionId, remotePath, content) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpWriteFile(connectionId, remotePath, content);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to write file');
    }
  }

  /**
   * Create directory via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<void>}
   */
  async createDirectory(connectionId, remotePath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpMkdir(connectionId, remotePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create directory');
    }
  }

  /**
   * Delete file via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote file path
   * @returns {Promise<void>}
   */
  async deleteFile(connectionId, remotePath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpUnlink(connectionId, remotePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete file');
    }
  }

  /**
   * Delete directory via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote directory path
   * @returns {Promise<void>}
   */
  async deleteDirectory(connectionId, remotePath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpRmdir(connectionId, remotePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete directory');
    }
  }

  /**
   * Rename/move file or directory via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} oldPath - Current path
   * @param {string} newPath - New path
   * @returns {Promise<void>}
   */
  async rename(connectionId, oldPath, newPath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpRename(connectionId, oldPath, newPath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to rename');
    }
  }

  /**
   * Get file stats via SFTP
   * @param {string} connectionId - SSH connection ID
   * @param {string} remotePath - Remote path
   * @returns {Promise<Object>} File stats
   */
  async stat(connectionId, remotePath) {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sshSftpStat(connectionId, remotePath);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get stats');
    }

    return result.stats;
  }
}

export const sshService = new SSHService();
