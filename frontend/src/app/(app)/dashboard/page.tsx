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
		return <p className="text-zinc-400 text-sm animate-pulse">Loading…</p>;
	}

	if (error || !metrics) {
		return (
			<p className="text-rose-600 text-sm">
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
					color="blue"
				/>
				<KpiCard
					label="Credit Liability"
					value={`$${parseFloat(metrics.credit_liability).toFixed(2)}`}
					color="amber"
				/>
				<KpiCard
					label="Total Customers"
					value={String(metrics.total_customers)}
					color="emerald"
				/>
				<KpiCard
					label="Low Stock Items"
					value={String(metrics.low_stock_count)}
					color={metrics.low_stock_count > 0 ? "rose" : "emerald"}
				/>
			</div>

			{/* Middle row: activity feed + action items */}
			<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
				{/* Recent activity — 2/3 width */}
				<div className="xl:col-span-2 bg-white rounded-xl shadow-sm p-5">
					<h2 className="text-zinc-900 font-semibold text-sm mb-4">
						Recent Activity
					</h2>
					{metrics.recent_activity.length === 0 ? (
						<p className="text-zinc-400 text-sm">
							No activity yet.
						</p>
					) : (
						<ul className="space-y-1">
							{metrics.recent_activity.map((entry, index) => (
								<ActivityRow key={index} entry={entry} />
							))}
						</ul>
					)}
				</div>

				{/* Action items — 1/3 width */}
				<div className="space-y-4">
					{/* Low stock alerts */}
					<div className="bg-white rounded-xl shadow-sm p-5">
						<h2 className="text-zinc-900 font-semibold text-sm mb-3">
							Low Stock
						</h2>
						{metrics.low_stock.length === 0 ? (
							<p className="text-zinc-400 text-xs">
								All stock levels OK.
							</p>
						) : (
							<ul className="space-y-2">
								{metrics.low_stock.map((product) => (
									<li
										key={product.id}
										className="flex justify-between items-baseline"
									>
										<span className="text-zinc-700 text-xs truncate mr-2">
											{product.name}
										</span>
										<span
											className={`font-mono text-xs shrink-0 tabular-nums ${
												product.stock_quantity === 0
													? "text-rose-600"
													: "text-amber-500"
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
					<div className="bg-white rounded-xl shadow-sm p-5">
						<h2 className="text-zinc-900 font-semibold text-sm mb-3">
							Upcoming Events
						</h2>
						{metrics.upcoming_events.length === 0 ? (
							<p className="text-zinc-400 text-xs">
								No upcoming events.
							</p>
						) : (
							<ul className="space-y-3">
								{metrics.upcoming_events.map((event) => (
									<li key={event.id}>
										<p className="text-zinc-800 text-xs font-medium leading-tight">
											{event.title}
										</p>
										<div className="flex justify-between mt-1">
											<span className="text-zinc-400 text-xs">
												{new Date(
													event.start_time,
												).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
													hour: "numeric",
													minute: "2-digit",
												})}
											</span>
											<span className="text-zinc-400 text-xs">
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

type KpiColor = "blue" | "amber" | "emerald" | "rose";

const VALUE_COLOR_MAP: Record<KpiColor, string> = {
	blue: "text-blue-600",
	amber: "text-amber-500",
	emerald: "text-emerald-600",
	rose: "text-rose-600",
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
		<div className="bg-white rounded-xl shadow-sm p-5">
			<p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-2">
				{label}
			</p>
			<p className={`font-mono text-2xl font-bold tabular-nums ${VALUE_COLOR_MAP[color]}`}>
				{value}
			</p>
		</div>
	);
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
	const isSale = entry.type === "sale";
	return (
		<li className="flex items-start justify-between gap-3 py-2 border-b border-zinc-100 last:border-0">
			<div className="flex items-start gap-2 min-w-0">
				<span
					className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium mt-0.5 ${
						isSale
							? "bg-emerald-50 text-emerald-700"
							: "bg-blue-50 text-blue-700"
					}`}
				>
					{isSale ? "SALE" : "INV"}
				</span>
				<span className="text-zinc-700 text-xs leading-relaxed truncate">
					{entry.description}
				</span>
			</div>
			<div className="text-right shrink-0">
				{entry.amount !== null && (
					<p className="font-mono text-xs font-bold text-zinc-900 tabular-nums">
						${parseFloat(entry.amount).toFixed(2)}
					</p>
				)}
				<p className="text-zinc-400 text-xs">
					{new Date(entry.created_at).toLocaleTimeString("en-US", {
						hour: "numeric",
						minute: "2-digit",
					})}
				</p>
			</div>
		</li>
	);
}
