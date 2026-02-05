"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Inicio" },
  { href: "/users", label: "Usuarios" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-8">
          <h1 className="text-lg font-semibold">Qoa</h1>
          <p className="text-sm text-zinc-500">Backoffice</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-zinc-200 font-medium dark:bg-zinc-800"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
