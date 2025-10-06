import localFont from 'next/font/local';

// Qalun Font from KFGQPC
export const qaloonFont = localFont({
  src: [
    {
      path: '../../public/fonts/qaloon.10.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-qaloon',
  display: 'swap',
});
