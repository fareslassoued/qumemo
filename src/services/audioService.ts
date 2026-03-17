import { AudioPlayerState, RecitationSettings } from '@/types/quran';
import { audioDownloadService } from './audioDownloadService';

class AudioService {
  private audio: HTMLAudioElement | null = null;
  private currentSurah: number = 1;
  private currentAyah: number = 1;
  private settings: RecitationSettings = {
    repeatAyah: false,
    repeatCount: 1,
    repeatSection: false,
    sectionStart: { surah: 1, ayah: 1 },
    sectionEnd: { surah: 1, ayah: 7 },
    playbackSpeed: 1.0,
  };
  private repeatCounter: number = 0;
  private listeners: Map<string, Set<(data?: unknown) => void>> = new Map();

  // Range playback state for bilquran ritual
  private rangeState: {
    active: boolean;
    surah: number;
    startTime: number;
    endTime: number;
    repeatsLeft: number;
    timeupdateHandler: (() => void) | null;
  } = { active: false, surah: 0, startTime: 0, endTime: 0, repeatsLeft: 0, timeupdateHandler: null };

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.setupEventListeners();
    }
  }

  /**
   * Setup audio element event listeners
   */
  private setupEventListeners() {
    if (!this.audio) return;

    this.audio.addEventListener('ended', () => this.handleAudioEnded());
    this.audio.addEventListener('play', () => this.emit('play'));
    this.audio.addEventListener('pause', () => this.emit('pause'));
    this.audio.addEventListener('timeupdate', () => this.emit('timeupdate'));
    this.audio.addEventListener('loadedmetadata', () => this.emit('loadedmetadata'));
    this.audio.addEventListener('error', (e) => this.emit('error', e));
  }

  /**
   * Get audio file path for a surah
   */
  private getAudioPath(surahNumber: number): string {
    const paddedNumber = surahNumber.toString().padStart(3, '0');
    return `/audio/${paddedNumber}.mp3`;
  }

  /**
   * Play ayah or surah
   */
  async play(surahNumber: number, ayahNumber?: number): Promise<void> {
    if (!this.audio) return;

    this.currentSurah = surahNumber;
    this.currentAyah = ayahNumber || 1;
    this.repeatCounter = 0;

    // Check if audio file is available
    const audioUrl = await audioDownloadService.getAudioUrl(surahNumber);

    if (!audioUrl) {
      // Audio not available - emit event to request download
      this.emit('audio-not-found', { surahNumber });
      return;
    }

    try {
      // Stop current playback before loading new audio
      if (!this.audio.paused) {
        this.audio.pause();
      }

      // Check if we need to load a different source
      const currentSrc = this.audio.src;
      const needsNewSource = !currentSrc ||
                            (!currentSrc.endsWith(audioUrl) && !audioUrl.includes(currentSrc));

      if (needsNewSource) {
        // Reset audio element
        this.audio.currentTime = 0;
        this.audio.src = audioUrl;
        this.audio.playbackRate = this.settings.playbackSpeed;

        // Wait for the audio to be loaded
        await new Promise<void>((resolve, reject) => {
          if (!this.audio) {
            reject(new Error('Audio element not available'));
            return;
          }

          const onCanPlay = () => {
            this.audio?.removeEventListener('canplay', onCanPlay);
            this.audio?.removeEventListener('error', onError);
            resolve();
          };

          const onError = (e: Event) => {
            this.audio?.removeEventListener('canplay', onCanPlay);
            this.audio?.removeEventListener('error', onError);
            reject(e);
          };

          this.audio.addEventListener('canplay', onCanPlay, { once: true });
          this.audio.addEventListener('error', onError, { once: true });

          // Start loading
          this.audio.load();
        });
      }

      // Now play the audio
      await this.audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      this.emit('error', error);
    }
  }

  /**
   * Download audio for a surah
   */
  async downloadAudio(
    surahNumber: number,
    onProgress?: (progress: { percentage: number; loaded: number; total: number }) => void
  ): Promise<boolean> {
    this.emit('download-started', { surahNumber });

    const success = await audioDownloadService.downloadAudio(surahNumber, (progress) => {
      onProgress?.(progress);
      this.emit('download-progress', progress);
    });

    if (success) {
      this.emit('download-completed', { surahNumber });
    } else {
      this.emit('download-failed', { surahNumber });
    }

    return success;
  }

  /**
   * Check if audio is available for a surah
   */
  async isAudioAvailable(surahNumber: number): Promise<boolean> {
    return await audioDownloadService.checkFileExists(surahNumber);
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.audio?.pause();
  }

  /**
   * Stop playback
   */
  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (!this.audio) return;
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  /**
   * Set playback speed
   */
  setPlaybackSpeed(speed: number): void {
    if (!this.audio) return;
    this.settings.playbackSpeed = speed;
    this.audio.playbackRate = speed;
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Seek to specific time
   */
  seek(time: number): void {
    if (!this.audio) return;
    this.audio.currentTime = time;
  }

  /**
   * Update recitation settings
   */
  updateSettings(settings: Partial<RecitationSettings>): void {
    this.settings = { ...this.settings, ...settings };

    if (settings.playbackSpeed !== undefined && this.audio) {
      this.audio.playbackRate = settings.playbackSpeed;
    }
  }

  /**
   * Get current settings
   */
  getSettings(): RecitationSettings {
    return { ...this.settings };
  }

  /**
   * Handle audio ended event
   */
  private handleAudioEnded(): void {
    // Handle ayah repeat
    if (this.settings.repeatAyah) {
      this.repeatCounter++;
      if (this.repeatCounter < this.settings.repeatCount) {
        this.play(this.currentSurah, this.currentAyah);
        return;
      }
      this.repeatCounter = 0;
    }

    // Handle section repeat
    if (this.settings.repeatSection) {
      const { sectionStart, sectionEnd } = this.settings;

      // Check if we're at the end of the section
      if (
        this.currentSurah === sectionEnd.surah &&
        this.currentAyah >= sectionEnd.ayah
      ) {
        // Loop back to section start
        this.play(sectionStart.surah, sectionStart.ayah);
        return;
      }

      // Move to next ayah in section
      this.playNext();
      return;
    }

    // Default: emit ended event
    this.emit('ended');
  }

  /**
   * Play next ayah/surah
   */
  async playNext(): Promise<void> {
    // This would need integration with quranDataService to know when to move to next surah
    // For now, simplified implementation
    this.currentAyah++;
    await this.play(this.currentSurah, this.currentAyah);
  }

  /**
   * Play previous ayah/surah
   */
  async playPrevious(): Promise<void> {
    if (this.currentAyah > 1) {
      this.currentAyah--;
    } else if (this.currentSurah > 1) {
      this.currentSurah--;
      this.currentAyah = 1; // Would need to get actual last ayah number
    }
    await this.play(this.currentSurah, this.currentAyah);
  }

  /**
   * Get current player state
   */
  getState(): AudioPlayerState {
    return {
      isPlaying: this.audio ? !this.audio.paused : false,
      currentSurah: this.currentSurah,
      currentAyah: this.currentAyah,
      currentTime: this.audio?.currentTime || 0,
      duration: this.audio?.duration || 0,
      volume: this.audio?.volume || 1,
      playbackSpeed: this.settings.playbackSpeed,
    };
  }

  /**
   * Event listener management
   */
  on(event: string, callback: (data?: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data?: unknown) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: unknown): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  /**
   * Play a time range within a surah audio, repeating N times.
   * Used by the bilquran ritual for the Listen phase.
   * Loads audio independently of play() to avoid race conditions with AudioPlayer.
   */
  async playRange(surah: number, startTime: number, endTime: number, repeatCount: number): Promise<void> {
    if (!this.audio) return;

    // Clean up any existing range handler and stop current playback
    this.stopRange();
    this.audio.pause();

    this.rangeState = {
      active: true,
      surah,
      startTime,
      endTime,
      repeatsLeft: repeatCount,
      timeupdateHandler: null,
    };

    // Get audio URL (triggers download if needed)
    const audioUrl = await audioDownloadService.getAudioUrl(surah);
    if (!audioUrl || !this.audio) {
      this.stopRange();
      return;
    }

    try {
      // Load audio source if different from current
      const currentSrc = this.audio.src;
      const needsNewSource = !currentSrc ||
                            (!currentSrc.endsWith(audioUrl) && !audioUrl.includes(currentSrc));

      if (needsNewSource) {
        this.audio.currentTime = 0;
        this.audio.src = audioUrl;
        this.audio.playbackRate = this.settings.playbackSpeed;

        await new Promise<void>((resolve, reject) => {
          if (!this.audio) { reject(new Error('Audio element not available')); return; }

          const onCanPlay = () => {
            this.audio?.removeEventListener('canplay', onCanPlay);
            this.audio?.removeEventListener('error', onError);
            resolve();
          };
          const onError = (e: Event) => {
            this.audio?.removeEventListener('canplay', onCanPlay);
            this.audio?.removeEventListener('error', onError);
            reject(e);
          };

          this.audio.addEventListener('canplay', onCanPlay, { once: true });
          this.audio.addEventListener('error', onError, { once: true });
          this.audio.load();
        });
      }

      if (!this.audio || !this.rangeState.active) return;

      // Seek to range start
      this.audio.currentTime = startTime;
      this.currentSurah = surah;

      // Set up timeupdate handler for range boundaries
      const onTimeUpdate = () => {
        if (!this.audio || !this.rangeState.active) return;

        if (this.audio.currentTime >= this.rangeState.endTime) {
          this.rangeState.repeatsLeft--;

          if (this.rangeState.repeatsLeft > 0) {
            this.audio.currentTime = this.rangeState.startTime;
          } else {
            this.audio.pause();
            this.stopRange();
            this.emit('range-complete');
          }
        }
      };

      this.rangeState.timeupdateHandler = onTimeUpdate;
      this.audio.addEventListener('timeupdate', onTimeUpdate);

      await this.audio.play();
    } catch (error) {
      console.error('Error in playRange:', error);
      this.stopRange();
      this.emit('error', error);
    }
  }

  /**
   * Stop range playback and clean up handler
   */
  stopRange(): void {
    if (this.rangeState.timeupdateHandler && this.audio) {
      this.audio.removeEventListener('timeupdate', this.rangeState.timeupdateHandler);
    }
    this.rangeState = { active: false, surah: 0, startTime: 0, endTime: 0, repeatsLeft: 0, timeupdateHandler: null };
  }

  /**
   * Check if range playback is active
   */
  isRangePlaying(): boolean {
    return this.rangeState.active;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopRange();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.listeners.clear();
  }
}

// Export singleton instance
export const audioService = new AudioService();
