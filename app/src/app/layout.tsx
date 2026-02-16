import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "HN Showcase — Visual Gallery for Show HN",
    template: "%s — HN Showcase",
  },
  description:
    "The AI-powered visual front page for Show HN. Browse, filter, and discover the best projects launched on Hacker News.",
  metadataBase: new URL("https://hnshowcase.com"),
  openGraph: {
    type: "website",
    siteName: "HN Showcase",
    title: "HN Showcase — Visual Gallery for Show HN",
    description:
      "The AI-powered visual front page for Show HN. Browse, filter, and discover the best projects launched on Hacker News.",
  },
  twitter: {
    card: "summary_large_image",
    title: "HN Showcase",
    description: "AI-powered visual gallery for Show HN projects.",
  },
  alternates: {
    canonical: "https://hnshowcase.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 flex-1">
              {children}
            </main>
            <footer className="border-t border-border bg-background">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>HN Showcase — AI-powered gallery for Show HN</span>
                <a
                  href="https://news.ycombinator.com/showhn.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  Show HN on Hacker News
                </a>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
