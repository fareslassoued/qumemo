'use client';

import React from 'react';
import { quranDataService } from '@/services/quranDataService';

interface AudioDownloadDialogProps {
  surahNumber: number;
  onDownload: () => void;
  onCancel: () => void;
  isDownloading?: boolean;
  progress?: number;
}

export function AudioDownloadDialog({
  surahNumber,
  onDownload,
  onCancel,
  isDownloading = false,
  progress = 0,
}: AudioDownloadDialogProps) {
  const surahInfo = quranDataService.getSurahInfo(surahNumber);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            Audio Not Available
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {surahInfo ? (
              <>
                <span className="font-semibold">{surahInfo.englishName}</span>
                <span className="mx-2">•</span>
                <span className="quran-text text-base">{surahInfo.name}</span>
              </>
            ) : (
              `Surah ${surahNumber}`
            )}
          </p>
        </div>

        {/* Message */}
        <div className="mb-6">
          {!isDownloading ? (
            <>
              <p className="text-gray-700 dark:text-gray-300 mb-3">
                The audio for this surah is not downloaded yet. Would you like to download it now?
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                <p className="text-blue-800 dark:text-blue-300">
                  <strong>Note:</strong> Audio files will be cached locally for offline access.
                  This may take a few moments depending on your connection.
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Downloading audio from Archive.org...
              </p>

              {/* Progress Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Please wait while we download the audio file...
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isDownloading && (
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onDownload}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Download
            </button>
          </div>
        )}

        {isDownloading && (
          <div className="flex justify-center">
            <button
              onClick={onCancel}
              disabled
              className="px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg font-medium cursor-not-allowed"
            >
              Downloading...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
