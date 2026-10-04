import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { InstallPrompt } from "@/components/InstallPrompt";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "DAIMA Health Managing System", template: "%s · DAIMA Health" },
  description: "One patient record from reception to pharmacy, billing and reporting.",
  // iPhone/iPad "Add to Home Screen": open full screen with this name under the icon.
  appleWebApp: { capable: true, title: "DAIMA Health", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0e8f8a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
