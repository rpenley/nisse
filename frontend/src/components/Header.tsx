"use client";

import { usePathname } from "next/navigation";

const ROUTE_LABELS: Record<string, string> = {
	"/dashboard": "Dashboard",
	"/pos": "Point of Sale",
	"/inventory": "Inventory",
	"/purchase-orders": "Purchase Orders",
	"/customers": "Customers",
	"/calendar": "Calendar",
	"/settings": "Settings",
};

export default function Header() {
	const pathname = usePathname();
	const label =
		Object.entries(ROUTE_LABELS).find(
			([route]) => pathname === route || pathname.startsWith(route + "/"),
		)?.[1] ?? "Nisse";

	return (
		<header className="h-12 flex items-center justify-between px-6 border-b border-[#3c3836] bg-[#282828] shrink-0">
			<span className="text-[#a89984] font-mono text-sm">
				<span className="text-[#665c54]">Nisse</span>
				<span className="text-[#504945] mx-1">/</span>
				<span className="text-[#ebdbb2]">{label}</span>
			</span>
			<span className="text-[#665c54] font-mono text-xs">admin</span>
		</header>
	);
}
