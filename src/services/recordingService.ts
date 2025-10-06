import { Recording } from '@/types/quran';

class RecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime: number = 0;

  /**
   * Request microphone permission and initialize recorder
   */
  async initialize(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      return false;
    }
  }

  /**
   * Start recording
   */
  async startRecording(): Promise<void> {
    if (!this.stream) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Failed to initialize microphone');
      }
    }

    this.audioChunks = [];
    this.startTime = Date.now();

    this.mediaRecorder = new MediaRecorder(this.stream!, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
  }

  /**
   * Stop recording and return the recording
   */
  async stopRecording(
    surahNumber: number,
    ayahNumber: number,
    pageNumber: number
  ): Promise<Recording> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const duration = (Date.now() - this.startTime) / 1000; // in seconds

        const recording: Recording = {
          id: `recording-${Date.now()}`,
          surahNumber,
          ayahNumber,
          pageNumber,
          audioBlob,
          duration,
          createdAt: new Date(),
        };

        resolve(recording);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Cancel ongoing recording
   */
  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.audioChunks = [];
    }
  }

  /**
   * Play a recording
   */
  playRecording(recording: Recording): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.src = URL.createObjectURL(recording.audioBlob);

      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };

      audio.onerror = (error) => {
        URL.revokeObjectURL(audio.src);
        reject(error);
      };

      audio.play();
    });
  }

  /**
   * Convert recording to downloadable format
   */
  downloadRecording(recording: Recording, filename?: string): void {
    const url = URL.createObjectURL(recording.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `recording-${recording.surahNumber}-${recording.ayahNumber}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.audioChunks = [];
  }
}

// Export singleton instance
export const recordingService = new RecordingService();
