import type { ReactNode } from "react";
import { Navbar } from "./Navbar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-dark-950">
      <Navbar />
      <main className="md:ml-20">{children}</main>
    </div>
  );
}
