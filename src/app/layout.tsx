import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NavBar } from "@/components/NavBar";
import { CloudModeBar } from "@/components/cloud/CloudModeBar";
import { CloudModeProvider } from "@/components/cloud/CloudModeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LED Dance Editor",
  description: "Visual editor for ESP32 LED dance choreography",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <CloudModeProvider>
          <NavBar />
          <CloudModeBar />
          <main>{children}</main>
        </CloudModeProvider>
      </body>
    </html>
  );
}
