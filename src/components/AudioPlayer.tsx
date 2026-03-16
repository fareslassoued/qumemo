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


  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

  return (
    <div
      className="px-4 py-3 border-t"
      style={{ background: 'var(--bar-bg)', borderColor: 'var(--divider)' }}
      dir="ltr"
    >
      <div className="max-w-4xl mx-auto">
        {/* Main Controls */}
        <div className="flex items-center gap-3 mb-2">
          {/* Play/Pause Button */}
          <button
            onClick={handlePlayPause}
            className="w-10 h-10 flex items-center justify-center rounded-full shadow-sm transition-all hover:scale-105"
            style={{ background: 'var(--gold)', color: 'var(--parchment)' }}
            title={playerState.isPlaying ? 'Pause' : 'Play'}
          >
            {playerState.isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4h2v12H6V4zm6 0h2v12h-2V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4l10 6-10 6V4z" />
              </svg>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={handleStop}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--surface)', color: 'var(--dim)' }}
            title="Stop"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
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
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: 'var(--gold)', background: 'var(--divider)' }}
            />
            <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--dim)', ...uiFont }}>
              <span>{formatTime(playerState.currentTime)}</span>
              <span>{formatTime(playerState.duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--dim)' }}>
              <path d="M10 3.5v13l-4-4H3v-5h3l4-4zm5 1.5v10l2-2-2-2V5z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={playerState.volume}
              onChange={handleVolumeChange}
              className="w-16 h-1 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: 'var(--gold)', background: 'var(--divider)' }}
            />
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{
              background: showSettings ? 'var(--gold)' : 'var(--surface)',
              color: showSettings ? 'var(--parchment)' : 'var(--dim)',
            }}
            title="Settings"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="rounded-lg p-3 mt-2" style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}>
            <h3 className="text-xs font-medium mb-3 tracking-wider uppercase" style={{ color: 'var(--gold)', ...uiFont }}>
              Playback Settings
            </h3>

            {/* Speed Control */}
            <div className="mb-3">
              <label className="text-xs block mb-1.5" style={{ color: 'var(--dim)', ...uiFont }}>
                Speed: {playerState.playbackSpeed}×
              </label>
              <div className="flex gap-1.5">
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handleSpeedChange(speed)}
                    className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                    style={
                      playerState.playbackSpeed === speed
                        ? { background: 'var(--gold)', color: 'var(--parchment)' }
                        : { background: 'var(--divider)', color: 'var(--dim)', ...uiFont }
                    }
                  >
                    {speed}×
                  </button>
                ))}
              </div>
            </div>

            {/* Repeat */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <label className="text-xs block" style={{ color: 'var(--ink)', ...uiFont }}>Repeat Surah</label>
                  <p className="text-[10px]" style={{ color: 'var(--dim)', ...uiFont }}>Loops entire surah</p>
                </div>
                <button
                  onClick={handleRepeatAyahToggle}
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={
                    settings.repeatAyah
                      ? { background: 'var(--gold)', color: 'var(--parchment)' }
                      : { background: 'var(--divider)', color: 'var(--dim)', ...uiFont }
                  }
                >
                  {settings.repeatAyah ? 'ON' : 'OFF'}
                </button>
              </div>
              {settings.repeatAyah && (
                <div>
                  <label className="text-[10px] block mb-1" style={{ color: 'var(--dim)', ...uiFont }}>
                    Repeat Count: {settings.repeatCount}×
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[1, 2, 3, 5, 7, 10, 20].map((count) => (
                      <button
                        key={count}
                        onClick={() => handleRepeatCountChange(count)}
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={
                          settings.repeatCount === count
                            ? { background: 'var(--gold)', color: 'var(--parchment)' }
                            : { background: 'var(--divider)', color: 'var(--dim)', ...uiFont }
                        }
                      >
                        {count}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-[10px] p-2 rounded" style={{ background: 'var(--divider)', color: 'var(--dim)', ...uiFont }}>
              Ayah-by-ayah playback coming soon. Currently plays whole surah.
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
