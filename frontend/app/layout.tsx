import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { GmesRuntimeProvider } from "@/components/runtime-provider";

export const metadata: Metadata = {
  title: "GMES Agent",
  description: "LGE TN Production Engineering maintenance AI assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col h-screen overflow-hidden">
        <Nav />
        <GmesRuntimeProvider>
          <main className="flex-1 overflow-hidden">{children}</main>
        </GmesRuntimeProvider>
      </body>
    </html>
  );
}
