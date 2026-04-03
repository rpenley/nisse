"use client";

import { useEffect, useState } from "react";

interface Customer {
	id: string;
	name: string;
	email: string;
	store_credit_balance: string;
}

interface LedgerEntry {
	id: string;
	amount_changed: string;
	action_type: string;
	sale_id: string | null;
	created_at: string;
}

export default function CustomersPage() {
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	// Add modal
	const [modalOpen, setModalOpen] = useState(false);
	const [form, setForm] = useState({ name: "", email: "" });
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	// Detail panel
	const [selected, setSelected] = useState<{
		customer: Customer;
		ledger: LedgerEntry[];
	} | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);

	// ── Fetch customers (with debounced search) ───────────────────────────────

	useEffect(() => {
		const timer = setTimeout(() => {
			setLoading(true);
			const url = search.trim()
				? `/api/customers?q=${encodeURIComponent(search.trim())}`
				: "/api/customers";
			fetch(url, { credentials: "include" })
				.then((r) => {
					if (!r.ok) throw new Error();
					return r.json();
				})
				.then((data) => {
					setCustomers(data);
					setError(null);
				})
				.catch(() => setError("Could not load customers"))
				.finally(() => setLoading(false));
		}, 250);
		return () => clearTimeout(timer);
	}, [search]);

	// ── Create customer ───────────────────────────────────────────────────────

	async function handleCreate() {
		setSaving(true);
		setFormError(null);
		try {
			const response = await fetch("/api/customers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(form),
			});
			const data = await response.json();
			if (response.ok) {
				setModalOpen(false);
				setForm({ name: "", email: "" });
				setCustomers((prev) => [...prev, data]);
			} else {
				setFormError(data.error ?? "Failed to create customer");
			}
		} catch {
			setFormError("Could not reach server");
		} finally {
			setSaving(false);
		}
	}

	// ── Load customer detail ──────────────────────────────────────────────────

	async function openDetail(customer: Customer) {
		setDetailLoading(true);
		setSelected(null);
		try {
			const response = await fetch(`/api/customers/${customer.id}`, {
				credentials: "include",
			});
			const data = await response.json();
			setSelected(data);
		} catch {
			// Silently ignore.
		} finally {
			setDetailLoading(false);
		}
	}

	return (
		<div className="flex gap-6 h-full">
			{/* ── Customer list ──────────────────────────────────────────── */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center justify-between mb-6">
					<h1 className="text-zinc-900 text-2xl font-bold">
						Customers
					</h1>
					<button
						onClick={() => {
							setForm({ name: "", email: "" });
							setFormError(null);
							setModalOpen(true);
						}}
						className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200"
					>
						+ New Customer
					</button>
				</div>

				{/* Search */}
				<div className="mb-5">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search by name or email…"
						className="w-full max-w-sm bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors placeholder:text-zinc-400"
					/>
				</div>

				{/* Table */}
				{loading ? (
					<p className="text-zinc-400 text-sm animate-pulse">Loading…</p>
				) : error ? (
					<p className="text-rose-600 text-sm">{error}</p>
				) : customers.length === 0 ? (
					<p className="text-zinc-400 text-sm">No customers found.</p>
				) : (
					<div className="bg-white rounded-xl shadow-sm overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-zinc-100">
									{["Name", "Email", "Balance", ""].map((h) => (
										<th
											key={h}
											className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wider text-zinc-400"
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{customers.map((customer) => (
									<tr
										key={customer.id}
										className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors cursor-pointer"
										onClick={() => openDetail(customer)}
									>
										<td className="px-4 py-3 text-zinc-900 font-medium">
											{customer.name}
										</td>
										<td className="px-4 py-3 text-zinc-500">
											{customer.email}
										</td>
										<td className="px-4 py-3">
											<span
												className={`font-mono tabular-nums text-sm ${
													parseFloat(customer.store_credit_balance) > 0
														? "text-emerald-600"
														: "text-zinc-400"
												}`}
											>
												${parseFloat(customer.store_credit_balance).toFixed(2)}
											</span>
										</td>
										<td className="px-4 py-3 text-blue-600 text-right text-xs font-medium">
											View →
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* ── Detail panel ────────────────────────────────────────────── */}
			{(selected || detailLoading) && (
				<div className="w-80 bg-white rounded-xl shadow-sm border border-zinc-100 flex flex-col shrink-0">
					<div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
						<h2 className="text-zinc-900 font-semibold text-sm">
							{selected?.customer.name ?? "Loading…"}
						</h2>
						<button
							onClick={() => setSelected(null)}
							className="text-zinc-400 hover:text-zinc-600 text-xs transition-colors"
						>
							✕
						</button>
					</div>

					{detailLoading ? (
						<p className="text-zinc-400 text-sm px-4 py-4 animate-pulse">Loading…</p>
					) : selected ? (
						<div className="flex-1 overflow-y-auto">
							{/* Balance */}
							<div className="px-4 py-4 border-b border-zinc-100">
								<p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">
									Store Credit
								</p>
								<p className="font-mono text-2xl font-bold text-emerald-600 tabular-nums">
									${parseFloat(selected.customer.store_credit_balance).toFixed(2)}
								</p>
								<p className="text-zinc-400 text-xs mt-1">
									{selected.customer.email}
								</p>
							</div>

							{/* Ledger */}
							<div className="px-4 py-4">
								<p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-3">
									Recent Activity
								</p>
								{selected.ledger.length === 0 ? (
									<p className="text-zinc-400 text-xs">
										No transactions yet.
									</p>
								) : (
									<ul className="space-y-2">
										{selected.ledger.map((entry) => {
											const amount = parseFloat(entry.amount_changed);
											const isPositive = amount >= 0;
											return (
												<li
													key={entry.id}
													className="flex justify-between items-start"
												>
													<div>
														<p className="text-zinc-800 text-xs capitalize">
															{entry.action_type.replace("_", " ")}
														</p>
														<p className="text-zinc-400 text-xs">
															{new Date(entry.created_at).toLocaleDateString()}
														</p>
													</div>
													<span
														className={`font-mono text-sm font-bold tabular-nums ${
															isPositive ? "text-emerald-600" : "text-rose-600"
														}`}
													>
														{isPositive ? "+" : ""}
														{amount.toFixed(2)}
													</span>
												</li>
											);
										})}
									</ul>
								)}
							</div>
						</div>
					) : null}
				</div>
			)}

			{/* ── Add Customer modal ───────────────────────────────────────── */}
			{modalOpen && (
				<div
					className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
					onClick={(e) => {
						if (e.target === e.currentTarget) setModalOpen(false);
					}}
				>
					<div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
							<h2 className="text-zinc-900 font-semibold">
								New Customer
							</h2>
							<button
								onClick={() => setModalOpen(false)}
								className="text-zinc-400 hover:text-zinc-600 transition-colors"
							>
								✕
							</button>
						</div>
						<div className="px-5 py-4 space-y-4">
							<div>
								<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
									Name
								</label>
								<input
									type="text"
									value={form.name}
									onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
									className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
								/>
							</div>
							<div>
								<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
									Email
								</label>
								<input
									type="email"
									value={form.email}
									onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
									className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
								/>
							</div>
							{formError && (
								<p className="text-rose-600 text-xs">{formError}</p>
							)}
							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={() => setModalOpen(false)}
									className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
								>
									Cancel
								</button>
								<button
									onClick={handleCreate}
									disabled={saving || !form.name.trim() || !form.email.trim()}
									className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
								>
									{saving ? "Saving…" : "Create"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
