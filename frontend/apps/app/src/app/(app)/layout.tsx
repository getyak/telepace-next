import type { Metadata } from "next";
import { siteConfig } from "@telepace/config";

import { Sidebar } from "@/components/app/Sidebar";
import { MobileNav } from "@/components/app/MobileNav";

export const metadata: Metadata = {
  title: { default: siteConfig.brand.name, template: `%s · ${siteConfig.brand.name}` },
  description: siteConfig.brand.tagline,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <MobileNav />
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
