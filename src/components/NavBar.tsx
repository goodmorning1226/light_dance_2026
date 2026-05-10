"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Editor" },
  { href: "/arrangement", label: "Arrangement" },
  { href: "/library", label: "Library" },
];

export function NavBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "8px 16px",
        background: "#1e293b",
        color: "white",
        borderBottom: "1px solid #0f172a",
        flexShrink: 0,
      }}
    >
      <strong style={{ letterSpacing: "0.02em" }}>LED Dance 2026</strong>
      <span style={{ flex: 1 }} />
      {LINKS.map((link) => (
        <NavLink key={link.href} href={link.href} active={isActive(link.href)}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        color: active ? "#fbbf24" : "#e2e8f0",
        textDecoration: "none",
        fontWeight: active ? 600 : 400,
        padding: "4px 10px",
        borderRadius: 4,
        background: active ? "rgba(251,191,36,0.1)" : "transparent",
      }}
    >
      {children}
    </Link>
  );
}
