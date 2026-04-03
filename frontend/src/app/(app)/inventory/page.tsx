"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

interface InventoryItem {
	id: string;
	sku: string;
	name: string;
	price: string;
	stock_quantity: number;
	is_tcg_single: boolean;
	tcg_id: string | null;
	game: string | null;
	set_name: string | null;
	condition: CardCondition | null;
	foil: boolean | null;
}

type FilterMode = "all" | "sealed" | "singles";

// ── Add/Edit modal form state ─────────────────────────────────────────────────

interface FormState {
	sku: string;
	name: string;
	price: string;
	stock_quantity: string;
	is_tcg_single: boolean;
	game: string;
	set_name: string;
	condition: CardCondition;
	foil: boolean;
}

const EMPTY_FORM: FormState = {
	sku: "",
	name: "",
	price: "",
	stock_quantity: "0",
	is_tcg_single: false,
	game: "",
	set_name: "",
	condition: "NM",
	foil: false,
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InventoryPage() {
	const [items, setItems] = useState<InventoryItem[]>([]);
	const [filter, setFilter] = useState<FilterMode>("all");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	const [modalOpen, setModalOpen] = useState(false);
	const [editItem, setEditItem] = useState<InventoryItem | null>(null);
	const [form, setForm] = useState<FormState>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	// ── Fetch inventory ───────────────────────────────────────────────────────

	async function fetchInventory(searchQuery: string) {
		setLoading(true);
		setError(null);
		try {
			const query = new URLSearchParams();
			if (filter !== "all") query.set("is_tcg_single", String(filter === "singles"));
			if (searchQuery.trim()) query.set("q", searchQuery.trim());
			const qs = query.toString();
			const response = await fetch(`/api/inventory${qs ? "?" + qs : ""}`, {
				credentials: "include",
			});
			if (!response.ok) throw new Error("Failed to load inventory");
			setItems(await response.json());
		} catch {
			setError("Could not load inventory");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		const timer = setTimeout(() => fetchInventory(search), 250);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filter, search]);

	// ── Modal helpers ─────────────────────────────────────────────────────────

	function openAdd() {
		setEditItem(null);
		setForm(EMPTY_FORM);
		setFormError(null);
		setModalOpen(true);
	}

	function openEdit(item: InventoryItem) {
		setEditItem(item);
		setForm({
			sku: item.sku,
			name: item.name,
			price: item.price,
			stock_quantity: String(item.stock_quantity),
			is_tcg_single: item.is_tcg_single,
			game: item.game ?? "",
			set_name: item.set_name ?? "",
			condition: item.condition ?? "NM",
			foil: item.foil ?? false,
		});
		setFormError(null);
		setModalOpen(true);
	}

	function closeModal() {
		setModalOpen(false);
		setEditItem(null);
	}

	function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
		setForm((previous) => ({ ...previous, [key]: value }));
	}

	// ── Save (create or update) ───────────────────────────────────────────────

	async function handleSave() {
		setSaving(true);
		setFormError(null);

		const body = {
			sku: form.sku,
			name: form.name,
			price: parseFloat(form.price),
			stock_quantity: parseInt(form.stock_quantity, 10),
			is_tcg_single: form.is_tcg_single,
			...(form.is_tcg_single && {
				game: form.game,
				set_name: form.set_name,
				condition: form.condition,
				foil: form.foil,
			}),
		};

		try {
			const url = editItem
				? `/api/inventory/${editItem.id}`
				: "/api/inventory";
			const response = await fetch(url, {
				method: editItem ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const data = await response.json();
				setFormError(data.error ?? "Save failed");
				return;
			}

			closeModal();
			fetchInventory(search);
		} catch {
			setFormError("Could not reach the server");
		} finally {
			setSaving(false);
		}
	}

	// ── Delete ────────────────────────────────────────────────────────────────

	async function handleDelete(item: InventoryItem) {
		if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
		try {
			await fetch(`/api/inventory/${item.id}`, {
				method: "DELETE",
				credentials: "include",
			});
			fetchInventory(search);
		} catch {
			// Silently ignore — table will be stale until refresh.
		}
	}

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div>
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-zinc-900 text-2xl font-bold">
					Inventory
				</h1>
				<button
					onClick={openAdd}
					className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200"
				>
					+ Add Product
				</button>
			</div>

			{/* Search + Filter row */}
			<div className="flex items-center gap-3 mb-4">
				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search by name or SKU…"
					className="flex-1 bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors placeholder:text-zinc-400"
				/>
			</div>
			<div className="flex gap-1.5 mb-5">
				{(["all", "sealed", "singles"] as FilterMode[]).map((mode) => (
					<button
						key={mode}
						onClick={() => setFilter(mode)}
						className={`text-xs px-3 py-1.5 rounded-md border transition-all duration-200 ${
							filter === mode
								? "border-blue-600 bg-blue-50 text-blue-600 font-medium"
								: "border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:border-zinc-300"
						}`}
					>
						{mode === "all"
							? "All"
							: mode === "sealed"
								? "Sealed"
								: "TCG Singles"}
					</button>
				))}
			</div>

			{/* Table */}
			{loading ? (
				<p className="text-zinc-400 text-sm animate-pulse">Loading…</p>
			) : error ? (
				<p className="text-rose-600 text-sm">{error}</p>
			) : items.length === 0 ? (
				<p className="text-zinc-400 text-sm">
					No products found.
				</p>
			) : (
				<div className="bg-white rounded-xl shadow-sm overflow-hidden">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-zinc-100">
								<Th>SKU</Th>
								<Th>Name</Th>
								<Th>Type</Th>
								<Th>Price</Th>
								<Th>Stock</Th>
								<Th>Details</Th>
								<Th></Th>
							</tr>
						</thead>
						<tbody>
							{items.map((item) => (
								<tr
									key={item.id}
									className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors"
								>
									<Td dim>
										<span className="font-mono text-xs tabular-nums">
											{item.sku}
										</span>
									</Td>
									<Td>{item.name}</Td>
									<Td>
										{item.is_tcg_single ? (
											<span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
												Single
											</span>
										) : (
											<span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">
												Sealed
											</span>
										)}
									</Td>
									<Td>
										<span className="font-mono tabular-nums">
											${parseFloat(item.price).toFixed(2)}
										</span>
									</Td>
									<Td>
										<span
											className={`font-mono tabular-nums ${
												item.stock_quantity === 0
													? "text-rose-600"
													: "text-zinc-900"
											}`}
										>
											{item.stock_quantity}
										</span>
									</Td>
									<Td dim>
										{item.is_tcg_single && item.game
											? `${item.game} · ${item.set_name} · ${item.condition}${item.foil ? " · Foil" : ""}`
											: "—"}
									</Td>
									<Td>
										<div className="flex gap-3">
											<button
												onClick={() => openEdit(item)}
												className="text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors"
											>
												Edit
											</button>
											<button
												onClick={() => handleDelete(item)}
												className="text-rose-500 hover:text-rose-700 text-xs font-medium transition-colors"
											>
												Delete
											</button>
										</div>
									</Td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Add / Edit modal */}
			{modalOpen && (
				<Modal
					title={editItem ? "Edit Product" : "Add Product"}
					onClose={closeModal}
				>
					<div className="space-y-4">
						<Field label="SKU">
							<input
								type="text"
								value={form.sku}
								disabled={!!editItem}
								onChange={(e) => setField("sku", e.target.value)}
								className={inputClass(!!editItem)}
							/>
						</Field>

						<Field label="Name">
							<input
								type="text"
								value={form.name}
								onChange={(e) => setField("name", e.target.value)}
								className={inputClass(false)}
							/>
						</Field>

						<div className="grid grid-cols-2 gap-4">
							<Field label="Price">
								<input
									type="number"
									step="0.01"
									min="0"
									value={form.price}
									onChange={(e) => setField("price", e.target.value)}
									className={inputClass(false)}
								/>
							</Field>
							<Field label="Stock">
								<input
									type="number"
									min="0"
									value={form.stock_quantity}
									onChange={(e) => setField("stock_quantity", e.target.value)}
									className={inputClass(false)}
								/>
							</Field>
						</div>

						{/* TCG Single toggle — hidden in edit mode since the type can't change */}
						{!editItem && (
							<label className="flex items-center gap-2 cursor-pointer select-none">
								<input
									type="checkbox"
									checked={form.is_tcg_single}
									onChange={(e) => setField("is_tcg_single", e.target.checked)}
									className="accent-blue-600"
								/>
								<span className="text-sm text-zinc-700">
									TCG Single
								</span>
							</label>
						)}

						{/* Conditional TCG fields */}
						{form.is_tcg_single && (
							<div className="border border-zinc-100 rounded-lg p-4 space-y-3 bg-zinc-50">
								<p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
									TCG Details
								</p>

								<div className="grid grid-cols-2 gap-3">
									<Field label="Game">
										<input
											type="text"
											value={form.game}
											onChange={(e) => setField("game", e.target.value)}
											placeholder="Magic, Pokémon…"
											className={inputClass(false)}
										/>
									</Field>
									<Field label="Set Name">
										<input
											type="text"
											value={form.set_name}
											onChange={(e) => setField("set_name", e.target.value)}
											className={inputClass(false)}
										/>
									</Field>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<Field label="Condition">
										<select
											value={form.condition}
											onChange={(e) =>
												setField("condition", e.target.value as CardCondition)
											}
											className={inputClass(false)}
										>
											{(["NM", "LP", "MP", "HP", "DMG"] as CardCondition[]).map((c) => (
												<option key={c} value={c}>{c}</option>
											))}
										</select>
									</Field>
									<Field label="Foil">
										<label className="flex items-center gap-2 h-9 cursor-pointer">
											<input
												type="checkbox"
												checked={form.foil}
												onChange={(e) => setField("foil", e.target.checked)}
												className="accent-blue-600"
											/>
											<span className="text-sm text-zinc-700">
												Yes
											</span>
										</label>
									</Field>
								</div>
							</div>
						)}

						{formError && (
							<p className="text-rose-600 text-xs">{formError}</p>
						)}

						<div className="flex justify-end gap-3 pt-2">
							<button
								onClick={closeModal}
								className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								disabled={saving}
								className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
							>
								{saving ? "Saving…" : "Save"}
							</button>
						</div>
					</div>
				</Modal>
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

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
				{label}
			</label>
			{children}
		</div>
	);
}

function Modal({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<div
			className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
					<h2 className="text-zinc-900 font-semibold">
						{title}
					</h2>
					<button
						onClick={onClose}
						className="text-zinc-400 hover:text-zinc-600 transition-colors"
					>
						✕
					</button>
				</div>
				<div className="px-5 py-4">{children}</div>
			</div>
		</div>
	);
}

function inputClass(disabled: boolean) {
	if (disabled) {
		return "w-full bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-400 text-sm px-3 py-2 cursor-not-allowed";
	}
	return "w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors";
}
