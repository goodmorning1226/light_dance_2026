import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "LED Dance Editor",
  description: "Visual editor for ESP32 LED dance choreography",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
