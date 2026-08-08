import type { Metadata } from "next";
import "./globals.css";
import { query } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const brand = (await query<{ brand_name:string; brand_tagline:string; favicon_path:string|null }>("SELECT brand_name,brand_tagline,favicon_path FROM branding WHERE id=1")).rows[0];
    return { title: `${brand?.brand_name || "Nexus"} · Infrastructure Command Center`, description: brand?.brand_tagline || "Manage domains, servers, renewals, users, alerts, and infrastructure telemetry.", icons: { icon: brand?.favicon_path || "/favicon.ico" }, openGraph: { title: `${brand?.brand_name || "Nexus"} Infrastructure`, description: brand?.brand_tagline || "Your infrastructure command center", images: ["/og.png"] } };
  } catch {
    return { title: "Nexus · Infrastructure Command Center", icons: { icon: "/favicon.ico" } };
  }
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
