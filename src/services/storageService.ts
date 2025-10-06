import { Bookmark, Recording, MemorizationSession } from '@/types/quran';

interface RecordingMetadata {
  id: string;
  surahNumber: number;
  ayahNumber: number;
  pageNumber: number;
  duration: number;
  createdAt: string;
}

interface SessionJSON {
  id: string;
  pageNumber: number;
  hiddenAyahs: number[];
  recordings: Recording[];
  startedAt: string;
  completedAt?: string;
}

class StorageService {
  private readonly BOOKMARKS_KEY = 'quran_bookmarks';
  private readonly RECORDINGS_KEY = 'quran_recordings';
  private readonly SESSIONS_KEY = 'quran_sessions';
  private readonly SETTINGS_KEY = 'quran_settings';

  /**
   * Check if localStorage is available
   */
  private isLocalStorageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && window.localStorage !== null;
    } catch {
      return false;
    }
  }

  // === BOOKMARKS ===

  /**
   * Get all bookmarks
   */
  getBookmarks(): Bookmark[] {
    if (!this.isLocalStorageAvailable()) return [];

    const data = localStorage.getItem(this.BOOKMARKS_KEY);
    if (!data) return [];

    interface BookmarkJSON {
      id: string;
      surahNumber: number;
      ayahNumber: number;
      pageNumber: number;
      note?: string;
      createdAt: string;
    }

    return JSON.parse(data).map((b: BookmarkJSON) => ({
      ...b,
      createdAt: new Date(b.createdAt),
    }));
  }

  /**
   * Add a bookmark
   */
  addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark {
    const newBookmark: Bookmark = {
      ...bookmark,
      id: `bookmark-${Date.now()}`,
      createdAt: new Date(),
    };

    const bookmarks = this.getBookmarks();
    bookmarks.push(newBookmark);
    this.saveBookmarks(bookmarks);

    return newBookmark;
  }

  /**
   * Remove a bookmark
   */
  removeBookmark(id: string): void {
    const bookmarks = this.getBookmarks().filter(b => b.id !== id);
    this.saveBookmarks(bookmarks);
  }

  /**
   * Update a bookmark
   */
  updateBookmark(id: string, updates: Partial<Bookmark>): void {
    const bookmarks = this.getBookmarks().map(b =>
      b.id === id ? { ...b, ...updates } : b
    );
    this.saveBookmarks(bookmarks);
  }

  /**
   * Check if a page is bookmarked
   */
  isPageBookmarked(pageNumber: number): boolean {
    return this.getBookmarks().some(b => b.pageNumber === pageNumber);
  }

  /**
   * Get bookmark for a specific page
   */
  getBookmarkForPage(pageNumber: number): Bookmark | undefined {
    return this.getBookmarks().find(b => b.pageNumber === pageNumber);
  }

  private saveBookmarks(bookmarks: Bookmark[]): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.setItem(this.BOOKMARKS_KEY, JSON.stringify(bookmarks));
  }

  // === RECORDINGS ===

  /**
   * Save recording metadata (blob stored separately in IndexedDB)
   */
  async saveRecording(recording: Recording): Promise<void> {
    // For simplicity, we'll store recordings in memory/sessionStorage
    // In production, use IndexedDB for blobs
    const recordings = this.getRecordingsMetadata();
    recordings.push({
      id: recording.id,
      surahNumber: recording.surahNumber,
      ayahNumber: recording.ayahNumber,
      pageNumber: recording.pageNumber,
      duration: recording.duration,
      createdAt: recording.createdAt.toISOString(),
    });

    if (this.isLocalStorageAvailable()) {
      localStorage.setItem(this.RECORDINGS_KEY, JSON.stringify(recordings));
    }

    // Store blob in IndexedDB (simplified - would need full implementation)
    await this.storeBlobInIndexedDB(recording.id, recording.audioBlob);
  }

  /**
   * Get recording metadata
   */
  getRecordingsMetadata(): RecordingMetadata[] {
    if (!this.isLocalStorageAvailable()) return [];

    const data = localStorage.getItem(this.RECORDINGS_KEY);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Get recordings for a specific ayah
   */
  getRecordingsForAyah(surahNumber: number, ayahNumber: number): RecordingMetadata[] {
    return this.getRecordingsMetadata().filter(
      r => r.surahNumber === surahNumber && r.ayahNumber === ayahNumber
    );
  }

  /**
   * Get all recordings with blobs
   */
  async getRecordings(): Promise<Recording[]> {
    const metadata = this.getRecordingsMetadata();
    const recordings: Recording[] = [];

    for (const meta of metadata) {
      const blob = await this.getBlobFromIndexedDB(meta.id);
      if (blob) {
        recordings.push({
          id: meta.id,
          surahNumber: meta.surahNumber,
          ayahNumber: meta.ayahNumber,
          pageNumber: meta.pageNumber,
          audioBlob: blob,
          duration: meta.duration,
          createdAt: new Date(meta.createdAt),
        });
      }
    }

    return recordings;
  }

  /**
   * Delete a recording (alias for deleteRecording)
   */
  async removeRecording(id: string): Promise<void> {
    await this.deleteRecording(id);
  }

  /**
   * Delete a recording
   */
  async deleteRecording(id: string): Promise<void> {
    const recordings = this.getRecordingsMetadata().filter(r => r.id !== id);

    if (this.isLocalStorageAvailable()) {
      localStorage.setItem(this.RECORDINGS_KEY, JSON.stringify(recordings));
    }

    await this.deleteBlobFromIndexedDB(id);
  }

  // === SESSIONS ===

  /**
   * Save memorization session
   */
  saveSession(session: MemorizationSession): void {
    const sessions = this.getSessions();
    const index = sessions.findIndex(s => s.id === session.id);

    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    if (this.isLocalStorageAvailable()) {
      localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(sessions));
    }
  }

  /**
   * Get all sessions
   */
  getSessions(): MemorizationSession[] {
    if (!this.isLocalStorageAvailable()) return [];

    const data = localStorage.getItem(this.SESSIONS_KEY);
    if (!data) return [];

    return JSON.parse(data).map((s: SessionJSON) => ({
      ...s,
      startedAt: new Date(s.startedAt),
      completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
    }));
  }

  /**
   * Get session by ID
   */
  getSession(id: string): MemorizationSession | undefined {
    return this.getSessions().find(s => s.id === id);
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): void {
    const sessions = this.getSessions().filter(s => s.id !== id);

    if (this.isLocalStorageAvailable()) {
      localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(sessions));
    }
  }

  // === SETTINGS ===

  /**
   * Save user settings
   */
  saveSettings(settings: Record<string, unknown>): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
  }

  /**
   * Get user settings
   */
  getSettings(): Record<string, unknown> | null {
    if (!this.isLocalStorageAvailable()) return null;

    const data = localStorage.getItem(this.SETTINGS_KEY);
    return data ? JSON.parse(data) : null;
  }

  // === INDEXEDDB (for audio blobs) ===

  /**
   * Store audio blob in IndexedDB
   */
  private async storeBlobInIndexedDB(id: string, blob: Blob): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('QuranRecordings', 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings');
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['recordings'], 'readwrite');
        const store = transaction.objectStore('recordings');
        const putRequest = store.put(blob, id);

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      };
    });
  }

  /**
   * Get audio blob from IndexedDB
   */
  async getBlobFromIndexedDB(id: string): Promise<Blob | null> {
    if (typeof window === 'undefined' || !window.indexedDB) return null;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('QuranRecordings', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['recordings'], 'readonly');
        const store = transaction.objectStore('recordings');
        const getRequest = store.get(id);

        getRequest.onsuccess = () => resolve(getRequest.result || null);
        getRequest.onerror = () => reject(getRequest.error);
      };
    });
  }

  /**
   * Delete blob from IndexedDB
   */
  private async deleteBlobFromIndexedDB(id: string): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open('QuranRecordings', 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['recordings'], 'readwrite');
        const store = transaction.objectStore('recordings');
        const deleteRequest = store.delete(id);

        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      };
    });
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    if (!this.isLocalStorageAvailable()) return;

    localStorage.removeItem(this.BOOKMARKS_KEY);
    localStorage.removeItem(this.RECORDINGS_KEY);
    localStorage.removeItem(this.SESSIONS_KEY);
    localStorage.removeItem(this.SETTINGS_KEY);

    // Clear IndexedDB
    if (typeof window !== 'undefined' && window.indexedDB) {
      indexedDB.deleteDatabase('QuranRecordings');
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
