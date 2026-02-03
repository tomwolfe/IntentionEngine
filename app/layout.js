import './globals.css';

export const metadata = {
  title: 'Intention Engine',
  description: 'Transform natural language into orchestrated actions',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}