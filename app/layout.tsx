import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Atlas — Portfolio Intelligence',
  description: 'An autonomous portfolio investigation concept. Explore factor exposures, stress test hypothetical portfolios, and investigate risks with AI.',
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
