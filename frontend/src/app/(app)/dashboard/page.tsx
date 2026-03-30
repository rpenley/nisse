"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LowStockProduct {
	id: string;
	sku: string;
	name: string;
	stock_quantity: number;
}

interface UpcomingEvent {
	id: string;
	title: string;
	start_time: string;
	registration_count: number;
}

interface ActivityEntry {
	type: "sale" | "stock_movement";
	description: string;
	amount: string | null;
	created_at: string;
}

interface DashboardMetrics {
	today_revenue: string;
	credit_liability: string;
	low_stock_count: number;
	low_stock: LowStockProduct[];
	total_customers: number;
	upcoming_events: UpcomingEvent[];
	recent_activity: ActivityEntry[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
	const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/dashboard/metrics", { credentials: "include" })
			.then((r) => {
				if (!r.ok) throw new Error("Failed to load metrics");
				return r.json();
			})
			.then((data: DashboardMetrics) => setMetrics(data))
			.catch(() => setError("Could not load dashboard metrics"))
			.finally(() => setLoading(false));
	}, []);

	if (loading) {
		return <p className="text-[#928374] font-mono text-sm">Loading…</p>;
	}

	if (error || !metrics) {
		return (
			<p className="text-[#fb4934] font-mono text-sm">
				{error ?? "Unknown error"}
			</p>
		);
	}

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
				<KpiCard
					label="Today's Revenue"
					value={`$${parseFloat(metrics.today_revenue).toFixed(2)}`}
					color="yellow"
				/>
				<KpiCard
					label="Credit Liability"
					value={`$${parseFloat(metrics.credit_liability).toFixed(2)}`}
					color="blue"
				/>
				<KpiCard
					label="Total Customers"
					value={String(metrics.total_customers)}
					color="green"
				/>
				<KpiCard
					label="Low Stock Items"
					value={String(metrics.low_stock_count)}
					color={metrics.low_stock_count > 0 ? "red" : "green"}
				/>
			</div>

			{/* Middle row: activity feed + action items */}
			<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
				{/* Recent activity — 2/3 width */}
				<div className="xl:col-span-2 bg-[#282828] border border-[#3c3836] p-4">
					<h2 className="text-[#fabd2f] font-mono font-bold text-sm mb-4 uppercase tracking-wider">
						Recent Activity
					</h2>
					{metrics.recent_activity.length === 0 ? (
						<p className="text-[#665c54] font-mono text-sm">
							No activity yet.
						</p>
					) : (
						<ul className="space-y-2">
							{metrics.recent_activity.map((entry, index) => (
								<ActivityRow key={index} entry={entry} />
							))}
						</ul>
					)}
				</div>

				{/* Action items — 1/3 width */}
				<div className="space-y-4">
					{/* Low stock alerts */}
					<div className="bg-[#282828] border border-[#3c3836] p-4">
						<h2 className="text-[#fb4934] font-mono font-bold text-sm mb-3 uppercase tracking-wider">
							Low Stock
						</h2>
						{metrics.low_stock.length === 0 ? (
							<p className="text-[#665c54] font-mono text-xs">
								All stock levels OK.
							</p>
						) : (
							<ul className="space-y-2">
								{metrics.low_stock.map((product) => (
									<li
										key={product.id}
										className="flex justify-between items-baseline"
									>
										<span className="text-[#ebdbb2] font-mono text-xs truncate mr-2">
											{product.name}
										</span>
										<span
											className={`font-mono text-xs shrink-0 ${
												product.stock_quantity === 0
													? "text-[#fb4934]"
													: "text-[#fe8019]"
											}`}
										>
											×{product.stock_quantity}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>

					{/* Upcoming events */}
					<div className="bg-[#282828] border border-[#3c3836] p-4">
						<h2 className="text-[#83a598] font-mono font-bold text-sm mb-3 uppercase tracking-wider">
							Upcoming Events
						</h2>
						{metrics.upcoming_events.length === 0 ? (
							<p className="text-[#665c54] font-mono text-xs">
								No upcoming events.
							</p>
						) : (
							<ul className="space-y-3">
								{metrics.upcoming_events.map((event) => (
									<li key={event.id}>
										<p className="text-[#ebdbb2] font-mono text-xs leading-tight">
											{event.title}
										</p>
										<div className="flex justify-between mt-1">
											<span className="text-[#665c54] font-mono text-xs">
												{new Date(
													event.start_time,
												).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
													hour: "numeric",
													minute: "2-digit",
												})}
											</span>
											<span className="text-[#928374] font-mono text-xs">
												{event.registration_count} reg.
											</span>
										</div>
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ── Sub-components ────────────────────────────────────────────────────────────

type KpiColor = "yellow" | "blue" | "green" | "red";

const COLOR_MAP: Record<KpiColor, string> = {
	yellow: "text-[#fabd2f]",
	blue: "text-[#83a598]",
	green: "text-[#b8bb26]",
	red: "text-[#fb4934]",
};

function KpiCard({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color: KpiColor;
}) {
	return (
		<div className="bg-[#282828] border border-[#3c3836] p-4">
			<p className="text-[#928374] font-mono text-xs uppercase tracking-wider mb-2">
				{label}
			</p>
			<p className={`font-mono text-2xl font-bold ${COLOR_MAP[color]}`}>
				{value}
			</p>
		</div>
	);
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
	const isSale = entry.type === "sale";
	return (
		<li className="flex items-start justify-between gap-3 py-1 border-b border-[#3c3836] last:border-0">
			<div className="flex items-start gap-2 min-w-0">
				<span
					className={`shrink-0 font-mono text-xs px-1.5 py-0.5 border mt-0.5 ${
						isSale
							? "border-[#b8bb26] text-[#b8bb26]"
							: "border-[#83a598] text-[#83a598]"
					}`}
				>
					{isSale ? "SALE" : "INV"}
				</span>
				<span className="text-[#ebdbb2] font-mono text-xs leading-relaxed truncate">
					{entry.description}
				</span>
			</div>
			<div className="text-right shrink-0">
				{entry.amount !== null && (
					<p className="text-[#fabd2f] font-mono text-xs font-bold">
						${parseFloat(entry.amount).toFixed(2)}
					</p>
				)}
				<p className="text-[#665c54] font-mono text-xs">
					{new Date(entry.created_at).toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
					})}
				</p>
			</div>
		</li>
	);
}
