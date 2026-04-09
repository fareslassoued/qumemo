/**
 * ASR (Automatic Speech Recognition) backends — shared across services.
 *
 * Pluggable backends: Local Whisper server, Web Speech API, HF Inference API.
 * Extracted from recitationTrackerService for reuse by followAlongService.
 */

import type { ASRBackend } from '@/types/recitation';

// Web Speech API type declarations (not in all TS libs)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: { transcript: string; confidence: number };
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventCompat extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventCompat extends Event {
  readonly error: string;
}
interface SpeechRecognitionCompat extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventCompat) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventCompat) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

// ─── Web Speech API Backend ─────────────────────────────

export class WebSpeechBackend implements ASRBackend {
  readonly name = 'Web Speech API';
  private recognition: SpeechRecognitionCompat | null = null;
  private resultCb: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCb: ((error: string) => void) | null = null;
  private running = false;

  isAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  start(): void {
    if (!this.isAvailable()) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    this.recognition = new SpeechRecognitionCtor() as SpeechRecognitionCompat;
    this.recognition.lang = 'ar-SA';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: SpeechRecognitionEventCompat) => {
      for (let r = 0; r < event.results.length; r++) {
        const result = event.results[r];
        if (result && result[0]) {
          const text = result[0].transcript;
          const isFinal = result.isFinal;
          if (isFinal || r === event.results.length - 1) {
            console.log(`[ASR ${isFinal ? 'FINAL' : 'interim'}] "${text}"`);
            this.resultCb?.(text, isFinal);
          }
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEventCompat) => {
      console.warn('[ASR error]', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.errorCb?.(event.error);
      }
    };

    this.recognition.onend = () => {
      console.log('[ASR] recognition ended, running:', this.running);
      if (this.running && this.recognition) {
        try {
          this.recognition.start();
          console.log('[ASR] restarted');
        } catch {
          // Ignore — already started
        }
      }
    };

    this.running = true;
    try {
      this.recognition.start();
      console.log('[ASR] Web Speech API started (lang: ar-SA)');
    } catch (e) {
      console.error('[ASR] Failed to start:', e);
      this.errorCb?.(`Failed to start: ${e}`);
    }
  }

  stop(): void {
    this.running = false;
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCb = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCb = callback;
  }
}

// ─── Local Whisper Backend (faster-whisper server) ──────

export class LocalWhisperBackend implements ASRBackend {
  readonly name = 'Local Whisper';
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private resultCb: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCb: ((error: string) => void) | null = null;
  private static cachedAvailable: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (LocalWhisperBackend.cachedAvailable !== null) return LocalWhisperBackend.cachedAvailable;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch('http://localhost:8765/health', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      LocalWhisperBackend.cachedAvailable = data.status === 'ok';
    } catch {
      LocalWhisperBackend.cachedAvailable = false;
    }
    // Cache expires after 30s so reconnects are detected
    setTimeout(() => { LocalWhisperBackend.cachedAvailable = null; }, 30_000);
    return LocalWhisperBackend.cachedAvailable!;
  }

  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ws = new WebSocket('ws://localhost:8765/ws/transcribe');

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            this.errorCb?.(data.error);
          } else if (data.text) {
            console.log(`[ASR Local ${data.is_final ? 'FINAL' : 'interim'}] "${data.text}"`);
            this.resultCb?.(data.text, data.is_final ?? true);
          }
        } catch (e) {
          console.warn('[ASR Local] Failed to parse message:', e);
        }
      };

      this.ws.onerror = () => {
        this.errorCb?.('WebSocket connection error');
      };

      // Wait for WebSocket to open before starting MediaRecorder
      await new Promise<void>((resolve, reject) => {
        if (!this.ws) return reject(new Error('No WebSocket'));
        this.ws.onopen = () => resolve();
        this.ws.onerror = () => reject(new Error('WebSocket failed to connect'));
      });

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(event.data);
        }
      };

      this.mediaRecorder.start(1500); // Send chunks every 1.5s
      console.log('[ASR] Local Whisper backend started');
    } catch (error) {
      console.error('[ASR] Local Whisper start failed:', error);
      this.stop(); // Clean up partial state
      throw error;  // Propagate so caller can fall back
    }
  }

  stop(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCb = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCb = callback;
  }
}

// ─── HF Inference API Backend ───────────────────────────

export class HFInferenceBackend implements ASRBackend {
  readonly name = 'HF Inference API';
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private resultCb: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCb: ((error: string) => void) | null = null;
  private running = false;
  private chunkInterval: ReturnType<typeof setInterval> | null = null;
  private audioChunks: Blob[] = [];

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'MediaRecorder' in window;
  }

  async start(): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.running = true;
      this.mediaRecorder.start(100);
      console.log('[ASR] HF Inference backend started');

      // Send chunks every 3 seconds
      this.chunkInterval = setInterval(() => {
        if (this.audioChunks.length > 0) {
          this.sendChunk();
        }
      }, 3000);
    } catch (error) {
      console.error('[ASR] Mic access denied:', error);
      this.errorCb?.(`Microphone access denied: ${error}`);
    }
  }

  stop(): void {
    this.running = false;

    if (this.chunkInterval) {
      clearInterval(this.chunkInterval);
      this.chunkInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCb = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCb = callback;
  }

  private async sendChunk(): Promise<void> {
    if (!this.running || this.audioChunks.length === 0) return;

    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    this.audioChunks = [];

    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/tarteel-ai/whisper-base-ar-quran',
        {
          method: 'POST',
          headers: { 'Content-Type': 'audio/webm' },
          body: blob,
        },
      );

      if (!response.ok) {
        if (response.status === 503) return; // Model loading
        throw new Error(`HF API error: ${response.status}`);
      }

      const result = await response.json();
      if (result.text) {
        console.log(`[ASR HF FINAL] "${result.text}"`);
        this.resultCb?.(result.text, true);
      }
    } catch (error) {
      console.warn('[ASR] HF Inference error:', error);
    }
  }
}

// ─── Android On-Device Whisper Backend ─────────────────

/**
 * ASR backend for Android WebView — communicates with native Kotlin
 * via @JavascriptInterface bridge. The native side runs whisper.cpp
 * directly on-device (no network, no WebSocket).
 *
 * Kotlin side: AsrBridge.kt registers as window.__AndroidAsrBridge
 * and calls window.__asrCallback(text, isFinal) with results.
 */
export class AndroidBridgeBackend implements ASRBackend {
  readonly name = 'Android On-Device Whisper';
  private resultCb: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCb: ((error: string) => void) | null = null;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && '__AndroidAsrBridge' in window;
  }

  async start(): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Android ASR bridge not available');
    }

    // Register callback on window for Kotlin to invoke via evaluateJavascript
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    win.__asrCallback = (text: string, isFinal: boolean) => {
      if (text) {
        console.log(`[ASR Android ${isFinal ? 'FINAL' : 'interim'}] "${text}"`);
        this.resultCb?.(text, isFinal);
      }
    };

    win.__asrErrorCallback = (error: string) => {
      console.error(`[ASR Android ERROR] ${error}`);
      this.errorCb?.(error);
    };

    // Tell Kotlin to start recording + streaming transcription
    win.__AndroidAsrBridge.start();
    console.log('[ASR] Android on-device backend started');
  }

  stop(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__AndroidAsrBridge?.stop();
    } catch (e) {
      console.warn('[ASR] Android bridge stop error:', e);
    }
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCb = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCb = callback;
  }
}
