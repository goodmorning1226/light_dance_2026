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
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "10px 20px",
        background: "linear-gradient(180deg, #0b1224 0%, #111a30 100%)",
        color: "var(--color-navbar-fg)",
        borderBottom: "1px solid var(--color-navbar-border)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.18)",
        flexShrink: 0,
        backdropFilter: "saturate(140%) blur(8px)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
            boxShadow: "0 4px 14px rgba(99,102,241,0.45)",
            color: "white",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: -0.5,
          }}
        >
          L
        </span>
        <strong
          style={{
            color: "white",
            letterSpacing: 0.3,
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          LED Dance
          <span
            style={{
              marginLeft: 6,
              padding: "1px 6px",
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 999,
              background: "rgba(99,102,241,0.18)",
              color: "#c7d2fe",
              letterSpacing: 0.5,
              verticalAlign: "1px",
            }}
          >
            2026
          </span>
        </strong>
      </div>

      <span style={{ flex: 1 }} />

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 4,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {LINKS.map((link) => (
          <NavLink key={link.href} href={link.href} active={isActive(link.href)}>
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: active ? "white" : "var(--color-navbar-fg)",
        textDecoration: "none",
        fontWeight: active ? 600 : 500,
        fontSize: 13,
        padding: "6px 14px",
        borderRadius: 999,
        background: active
          ? "linear-gradient(135deg, rgba(99,102,241,0.95) 0%, rgba(139,92,246,0.95) 100%)"
          : "transparent",
        boxShadow: active ? "0 2px 10px rgba(99,102,241,0.35)" : "none",
        transition: "all var(--transition-fast)",
      }}
    >
      {children}
    </Link>
  );
}
