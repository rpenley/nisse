"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
	LayoutDashboard,
	ShoppingCart,
	Package,
	ClipboardList,
	Users,
	Calendar,
	UserCog,
	Shield,
	type LucideIcon,
} from "lucide-react";

interface NavItem {
	href: string;
	label: string;
	icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/pos", label: "Point of Sale", icon: ShoppingCart },
	{ href: "/inventory", label: "Inventory", icon: Package },
	{ href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
	{ href: "/customers", label: "Customers", icon: Users },
	{ href: "/calendar", label: "Calendar", icon: Calendar },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
	{ href: "/users", label: "Users", icon: UserCog },
	{ href: "/roles", label: "Roles", icon: Shield },
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

	function navLink({ href, label, icon: Icon }: NavItem) {
		const active = pathname === href || pathname.startsWith(href + "/");
		return (
			<Link
				key={href}
				href={href}
				className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
					active
						? "bg-blue-50 text-blue-600"
						: "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
				}`}
			>
				<Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
				{label}
			</Link>
		);
	}

	return (
		<aside className="w-60 min-h-screen bg-white border-r border-zinc-200 flex flex-col">
			<div className="px-4 py-5 border-b border-zinc-200">
				<span className="text-blue-600 text-lg font-bold tracking-tight">
					Nisse
				</span>
			</div>
			<nav className="flex-1 px-3 py-4 space-y-0.5">
				{NAV_ITEMS.map(navLink)}
				{isAdmin && (
					<>
						<div className="px-3 pt-5 pb-1.5">
							<span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
								Admin
							</span>
						</div>
						{ADMIN_NAV_ITEMS.map(navLink)}
					</>
				)}
			</nav>
		</aside>
	);
}
