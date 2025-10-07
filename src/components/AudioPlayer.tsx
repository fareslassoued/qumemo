'use client';

import React, { useState, useEffect } from 'react';
import { audioService } from '@/services/audioService';
import { AudioPlayerState } from '@/types/quran';
import { AudioDownloadDialog } from './AudioDownloadDialog';

interface AudioPlayerProps {
  surahNumber: number;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export function AudioPlayer({ surahNumber, onPlayingChange }: AudioPlayerProps) {
  const [playerState, setPlayerState] = useState<AudioPlayerState>(
    audioService.getState()
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingSurah, setPendingSurah] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [settings, setSettings] = useState(audioService.getSettings());

  useEffect(() => {
    const updateState = () => {
      setPlayerState(audioService.getState());
      onPlayingChange?.(audioService.getState().isPlaying);
    };

    const handleAudioNotFound = (data: unknown) => {
      const { surahNumber: notFoundSurah } = data as { surahNumber: number };
      setPendingSurah(notFoundSurah);
      setShowDownloadDialog(true);
    };

    const handleDownloadProgress = (data: unknown) => {
      const progress = data as { percentage: number };
      setDownloadProgress(progress.percentage);
    };

    const handleDownloadCompleted = async () => {
      setIsDownloading(false);
      setShowDownloadDialog(false);
      setDownloadProgress(0);

      // Auto-play after download with a small delay
      if (pendingSurah) {
        // Give the cache a moment to fully persist
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
          await audioService.play(pendingSurah);
        } catch (error) {
          console.error('Failed to auto-play after download:', error);
        } finally {
          setPendingSurah(null);
        }
      }
    };

    const handleDownloadFailed = () => {
      setIsDownloading(false);
      setShowDownloadDialog(false);
      setDownloadProgress(0);
      alert('Failed to download audio. Please try again.');
    };

    audioService.on('play', updateState);
    audioService.on('pause', updateState);
    audioService.on('timeupdate', updateState);
    audioService.on('loadedmetadata', updateState);
    audioService.on('audio-not-found', handleAudioNotFound);
    audioService.on('download-progress', handleDownloadProgress);
    audioService.on('download-completed', handleDownloadCompleted);
    audioService.on('download-failed', handleDownloadFailed);

    return () => {
      audioService.off('play', updateState);
      audioService.off('pause', updateState);
      audioService.off('timeupdate', updateState);
      audioService.off('loadedmetadata', updateState);
      audioService.off('audio-not-found', handleAudioNotFound);
      audioService.off('download-progress', handleDownloadProgress);
      audioService.off('download-completed', handleDownloadCompleted);
      audioService.off('download-failed', handleDownloadFailed);
    };
  }, [onPlayingChange, pendingSurah]);

  const handlePlayPause = () => {
    if (playerState.isPlaying) {
      audioService.pause();
    } else {
      audioService.play(surahNumber);
    }
  };

  const handleStop = () => {
    audioService.stop();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    audioService.seek(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseFloat(e.target.value);
    audioService.setVolume(volume);
    setPlayerState({ ...playerState, volume });
  };

  const handleSpeedChange = (speed: number) => {
    audioService.setPlaybackSpeed(speed);
    setPlayerState({ ...playerState, playbackSpeed: speed });
  };

  const handleDownloadConfirm = async () => {
    if (!pendingSurah) return;

    setIsDownloading(true);
    await audioService.downloadAudio(pendingSurah, (progress) => {
      setDownloadProgress(progress.percentage);
    });
  };

  const handleDownloadCancel = () => {
    setShowDownloadDialog(false);
    setPendingSurah(null);
    setDownloadProgress(0);
  };

  const handleRepeatAyahToggle = () => {
    const newSettings = { ...settings, repeatAyah: !settings.repeatAyah };
    setSettings(newSettings);
    audioService.updateSettings(newSettings);
  };

  const handleRepeatCountChange = (count: number) => {
    const newSettings = { ...settings, repeatCount: count };
    setSettings(newSettings);
    audioService.updateSettings(newSettings);
  };

  const handleRepeatSectionToggle = () => {
    const newSettings = { ...settings, repeatSection: !settings.repeatSection };
    setSettings(newSettings);
    audioService.updateSettings(newSettings);
  };

  const handleSectionStartChange = (ayah: number) => {
    const newSettings = {
      ...settings,
      sectionStart: { surah: surahNumber, ayah },
    };
    setSettings(newSettings);
    audioService.updateSettings(newSettings);
  };

  const handleSectionEndChange = (ayah: number) => {
    const newSettings = {
      ...settings,
      sectionEnd: { surah: surahNumber, ayah },
    };
    setSettings(newSettings);
    audioService.updateSettings(newSettings);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-800 p-4 border-t border-gray-300 dark:border-gray-700">
      <div className="max-w-4xl mx-auto">
        {/* Main Controls */}
        <div className="flex items-center gap-4 mb-3">
          {/* Play/Pause Button */}
          <button
            onClick={handlePlayPause}
            className="w-12 h-12 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-colors"
            title={playerState.isPlaying ? 'Pause' : 'Play'}
          >
            {playerState.isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4h2v12H6V4zm6 0h2v12h-2V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4l10 6-10 6V4z" />
              </svg>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={handleStop}
            className="w-10 h-10 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-full transition-colors"
            title="Stop"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 5h10v10H5V5z" />
            </svg>
          </button>

          {/* Progress Bar */}
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max={playerState.duration || 0}
              value={playerState.currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
              <span>{formatTime(playerState.currentTime)}</span>
              <span>{formatTime(playerState.duration)}</span>
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M10 3.5v13l-4-4H3v-5h3l4-4zm5 1.5v10l2-2-2-2V5z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={playerState.volume}
              onChange={handleVolumeChange}
              className="w-20 h-2 bg-gray-300 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-10 h-10 flex items-center justify-center bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-full transition-colors"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md">
            <h3 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
              Playback Settings
            </h3>

            {/* Speed Control */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 dark:text-gray-400 block mb-2">
                Playback Speed: {playerState.playbackSpeed}x
              </label>
              <div className="flex gap-2">
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className={`px-3 py-1 rounded text-sm ${
                      playerState.playbackSpeed === speed
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            {/* Repeat Surah */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 block">
                    Repeat Surah
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Loops entire surah
                  </p>
                </div>
                <button
                  onClick={handleRepeatAyahToggle}
                  className={`px-3 py-1 rounded text-sm ${
                    settings.repeatAyah
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {settings.repeatAyah ? 'ON' : 'OFF'}
                </button>
              </div>
              {settings.repeatAyah && (
                <div>
                  <label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                    Repeat Count: {settings.repeatCount}x
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 5, 7, 10, 20].map((count) => (
                      <button
                        key={count}
                        onClick={() => handleRepeatCountChange(count)}
                        className={`px-2 py-1 rounded text-xs ${
                          settings.repeatCount === count
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {count}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Info Note */}
            <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-800 dark:text-yellow-300">
              <strong>Note:</strong> Ayah-by-ayah playback requires ayah timestamp data (coming soon). Currently plays whole surah.
            </div>
          </div>
        )}
      </div>

      {/* Download Dialog */}
      {showDownloadDialog && pendingSurah && (
        <AudioDownloadDialog
          surahNumber={pendingSurah}
          onDownload={handleDownloadConfirm}
          onCancel={handleDownloadCancel}
          isDownloading={isDownloading}
          progress={downloadProgress}
        />
      )}
    </div>
  );
}
