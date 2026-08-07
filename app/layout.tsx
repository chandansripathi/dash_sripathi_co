import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus · Infrastructure Command Center",
  description: "Manage domains, servers, renewals, users, alerts, and infrastructure telemetry.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "Nexus Infrastructure", description: "Your infrastructure command center", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
