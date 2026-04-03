"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import ThemeToggle from "@/components/ThemeToggle";

const ROUTE_LABELS: Record<string, string> = {
	"/dashboard": "Dashboard",
	"/pos": "Point of Sale",
	"/inventory": "Inventory",
	"/purchase-orders": "Purchase Orders",
	"/customers": "Customers",
	"/calendar": "Calendar",
	"/users": "Users",
	"/roles": "Roles",
	"/profile": "Profile",
};

export default function Header() {
	const pathname = usePathname();
	const router = useRouter();
	const [username, setUsername] = useState("admin");

	const label =
		Object.entries(ROUTE_LABELS).find(
			([route]) => pathname === route || pathname.startsWith(route + "/"),
		)?.[1] ?? "Nisse";

	useEffect(() => {
		fetch("/api/me", { credentials: "include" })
			.then((r) => r.ok ? r.json() : null)
			.then((data) => { if (data?.username) setUsername(data.username); })
			.catch(() => {});
	}, []);

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
		router.push("/login");
	}

	return (
		<header className="h-12 flex items-center justify-between px-6 border-b border-zinc-200 bg-white/80 backdrop-blur shrink-0">
			<div className="flex items-center gap-1.5 text-sm">
				<span className="text-zinc-400">Nisse</span>
				<ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
				<span className="text-zinc-900 font-medium">{label}</span>
			</div>
			<div className="flex items-center gap-3">
				<ThemeToggle />
				<Link
					href="/profile"
					className="text-zinc-500 hover:text-zinc-900 text-sm transition-colors"
				>
					{username}
				</Link>
				<button
					onClick={handleLogout}
					className="text-zinc-400 hover:text-rose-600 text-sm transition-colors"
				>
					Sign out
				</button>
			</div>
		</header>
	);
}
