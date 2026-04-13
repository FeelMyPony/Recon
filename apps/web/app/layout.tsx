import type { Metadata } from "next";
import { TRPCProvider } from "@/lib/trpc/provider";
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
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
