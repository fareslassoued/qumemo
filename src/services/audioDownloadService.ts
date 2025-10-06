/**
 * Service for downloading and caching Quran audio files on-demand
 */

const ARCHIVE_ORG_BASE_URL = 'https://archive.org/download/husari_qalun';

interface DownloadProgress {
  surahNumber: number;
  loaded: number;
  total: number;
  percentage: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

class AudioDownloadService {
  private downloadingFiles = new Set<number>();
  private downloadedFiles = new Set<number>();

  /**
   * Check if audio file exists locally
   */
  async checkFileExists(surahNumber: number): Promise<boolean> {
    if (this.downloadedFiles.has(surahNumber)) {
      return true;
    }

    const audioPath = this.getAudioPath(surahNumber);

    try {
      const response = await fetch(audioPath, { method: 'HEAD' });
      const exists = response.ok;

      if (exists) {
        this.downloadedFiles.add(surahNumber);
      }

      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Get audio file path
   */
  private getAudioPath(surahNumber: number): string {
    const paddedNumber = surahNumber.toString().padStart(3, '0');
    return `/audio/${paddedNumber}.mp3`;
  }

  /**
   * Get download URL from Archive.org
   */
  private getDownloadUrl(surahNumber: number): string {
    const paddedNumber = surahNumber.toString().padStart(3, '0');
    return `${ARCHIVE_ORG_BASE_URL}/${paddedNumber}.mp3`;
  }

  /**
   * Download audio file with progress tracking
   */
  async downloadAudio(
    surahNumber: number,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    // Check if already downloading
    if (this.downloadingFiles.has(surahNumber)) {
      console.log(`Surah ${surahNumber} is already being downloaded`);
      return false;
    }

    // Check if already downloaded
    const exists = await this.checkFileExists(surahNumber);
    if (exists) {
      console.log(`Surah ${surahNumber} already exists`);
      return true;
    }

    this.downloadingFiles.add(surahNumber);

    try {
      const downloadUrl = this.getDownloadUrl(surahNumber);

      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const chunks: BlobPart[] = [];
      let loaded = 0;

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        if (value) {
          chunks.push(value);
          loaded += value.length;
        }

        // Report progress
        if (onProgress && total > 0) {
          onProgress({
            surahNumber,
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
          });
        }
      }

      // Combine chunks into a single blob
      const blob = new Blob(chunks, { type: 'audio/mpeg' });

      // Cache the blob using Cache API (for PWA support)
      await this.cacheAudioBlob(surahNumber, blob);

      this.downloadedFiles.add(surahNumber);
      this.downloadingFiles.delete(surahNumber);

      return true;
    } catch (error) {
      console.error(`Error downloading surah ${surahNumber}:`, error);
      this.downloadingFiles.delete(surahNumber);
      return false;
    }
  }

  /**
   * Cache audio blob using Cache API
   */
  private async cacheAudioBlob(surahNumber: number, blob: Blob): Promise<void> {
    if (!('caches' in window)) {
      console.warn('Cache API not supported');
      return;
    }

    try {
      const cache = await caches.open('quran-audio-cache');
      const audioPath = this.getAudioPath(surahNumber);
      const response = new Response(blob, {
        headers: { 'Content-Type': 'audio/mpeg' },
      });

      await cache.put(audioPath, response);
      console.log(`Cached surah ${surahNumber}`);
    } catch (error) {
      console.error(`Error caching surah ${surahNumber}:`, error);
    }
  }

  /**
   * Get cached audio or download if not available
   */
  async getAudioUrl(surahNumber: number): Promise<string | null> {
    const audioPath = this.getAudioPath(surahNumber);

    // Check cache first
    if ('caches' in window) {
      try {
        const cache = await caches.open('quran-audio-cache');
        const cachedResponse = await cache.match(audioPath);

        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          return URL.createObjectURL(blob);
        }
      } catch (error) {
        console.error('Error accessing cache:', error);
      }
    }

    // Check if file exists locally
    const exists = await this.checkFileExists(surahNumber);
    if (exists) {
      return audioPath;
    }

    return null;
  }

  /**
   * Check if file is currently being downloaded
   */
  isDownloading(surahNumber: number): boolean {
    return this.downloadingFiles.has(surahNumber);
  }

  /**
   * Get list of downloaded surahs
   */
  getDownloadedSurahs(): number[] {
    return Array.from(this.downloadedFiles).sort((a, b) => a - b);
  }

  /**
   * Clear all cached audio
   */
  async clearCache(): Promise<void> {
    if (!('caches' in window)) return;

    try {
      await caches.delete('quran-audio-cache');
      this.downloadedFiles.clear();
      console.log('Audio cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Get cache size estimate
   */
  async getCacheSize(): Promise<number> {
    if (!('caches' in window)) return 0;

    try {
      const cache = await caches.open('quran-audio-cache');
      const keys = await cache.keys();
      let totalSize = 0;

      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }

      return totalSize;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const audioDownloadService = new AudioDownloadService();
