'use client';

import React, { useState, useEffect } from 'react';
import { recordingService } from '@/services/recordingService';
import { storageService } from '@/services/storageService';
import { Recording } from '@/types/quran';

interface VoiceRecorderProps {
  pageNumber: number;
  onRecordingComplete?: (recording: Recording) => void;
}

export function VoiceRecorder({
  pageNumber,
  onRecordingComplete,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    loadRecordings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const loadRecordings = async () => {
    const allRecordings = await storageService.getRecordings();
    const filtered = allRecordings.filter(
      (r: Recording) => r.pageNumber === pageNumber
    );
    setRecordings(filtered);
  };

  const handleStartRecording = async () => {
    try {
      if (hasPermission === null) {
        const granted = await recordingService.initialize();
        setHasPermission(granted);
        if (!granted) {
          alert('Microphone permission is required for recording');
          return;
        }
      }

      await recordingService.startRecording();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    try {
      const recording = await recordingService.stopRecording(
        0, // surahNumber not needed for page-level
        0, // ayahNumber not needed for page-level
        pageNumber
      );
      setIsRecording(false);
      setRecordingTime(0);

      // Save recording
      await storageService.saveRecording(recording);
      await loadRecordings();

      onRecordingComplete?.(recording);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      alert('Failed to save recording');
    }
  };

  const handleCancelRecording = () => {
    recordingService.cancelRecording();
    setIsRecording(false);
    setRecordingTime(0);
  };

  const handlePlayRecording = async (recording: Recording) => {
    if (playingId === recording.id) {
      return;
    }

    try {
      setPlayingId(recording.id);
      await recordingService.playRecording(recording);
      setPlayingId(null);
    } catch (error) {
      console.error('Failed to play recording:', error);
      setPlayingId(null);
    }
  };

  const handleDeleteRecording = async (id: string) => {
    if (confirm('Delete this recording?')) {
      await storageService.removeRecording(id);
      await loadRecordings();
    }
  };

  const handleDownloadRecording = (recording: Recording) => {
    recordingService.downloadRecording(recording, `page-${pageNumber}-${recording.id}.webm`);
  };

  const handleClearAllRecordings = async () => {
    if (confirm(`Clear all ${recordings.length} recording(s) for page ${pageNumber}?`)) {
      for (const recording of recordings) {
        await storageService.removeRecording(recording.id);
      }
      await loadRecordings();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Voice Recording
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Page {pageNumber}
        </div>
      </div>

      {/* Recording Controls */}
      <div className="flex items-center justify-center gap-3 mb-4">
        {!isRecording ? (
          <button
            onClick={handleStartRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                clipRule="evenodd"
              />
            </svg>
            Record
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900 rounded-full">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-mono font-medium text-red-700 dark:text-red-300">
                {formatTime(recordingTime)}
              </span>
            </div>
            <button
              onClick={handleStopRecording}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-medium transition-colors"
            >
              Stop & Save
            </button>
            <button
              onClick={handleCancelRecording}
              className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-full font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Recordings List */}
      {recordings.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Previous Recordings ({recordings.length})
            </div>
            <button
              onClick={handleClearAllRecordings}
              className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              Clear All
            </button>
          </div>
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => handlePlayRecording(recording)}
                  disabled={playingId === recording.id}
                  className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-full transition-colors"
                >
                  {playingId === recording.id ? (
                    <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                    {formatTime(Math.round(recording.duration))}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(recording.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleDownloadRecording(recording)}
                  className="p-1 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteRecording(recording.id)}
                  className="p-1 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
