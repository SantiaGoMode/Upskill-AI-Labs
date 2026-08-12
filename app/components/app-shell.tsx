"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { isAdmin, isFacilitator, isViewer, useIdentity, type Identity } from "../lib/client-api";
import { cx } from "./ui";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
};

const LEARNER_NAV: NavItem[] = [
  { href: "/", label: "Today" },
  { href: "/course", label: "Course" },
  { href: "/path", label: "Pathway" },
  { href: "/library", label: "Prompts" },
  { href: "/ledger", label: "Ledger" },
];

const FACILITATOR_NAV: NavItem[] = [
  { href: "/studio", label: "Studio" },
  { href: "/cohorts", label: "Cohorts" },
  { href: "/review", label: "Review" },
  { href: "/governance", label: "Governance" },
];

const ADMIN_NAV: NavItem[] = [{ href: "/admin", label: "Users" }];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { identity, loading } = useIdentity();
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  const items = [
    ...LEARNER_NAV,
    ...(isFacilitator(identity) ? FACILITATOR_NAV : []),
    ...(isAdmin(identity) ? ADMIN_NAV : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-raised/95 backdrop-blur">
        <div className="mx-auto flex h-[60px] w-full max-w-[1180px] items-center gap-4 px-6 md:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 font-display text-[16px] font-bold tracking-tight">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-[7px_7px_12px_7px] bg-forest font-display text-[15px] text-white"
            >
              U
            </span>
            <span className="hidden sm:inline">Upskill AI Labs</span>
          </Link>

          <nav aria-label="Main" className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cx(
                  "rounded-[7px] px-3 py-2 text-[14px] font-semibold transition-colors",
                  isActive(pathname, item.href) ? "bg-inset text-fg" : "text-muted hover:bg-inset hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {loading ? null : <AccountChip identity={identity} />}
            <button
              type="button"
              className="rounded-[7px] border border-line-strong px-3 py-2 text-[13px] font-semibold lg:hidden"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav aria-label="Main (compact)" className="border-t border-line bg-raised px-6 py-2 lg:hidden">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cx(
                  "block rounded-[7px] px-3 py-2.5 text-[15px] font-semibold",
                  isActive(pathname, item.href) ? "bg-inset text-fg" : "text-muted",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      {!loading && isViewer(identity) ? (
        <div className="border-b border-warn-line bg-warn-bg px-6 py-2 text-center text-[13px] font-semibold text-warn-fg">
          Read-only demo · browse the course and evidence, or sign in from Account for an assigned role.
        </div>
      ) : null}

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line bg-raised">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[13px] text-muted md:px-8">
          <p>A local, synthetic environment for learning to do real work with AI.</p>
          <p>Northwind fixtures · no customer data</p>
        </div>
      </footer>
    </div>
  );
}

function AccountChip({ identity }: { identity: Identity | null }) {
  if (!identity) {
    return (
      <Link href="/account" className="rounded-[7px] border border-line-strong px-3 py-2 text-[13px] font-semibold">
        Sign in
      </Link>
    );
  }
  const initials = identity.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <Link
      href="/account"
      className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 transition-colors hover:bg-inset"
      title={`${identity.displayName} · ${identity.role}`}
    >
      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest text-[12px] font-bold text-white"
      >
        {initials || "U"}
      </span>
      <span className="hidden text-[13px] font-semibold md:inline">
        {identity.role === "admin"
          ? "Admin"
          : identity.role === "facilitator"
            ? "Facilitator"
            : identity.role === "viewer"
              ? "Demo"
              : "Student"}
      </span>
    </Link>
  );
}
