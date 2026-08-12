import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "./components/app-shell";
import { FirebaseClientInitializer } from "./components/firebase-client-initializer";
import { themeBootstrapScript } from "./components/theme-toggle";

export const metadata: Metadata = {
  title: {
    default: "Upskill AI Labs",
    template: "%s · Upskill AI Labs",
  },
  description: "Practice real work with AI inside a safe synthetic enterprise.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="antialiased">
        <FirebaseClientInitializer />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
