import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntentionEngine",
  description: "Pareto-optimal intention execution",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
