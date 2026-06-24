import type { Metadata } from "next";
import "./globals.css";

// Define metadata for the entire application
// This includes the page title, description, and favicon configuration
export const metadata: Metadata = {
  title: "GridLock 2.0 — Smart City Enforcement Intelligence",
  description: "AI-driven real-time traffic congestion and illegal parking prediction platform for Bengaluru. Powered by Spatio-Temporal Graph Attention Networks (ST-GATv2) and Macroscopic Traffic Physics.",
  icons: {
    icon: "/favicon.ico",
  }
};

// Root layout component that wraps all pages in the application
// This component sets up the HTML structure, imports global CSS, and preloads fonts
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Preconnect to Google Fonts CDN for performance optimization */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Load Inter and JetBrains Mono font families with various weights */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      {/* Full-height body that prevents scrolling - map takes entire screen */}
      <body className="h-full w-full overflow-hidden flex flex-col antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
