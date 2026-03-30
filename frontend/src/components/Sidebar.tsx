"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
	{ href: "/dashboard", label: "Dashboard" },
	{ href: "/pos", label: "POS" },
	{ href: "/inventory", label: "Inventory" },
	{ href: "/purchase-orders", label: "Purchase Orders" },
	{ href: "/customers", label: "Customers" },
	{ href: "/calendar", label: "Calendar" },
];

const ADMIN_NAV_ITEMS = [
	{ href: "/users", label: "Users" },
	{ href: "/roles", label: "Roles" },
];

export default function Sidebar() {
	const pathname = usePathname();
	const [isAdmin, setIsAdmin] = useState(false);

	useEffect(() => {
		fetch("/api/me", { credentials: "include" })
			.then((r) => r.ok ? r.json() : null)
			.then((data) => { if (data?.role === "admin") setIsAdmin(true); })
			.catch(() => {});
	}, []);

	function navLink({ href, label }: { href: string; label: string }) {
		const active = pathname === href || pathname.startsWith(href + "/");
		return (
			<Link
				key={href}
				href={href}
				className={`block px-3 py-2 rounded font-mono text-sm transition-colors ${
					active
						? "bg-[#3c3836] text-[#ebdbb2]"
						: "text-[#928374] hover:bg-[#3c3836] hover:text-[#ebdbb2]"
				}`}
			>
				{label}
			</Link>
		);
	}

	return (
		<aside className="w-56 min-h-screen bg-[#282828] border-r border-[#3c3836] flex flex-col">
			<div className="px-4 py-5 border-b border-[#3c3836]">
				<span className="text-[#fabd2f] font-mono text-lg font-bold tracking-wide">
					Nisse
				</span>
			</div>
			<nav className="flex-1 px-2 py-4 space-y-1">
				{NAV_ITEMS.map(navLink)}
				{isAdmin && (
					<>
						<div className="px-3 pt-4 pb-1">
							<span className="text-[#665c54] font-mono text-xs uppercase tracking-wider">Admin</span>
						</div>
						{ADMIN_NAV_ITEMS.map(navLink)}
					</>
				)}
			</nav>
		</aside>
	);
}
