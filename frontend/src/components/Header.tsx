"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
		<header className="h-12 flex items-center justify-between px-6 border-b border-[#3c3836] bg-[#282828] shrink-0">
			<span className="text-[#a89984] font-mono text-sm">
				<span className="text-[#665c54]">Nisse</span>
				<span className="text-[#504945] mx-1">/</span>
				<span className="text-[#ebdbb2]">{label}</span>
			</span>
			<div className="flex items-center gap-3">
				<Link href="/profile" className="text-[#665c54] hover:text-[#ebdbb2] font-mono text-xs transition-colors">{username}</Link>
				<button
					onClick={handleLogout}
					className="text-[#928374] hover:text-[#fb4934] font-mono text-xs transition-colors"
				>
					logout
				</button>
			</div>
		</header>
	);
}
