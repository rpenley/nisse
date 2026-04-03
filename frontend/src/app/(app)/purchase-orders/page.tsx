"use client";

import React, { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PoStatus = "draft" | "ordered" | "received";

interface Distributor {
	id: string;
	name: string;
	contact_info: string | null;
}

interface PurchaseOrder {
	id: string;
	distributor_id: string;
	status: PoStatus;
	total_cost: string;
	created_at: string;
}

interface PoItem {
	id: string;
	po_id: string;
	product_id: string;
	ordered_quantity: number;
	received_quantity: number;
	unit_cost: string;
}

// ── Status display ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PoStatus, string> = {
	draft: "bg-zinc-100 text-zinc-600",
	ordered: "bg-amber-50 text-amber-700",
	received: "bg-emerald-50 text-emerald-700",
};

const NEXT_STATUS: Partial<Record<PoStatus, PoStatus>> = {
	draft: "ordered",
	ordered: "received",
};

const NEXT_LABEL: Partial<Record<PoStatus, string>> = {
	draft: "Mark Ordered",
	ordered: "Mark Received",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
	const [pos, setPos] = useState<PurchaseOrder[]>([]);
	const [distributors, setDistributors] = useState<Distributor[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [items, setItems] = useState<Record<string, PoItem[]>>({});

	const [createOpen, setCreateOpen] = useState(false);
	const [selectedDistributor, setSelectedDistributor] = useState("");
	const [creating, setCreating] = useState(false);

	const [advancing, setAdvancing] = useState<string | null>(null);

	// ── Fetch ─────────────────────────────────────────────────────────────────

	async function fetchPos() {
		try {
			const [posRes, distRes] = await Promise.all([
				fetch("/api/purchase_orders", { credentials: "include" }),
				fetch("/api/distributors", { credentials: "include" }),
			]);
			if (!posRes.ok || !distRes.ok) throw new Error();
			const [posData, distData] = await Promise.all([
				posRes.json(),
				distRes.json(),
			]);
			setPos(posData);
			setDistributors(distData);
		} catch {
			setError("Could not load purchase orders");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		fetchPos();
	}, []);

	async function fetchItems(poId: string) {
		if (items[poId]) {
			setExpandedId(expandedId === poId ? null : poId);
			return;
		}
		try {
			const res = await fetch(`/api/purchase_orders/${poId}/items`, {
				credentials: "include",
			});
			if (!res.ok) throw new Error();
			const data = await res.json();
			setItems((prev) => ({ ...prev, [poId]: data.items }));
			setExpandedId(poId);
		} catch {
			// Silently ignore — row stays collapsed.
		}
	}

	// ── Create PO ─────────────────────────────────────────────────────────────

	async function handleCreate() {
		if (!selectedDistributor) return;
		setCreating(true);
		try {
			const res = await fetch("/api/purchase_orders", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ distributor_id: selectedDistributor }),
			});
			if (!res.ok) throw new Error();
			setCreateOpen(false);
			setSelectedDistributor("");
			fetchPos();
		} catch {
			// Silently fail — keep modal open.
		} finally {
			setCreating(false);
		}
	}

	// ── Advance status ────────────────────────────────────────────────────────

	async function handleAdvance(po: PurchaseOrder) {
		const next = NEXT_STATUS[po.status];
		if (!next) return;
		setAdvancing(po.id);
		try {
			const res = await fetch(`/api/purchase_orders/${po.id}/status`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ status: next }),
			});
			if (!res.ok) throw new Error();
			// Clear cached items so they refresh on next expand.
			setItems((prev) => {
				const updated = { ...prev };
				delete updated[po.id];
				return updated;
			});
			fetchPos();
		} catch {
			// Silently fail.
		} finally {
			setAdvancing(null);
		}
	}

	// ── Render ────────────────────────────────────────────────────────────────

	const distributorName = (id: string) =>
		distributors.find((d) => d.id === id)?.name ?? id.slice(0, 8) + "…";

	if (loading) {
		return <p className="text-zinc-400 text-sm animate-pulse">Loading…</p>;
	}

	if (error) {
		return <p className="text-rose-600 text-sm">{error}</p>;
	}

	return (
		<div>
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-zinc-900 text-2xl font-bold">
					Purchase Orders
				</h1>
				<button
					onClick={() => setCreateOpen(true)}
					className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200"
				>
					+ New PO
				</button>
			</div>

			{/* Table */}
			{pos.length === 0 ? (
				<p className="text-zinc-400 text-sm">No purchase orders yet.</p>
			) : (
				<div className="bg-white rounded-xl shadow-sm overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-zinc-100">
								<Th>Date</Th>
								<Th>Distributor</Th>
								<Th>Status</Th>
								<Th>Total Cost</Th>
								<Th>Actions</Th>
							</tr>
						</thead>
						<tbody>
							{pos.map((po) => (
								<React.Fragment key={po.id}>
									<tr
										className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer"
										onClick={() => fetchItems(po.id)}
									>
										<Td dim>
											{new Date(po.created_at).toLocaleDateString()}
										</Td>
										<Td>{distributorName(po.distributor_id)}</Td>
										<Td>
											<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[po.status]}`}>
												{po.status.toUpperCase()}
											</span>
										</Td>
										<Td>
											<span className="font-mono tabular-nums">
												${parseFloat(po.total_cost).toFixed(2)}
											</span>
										</Td>
										<Td>
											<div
												className="flex gap-3"
												onClick={(e) => e.stopPropagation()}
											>
												{NEXT_STATUS[po.status] && (
													<button
														onClick={() => handleAdvance(po)}
														disabled={advancing === po.id}
														className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors disabled:opacity-40"
													>
														{advancing === po.id ? "…" : NEXT_LABEL[po.status]}
													</button>
												)}
												<button
													onClick={() => fetchItems(po.id)}
													className="text-zinc-400 hover:text-zinc-700 text-xs transition-colors"
												>
													{expandedId === po.id ? "▲ Hide" : "▼ Items"}
												</button>
											</div>
										</Td>
									</tr>
									{expandedId === po.id && items[po.id] && (
										<tr
											key={`${po.id}-items`}
											className="border-b border-zinc-100 bg-zinc-50"
										>
											<td colSpan={5} className="px-6 py-4">
												{items[po.id].length === 0 ? (
													<p className="text-zinc-400 text-xs">
														No items on this PO.
													</p>
												) : (
													<table className="w-full text-xs">
														<thead>
															<tr className="text-zinc-400">
																<th className="text-left pb-2 font-medium">Product ID</th>
																<th className="text-right pb-2 font-medium">Qty Ordered</th>
																<th className="text-right pb-2 font-medium">Qty Received</th>
																<th className="text-right pb-2 font-medium">Unit Cost</th>
															</tr>
														</thead>
														<tbody>
															{items[po.id].map((item) => (
																<tr
																	key={item.id}
																	className="border-t border-zinc-100"
																>
																	<td className="py-1.5 text-zinc-500 font-mono">
																		{item.product_id.slice(0, 8)}…
																	</td>
																	<td className="py-1.5 text-right text-zinc-900 font-mono tabular-nums">
																		{item.ordered_quantity}
																	</td>
																	<td className="py-1.5 text-right text-emerald-600 font-mono tabular-nums">
																		{item.received_quantity}
																	</td>
																	<td className="py-1.5 text-right text-zinc-900 font-mono tabular-nums">
																		${parseFloat(item.unit_cost).toFixed(2)}
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												)}
											</td>
										</tr>
									)}
								</React.Fragment>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Create PO modal */}
			{createOpen && (
				<div
					className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
					onClick={(e) => {
						if (e.target === e.currentTarget) setCreateOpen(false);
					}}
				>
					<div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
							<h2 className="text-zinc-900 font-semibold">
								New Purchase Order
							</h2>
							<button
								onClick={() => setCreateOpen(false)}
								className="text-zinc-400 hover:text-zinc-600 transition-colors"
							>
								✕
							</button>
						</div>
						<div className="px-5 py-4 space-y-4">
							<div>
								<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
									Distributor
								</label>
								<select
									value={selectedDistributor}
									onChange={(e) => setSelectedDistributor(e.target.value)}
									className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
								>
									<option value="">Select a distributor…</option>
									{distributors.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</div>
							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={() => setCreateOpen(false)}
									className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={handleCreate}
									disabled={!selectedDistributor || creating}
									className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
								>
									{creating ? "Creating…" : "Create PO"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function Th({ children }: { children?: React.ReactNode }) {
	return (
		<th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400">
			{children}
		</th>
	);
}

function Td({
	children,
	dim,
}: {
	children?: React.ReactNode;
	dim?: boolean;
}) {
	return (
		<td className={`px-4 py-3 ${dim ? "text-zinc-400" : "text-zinc-900"}`}>
			{children}
		</td>
	);
}
