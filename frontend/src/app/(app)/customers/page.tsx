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
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-[#fabd2f] font-mono text-2xl font-bold">
						Customers
					</h1>
					<button
						onClick={() => {
							setForm({ name: "", email: "" });
							setFormError(null);
							setModalOpen(true);
						}}
						className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors"
					>
						+ New Customer
					</button>
				</div>

				{/* Search */}
				<div className="mb-4">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search by name or email…"
						className="w-full max-w-sm bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors placeholder:text-[#665c54]"
					/>
				</div>

				{/* Table */}
				{loading ? (
					<p className="text-[#928374] font-mono text-sm">
						Loading…
					</p>
				) : error ? (
					<p className="text-[#fb4934] font-mono text-sm">{error}</p>
				) : customers.length === 0 ? (
					<p className="text-[#928374] font-mono text-sm">
						No customers found.
					</p>
				) : (
					<div className="border border-[#3c3836] overflow-x-auto">
						<table className="w-full font-mono text-sm">
							<thead>
								<tr className="border-b border-[#3c3836] text-[#a89984]">
									{["Name", "Email", "Balance", ""].map(
										(h) => (
											<th
												key={h}
												className="text-left px-4 py-2 font-normal text-xs uppercase tracking-wider"
											>
												{h}
											</th>
										),
									)}
								</tr>
							</thead>
							<tbody>
								{customers.map((customer) => (
									<tr
										key={customer.id}
										className="border-b border-[#3c3836] hover:bg-[#3c3836] transition-colors cursor-pointer"
										onClick={() => openDetail(customer)}
									>
										<td className="px-4 py-3 text-[#ebdbb2]">
											{customer.name}
										</td>
										<td className="px-4 py-3 text-[#928374]">
											{customer.email}
										</td>
										<td className="px-4 py-3">
											<span
												className={
													parseFloat(
														customer.store_credit_balance,
													) > 0
														? "text-[#b8bb26]"
														: "text-[#928374]"
												}
											>
												$
												{parseFloat(
													customer.store_credit_balance,
												).toFixed(2)}
											</span>
										</td>
										<td className="px-4 py-3 text-[#83a598] text-right">
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
				<div className="w-80 border border-[#3c3836] bg-[#1d2021] flex flex-col shrink-0">
					<div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3836]">
						<h2 className="text-[#fabd2f] font-mono font-bold text-sm">
							{selected?.customer.name ?? "Loading…"}
						</h2>
						<button
							onClick={() => setSelected(null)}
							className="text-[#928374] hover:text-[#ebdbb2] font-mono text-xs"
						>
							✕
						</button>
					</div>

					{detailLoading ? (
						<p className="text-[#928374] font-mono text-sm px-4 py-4">
							Loading…
						</p>
					) : selected ? (
						<div className="flex-1 overflow-y-auto">
							{/* Balance */}
							<div className="px-4 py-3 border-b border-[#3c3836]">
								<p className="text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Store Credit
								</p>
								<p className="text-[#b8bb26] font-mono text-2xl font-bold">
									$
									{parseFloat(
										selected.customer
											.store_credit_balance,
									).toFixed(2)}
								</p>
								<p className="text-[#928374] font-mono text-xs mt-1">
									{selected.customer.email}
								</p>
							</div>

							{/* Ledger */}
							<div className="px-4 py-3">
								<p className="text-[#a89984] font-mono text-xs uppercase tracking-wider mb-3">
									Recent Activity
								</p>
								{selected.ledger.length === 0 ? (
									<p className="text-[#665c54] font-mono text-xs">
										No transactions yet.
									</p>
								) : (
									<ul className="space-y-2">
										{selected.ledger.map((entry) => {
											const amount = parseFloat(
												entry.amount_changed,
											);
											const isPositive = amount >= 0;
											return (
												<li
													key={entry.id}
													className="flex justify-between items-start"
												>
													<div>
														<p className="text-[#ebdbb2] font-mono text-xs capitalize">
															{entry.action_type.replace(
																"_",
																" ",
															)}
														</p>
														<p className="text-[#665c54] font-mono text-xs">
															{new Date(
																entry.created_at,
															).toLocaleDateString()}
														</p>
													</div>
													<span
														className={`font-mono text-sm font-bold ${
															isPositive
																? "text-[#b8bb26]"
																: "text-[#fb4934]"
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
					className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
					onClick={(e) => {
						if (e.target === e.currentTarget) setModalOpen(false);
					}}
				>
					<div className="bg-[#282828] border border-[#3c3836] w-full max-w-sm">
						<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
							<h2 className="text-[#fabd2f] font-mono font-bold">
								New Customer
							</h2>
							<button
								onClick={() => setModalOpen(false)}
								className="text-[#928374] hover:text-[#ebdbb2] font-mono"
							>
								✕
							</button>
						</div>
						<div className="px-5 py-4 space-y-4">
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Name
								</label>
								<input
									type="text"
									value={form.name}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											name: e.target.value,
										}))
									}
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors"
								/>
							</div>
							<div>
								<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
									Email
								</label>
								<input
									type="email"
									value={form.email}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											email: e.target.value,
										}))
									}
									className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors"
								/>
							</div>
							{formError && (
								<p className="text-[#fb4934] font-mono text-xs">
									{formError}
								</p>
							)}
							<div className="flex justify-end gap-3 pt-1">
								<button
									onClick={() => setModalOpen(false)}
									className="font-mono text-sm text-[#928374] hover:text-[#ebdbb2]"
								>
									Cancel
								</button>
								<button
									onClick={handleCreate}
									disabled={
										saving ||
										!form.name.trim() ||
										!form.email.trim()
									}
									className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
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
