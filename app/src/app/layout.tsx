import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";
import Link from "next/link";
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

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
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
    images: [{ url: "https://hnshowcase.com/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HN Showcase",
    description: "AI-powered visual gallery for Show HN projects.",
    images: ["https://hnshowcase.com/og-image.png"],
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
        className={`${geistSans.variable} ${geistMono.variable} ${sora.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "HN Showcase",
              url: "https://hnshowcase.com",
              description:
                "The AI-powered visual front page for Show HN. Browse, filter, and discover the best projects launched on Hacker News.",
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: "https://hnshowcase.com/search?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
              },
            }),
          }}
        />
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 flex-1">
              {children}
            </main>
            <footer className="border-t border-border bg-muted/30">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>HN Showcase — AI-powered gallery for Show HN</span>
                <div className="flex items-center gap-4">
                  <Link
                    href="/about"
                    className="hover:text-primary transition-colors"
                  >
                    About
                  </Link>
                  <a
                    href="https://github.com/InsipidPoint/showhn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    GitHub
                  </a>
                  <a
                    href="https://news.ycombinator.com/showhn.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    Show HN
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
