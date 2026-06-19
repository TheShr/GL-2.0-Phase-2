import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GridLock 2.0 — Smart City Enforcement Intelligence",
  description: "AI-driven real-time traffic congestion and illegal parking prediction platform for Bengaluru. Powered by Spatio-Temporal Graph Attention Networks (ST-GATv2) and Macroscopic Traffic Physics.",
  icons: {
    icon: "/favicon.ico",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="h-full w-full overflow-hidden flex flex-col antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
