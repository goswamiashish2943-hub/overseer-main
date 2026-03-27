// packages/dashboard/app/layout.jsx
// Root layout — applies Tailwind base styles and sets metadata

import './globals.css';

export const metadata = {
  title:       'Overseer — Know what your AI is building',
  description: 'Live narration of every file your AI coding agent writes.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
