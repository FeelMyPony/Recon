import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc/provider";
import { ToastProvider } from "@/components/toast";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "RECON",
  description: "AI-powered outreach automation platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TRPCProvider>
          <ToastProvider>{children}</ToastProvider>
        </TRPCProvider>
      </body>
    </html>
  );
}
