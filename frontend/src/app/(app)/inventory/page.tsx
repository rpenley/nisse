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
				<h1 className="text-[#fabd2f] font-mono text-2xl font-bold">
					Inventory
				</h1>
				<button
					onClick={openAdd}
					className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors"
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
					className="flex-1 bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-1.5 placeholder-[#665c54] focus:outline-none focus:border-[#fabd2f]"
				/>
			</div>
			<div className="flex gap-1 mb-4">
				{(["all", "sealed", "singles"] as FilterMode[]).map((mode) => (
					<button
						key={mode}
						onClick={() => setFilter(mode)}
						className={`font-mono text-xs px-3 py-1 border transition-colors ${
							filter === mode
								? "border-[#fabd2f] bg-[#3c3836] text-[#fabd2f]"
								: "border-[#504945] text-[#928374] hover:text-[#ebdbb2] hover:border-[#665c54]"
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
				<p className="text-[#928374] font-mono text-sm">Loading…</p>
			) : error ? (
				<p className="text-[#fb4934] font-mono text-sm">{error}</p>
			) : items.length === 0 ? (
				<p className="text-[#928374] font-mono text-sm">
					No products found.
				</p>
			) : (
				<div className="border border-[#3c3836] overflow-x-auto">
					<table className="w-full font-mono text-sm">
						<thead>
							<tr className="border-b border-[#3c3836] text-[#a89984]">
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
									className="border-b border-[#3c3836] hover:bg-[#3c3836] transition-colors"
								>
									<Td dim>{item.sku}</Td>
									<Td>{item.name}</Td>
									<Td>
										{item.is_tcg_single ? (
											<span className="text-[#83a598]">
												Single
											</span>
										) : (
											<span className="text-[#b8bb26]">
												Sealed
											</span>
										)}
									</Td>
									<Td>${parseFloat(item.price).toFixed(2)}</Td>
									<Td>
										<span
											className={
												item.stock_quantity === 0
													? "text-[#fb4934]"
													: "text-[#ebdbb2]"
											}
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
												className="text-[#83a598] hover:text-[#ebdbb2] transition-colors"
											>
												Edit
											</button>
											<button
												onClick={() =>
													handleDelete(item)
												}
												className="text-[#fb4934] hover:text-[#ebdbb2] transition-colors"
											>
												Del
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
								onChange={(e) =>
									setField("sku", e.target.value)
								}
								className={inputClass(!!editItem)}
							/>
						</Field>

						<Field label="Name">
							<input
								type="text"
								value={form.name}
								onChange={(e) =>
									setField("name", e.target.value)
								}
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
									onChange={(e) =>
										setField("price", e.target.value)
									}
									className={inputClass(false)}
								/>
							</Field>
							<Field label="Stock">
								<input
									type="number"
									min="0"
									value={form.stock_quantity}
									onChange={(e) =>
										setField(
											"stock_quantity",
											e.target.value,
										)
									}
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
									onChange={(e) =>
										setField(
											"is_tcg_single",
											e.target.checked,
										)
									}
									className="accent-[#fabd2f]"
								/>
								<span className="font-mono text-sm text-[#ebdbb2]">
									TCG Single
								</span>
							</label>
						)}

						{/* Conditional TCG fields */}
						{form.is_tcg_single && (
							<div className="border border-[#504945] p-3 space-y-3">
								<p className="text-[#a89984] font-mono text-xs uppercase tracking-wider">
									TCG Details
								</p>

								<div className="grid grid-cols-2 gap-3">
									<Field label="Game">
										<input
											type="text"
											value={form.game}
											onChange={(e) =>
												setField("game", e.target.value)
											}
											placeholder="Magic, Pokémon…"
											className={inputClass(false)}
										/>
									</Field>
									<Field label="Set Name">
										<input
											type="text"
											value={form.set_name}
											onChange={(e) =>
												setField(
													"set_name",
													e.target.value,
												)
											}
											className={inputClass(false)}
										/>
									</Field>
								</div>

								<div className="grid grid-cols-2 gap-3">
									<Field label="Condition">
										<select
											value={form.condition}
											onChange={(e) =>
												setField(
													"condition",
													e.target.value as CardCondition,
												)
											}
											className={inputClass(false)}
										>
											{(
												[
													"NM",
													"LP",
													"MP",
													"HP",
													"DMG",
												] as CardCondition[]
											).map((c) => (
												<option key={c} value={c}>
													{c}
												</option>
											))}
										</select>
									</Field>
									<Field label="Foil">
										<label className="flex items-center gap-2 h-8 cursor-pointer">
											<input
												type="checkbox"
												checked={form.foil}
												onChange={(e) =>
													setField(
														"foil",
														e.target.checked,
													)
												}
												className="accent-[#fabd2f]"
											/>
											<span className="text-sm text-[#ebdbb2]">
												Yes
											</span>
										</label>
									</Field>
								</div>
							</div>
						)}

						{formError && (
							<p className="text-[#fb4934] font-mono text-xs">
								{formError}
							</p>
						)}

						<div className="flex justify-end gap-3 pt-2">
							<button
								onClick={closeModal}
								className="font-mono text-sm text-[#928374] hover:text-[#ebdbb2] transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								disabled={saving}
								className="bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold px-4 py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
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
		<td
			className={`px-4 py-3 ${dim ? "text-[#928374]" : "text-[#ebdbb2]"}`}
		>
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
			<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
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
			className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="bg-[#282828] border border-[#3c3836] w-full max-w-lg max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between px-5 py-4 border-b border-[#3c3836]">
					<h2 className="text-[#fabd2f] font-mono font-bold">
						{title}
					</h2>
					<button
						onClick={onClose}
						className="text-[#928374] hover:text-[#ebdbb2] font-mono"
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
	return `w-full bg-[#1d2021] border ${
		disabled ? "border-[#3c3836] text-[#928374]" : "border-[#504945] text-[#ebdbb2]"
	} font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors`;
}
