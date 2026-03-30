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
		? <span className="text-[#b8bb26] font-mono">✓</span>
		: <span className="text-[#504945] font-mono">—</span>;
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
			<h1 className="text-[#fabd2f] font-mono text-2xl font-bold mb-6">Roles</h1>

			<div className="border border-[#3c3836] overflow-x-auto">
				<table className="w-full font-mono text-sm">
					<thead>
						<tr className="border-b border-[#3c3836] text-[#a89984]">
							<th className="text-left px-4 py-2 font-normal text-xs uppercase tracking-wider">Permission</th>
							<th className="text-center px-6 py-2 font-normal text-xs uppercase tracking-wider">
								<span className="border border-[#fabd2f] text-[#fabd2f] px-1.5 py-0.5 text-xs">ADMIN</span>
							</th>
							<th className="text-center px-6 py-2 font-normal text-xs uppercase tracking-wider">
								<span className="border border-[#83a598] text-[#83a598] px-1.5 py-0.5 text-xs">CASHIER</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{PERMISSIONS.map(({ label, admin, cashier }) => (
							<tr key={label} className="border-b border-[#3c3836] hover:bg-[#3c3836] transition-colors">
								<td className="px-4 py-3 text-[#ebdbb2]">{label}</td>
								<td className="px-6 py-3 text-center"><Check yes={admin} /></td>
								<td className="px-6 py-3 text-center"><Check yes={cashier} /></td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p className="mt-4 text-[#665c54] font-mono text-xs">
				Role enforcement is applied at the API layer. Cashiers who navigate directly to restricted pages will receive a 403.
			</p>
		</div>
	);
}
