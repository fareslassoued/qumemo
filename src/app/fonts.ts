import localFont from 'next/font/local';
import { EB_Garamond } from 'next/font/google';

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

// EB Garamond — refined serif for UI chrome
export const garamondFont = EB_Garamond({
  variable: '--font-garamond',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});
