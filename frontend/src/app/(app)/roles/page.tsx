"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Permission {
	label: string;
	admin: boolean;
	cashier: boolean;
}

const PERMISSIONS: Permission[] = [
	{ label: "Dashboard & metrics",      admin: true,  cashier: false },
	{ label: "Point of Sale",            admin: true,  cashier: true  },
	{ label: "Inventory — view",         admin: true,  cashier: true  },
	{ label: "Inventory — add / edit",   admin: true,  cashier: false },
	{ label: "Purchase Orders",          admin: true,  cashier: false },
	{ label: "Customers",                admin: true,  cashier: true  },
	{ label: "Calendar",                 admin: true,  cashier: true  },
	{ label: "User management",          admin: true,  cashier: false },
	{ label: "Role management",          admin: true,  cashier: false },
];

function Check({ yes }: { yes: boolean }) {
	return yes
		? <span className="text-emerald-600 font-medium">✓</span>
		: <span className="text-zinc-300">—</span>;
}

export default function RolesPage() {
	const router = useRouter();

	useEffect(() => {
		fetch("/api/me", { credentials: "include" })
			.then((r) => r.ok ? r.json() : null)
			.then((data) => { if (data?.role !== "admin") router.replace("/dashboard"); })
			.catch(() => {});
	}, [router]);

	return (
		<div>
			<h1 className="text-zinc-900 text-2xl font-bold mb-6">Roles</h1>

			<div className="bg-white rounded-xl shadow-sm overflow-hidden">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-zinc-100">
							<th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400">Permission</th>
							<th className="text-center px-6 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400">
								<span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">ADMIN</span>
							</th>
							<th className="text-center px-6 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400">
								<span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">CASHIER</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{PERMISSIONS.map(({ label, admin, cashier }) => (
							<tr key={label} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
								<td className="px-4 py-3 text-zinc-900">{label}</td>
								<td className="px-6 py-3 text-center"><Check yes={admin} /></td>
								<td className="px-6 py-3 text-center"><Check yes={cashier} /></td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p className="mt-4 text-zinc-400 text-xs">
				Role enforcement is applied at the API layer. Cashiers who navigate directly to restricted pages will receive a 403.
			</p>
		</div>
	);
}
