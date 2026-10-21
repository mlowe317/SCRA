import Link from "next/link";
import { ShieldCheck } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/loans", label: "Loans" },
  { href: "/imports", label: "Import / Export" },
];

export function SiteNav() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5" />
          SCRA Tracker
        </Link>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-foreground text-sm">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
