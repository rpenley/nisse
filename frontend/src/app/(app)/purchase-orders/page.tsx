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

const STATUS_STYLES: Record<PoStatus, string> = {
	draft: "border-[#928374] text-[#928374]",
	ordered: "border-[#fabd2f] text-[#fabd2f]",
	received: "border-[#b8bb26] text-[#b8bb26]",
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
				const next = { ...prev };
				delete next[po.id];
				return next;
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
		return <p className="text-[#928374] font-mono text-sm">Loading…</p>;
	}

	if (error) {
		return <p className="text-[#fb4934] font-mono text-sm">{error}</p>;
	}

	return (
		<div>
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-[#fabd2f] font-mono text-2xl font-bold">
					Purchase Orders
				</h1>
				<button
					onClick={() => setCreateOpen(true)}
					className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors"
				>
					+ New PO
				</button>
			</div>

			{/* Table */}
			{pos.length === 0 ? (
				<p className="text-[#928374] font-mono text-sm">
					No purchase orders yet.
				</p>
			) : (
				<div className="border border-[#3c3836] overflow-x-auto">
					<table className="w-full font-mono text-sm">
						<thead>
							<tr className="border-b border-[#3c3836] text-[#a89984]">
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
										className="border-b border-[#3c3836] hover:bg-[#3c3836] transition-colors cursor-pointer"
										onClick={() => fetchItems(po.id)}
									>
										<Td dim>
											{new Date(
												po.created_at,
											).toLocaleDateString()}
										</Td>
										<Td>
											{distributorName(po.distributor_id)}
										</Td>
										<Td>
											<span
												className={`font-mono text-xs px-1.5 py-0.5 border ${STATUS_STYLES[po.status]}`}
											>
												{po.status.toUpperCase()}
											</span>
										</Td>
										<Td>
											${parseFloat(po.total_cost).toFixed(2)}
										</Td>
										<Td>
											<div
												className="flex gap-3"
												onClick={(e) =>
													e.stopPropagation()
												}
											>
												{NEXT_STATUS[po.status] && (
													<button
														onClick={() =>
															handleAdvance(po)
														}
														disabled={
															advancing === po.id
														}
														className="text-[#83a598] hover:text-[#ebdbb2] transition-colors disabled:opacity-40"
													>
														{advancing === po.id
															? "…"
															: NEXT_LABEL[
																	po.status
																]}
													</button>
												)}
												<button
													onClick={() =>
														fetchItems(po.id)
													}
													className="text-[#928374] hover:text-[#ebdbb2] transition-colors"
												>
													{expandedId === po.id
														? "▲ Hide"
														: "▼ Items"}
												</button>
											</div>
										</Td>
									</tr>
									{expandedId === po.id &&
										items[po.id] && (
											<tr
												key={`${po.id}-items`}
												className="border-b border-[#3c3836] bg-[#1d2021]"
											>
												<td colSpan={5} className="px-6 py-3">
													{items[po.id].length ===
													0 ? (
														<p className="text-[#665c54] font-mono text-xs">
															No items on this
															PO.
														</p>
													) : (
														<table className="w-full font-mono text-xs">
															<thead>
																<tr className="text-[#a89984]">
																	<th className="text-left pb-1">
																		Product
																		ID
																	</th>
																	<th className="text-right pb-1">
																		Qty
																		Ordered
																	</th>
																	<th className="text-right pb-1">
																		Qty
																		Received
																	</th>
																	<th className="text-right pb-1">
																		Unit
																		Cost
																	</th>
																</tr>
															</thead>
															<tbody>
																{items[
																	po.id
																].map(
																	(item) => (
																		<tr
																			key={
																				item.id
																			}
																			className="border-t border-[#3c3836]"
																		>
																			<td className="py-1 text-[#928374]">
																				{item.product_id.slice(
																					0,
																					8,
																				)}
																				…
																			</td>
																			<td className="py-1 text-right text-[#ebdbb2]">
																				{
																					item.ordered_quantity
																				}
																			</td>
																			<td className="py-1 text-right text-[#b8bb26]">
																				{
																					item.received_quantity
																				}
																			</td>
																			<td className="py-1 text-right text-[#ebdbb2]">
																				$
																				{parseFloat(
																					item.unit_cost,
																				).toFixed(
																					2,
																				)}
																			</td>
																		</tr>
																	),
																)}
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
					className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
					onClick={(e) => {
						if (e.target === e.currentTarget)
							setCreateOpen(false);
					}}
				>
					<div className="bg-[#282828] border border-[#3c3836] w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
							<h2 className="text-[#fabd2f] font-mono font-bold">
								New Purchase Order
							</h2>
							<button
								onClick={() => setCreateOpen(false)}
								className="text-[#928374] hover:text-[#ebdbb2] font-mono"
							>
								✕
							</button>
						</div>
						<div className="px-5 py-4 space-y-4">
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Distributor
								</label>
								<select
									value={selectedDistributor}
									onChange={(e) =>
										setSelectedDistributor(e.target.value)
									}
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f]"
								>
									<option value="">
										Select a distributor…
									</option>
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
									className="font-mono text-sm text-[#928374] hover:text-[#ebdbb2]"
								>
									Cancel
								</button>
								<button
									onClick={handleCreate}
									disabled={
										!selectedDistributor || creating
									}
									className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
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
		<th className="text-left px-4 py-2 font-normal text-xs uppercase tracking-wider">
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
		<td className={`px-4 py-3 ${dim ? "text-[#928374]" : "text-[#ebdbb2]"}`}>
			{children}
		</td>
	);
}
