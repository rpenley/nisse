"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
	id: string;
	sku: string;
	name: string;
	price: string;
	stock_quantity: number;
	is_tcg_single: boolean;
	game: string | null;
	set_name: string | null;
	condition: string | null;
}

interface Customer {
	id: string;
	name: string;
	email: string;
	store_credit_balance: string;
}

interface CartItem {
	product: Product;
	quantity: number;
}

type PaymentMethod = "cash" | "card" | "store_credit" | "split";

const CART_STORAGE_KEY = "nisse_pos_cart";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PosPage() {
	// Products catalog
	const [products, setProducts] = useState<Product[]>([]);
	const [catalogLoading, setCatalogLoading] = useState(true);
	const [catalogError, setCatalogError] = useState<string | null>(null);

	// Search / SKU scanner
	const [search, setSearch] = useState("");
	const [skuInput, setSkuInput] = useState("");
	const skuRef = useRef<HTMLInputElement>(null);

	// Cart — persisted to localStorage
	const [cart, setCart] = useState<CartItem[]>([]);
	const [cartLoaded, setCartLoaded] = useState(false);

	// Customer
	const [customerSearch, setCustomerSearch] = useState("");
	const [customerResults, setCustomerResults] = useState<Customer[]>([]);
	const [attachedCustomer, setAttachedCustomer] =
		useState<Customer | null>(null);

	// Payment
	const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
	const [creditAmount, setCreditAmount] = useState("");

	// Checkout state
	const [checkoutLoading, setCheckoutLoading] = useState(false);
	const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(
		null,
	);

	// ── Load cart from localStorage on mount ─────────────────────────────────

	useEffect(() => {
		try {
			const saved = localStorage.getItem(CART_STORAGE_KEY);
			if (saved) setCart(JSON.parse(saved));
		} catch {
			// Corrupted storage — start fresh.
		}
		setCartLoaded(true);
	}, []);

	// ── Persist cart to localStorage on every change ──────────────────────────

	useEffect(() => {
		if (!cartLoaded) return;
		localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
	}, [cart, cartLoaded]);

	// ── Fetch product catalog ─────────────────────────────────────────────────

	function fetchProducts() {
		fetch("/api/inventory", { credentials: "include" })
			.then((r) => {
				if (!r.ok) throw new Error();
				return r.json();
			})
			.then((data: Product[]) => setProducts(data))
			.catch(() => setCatalogError("Could not load inventory"))
			.finally(() => setCatalogLoading(false));
	}

	useEffect(() => {
		fetchProducts();
	}, []);

	// ── Customer search (debounced) ───────────────────────────────────────────

	useEffect(() => {
		const query = customerSearch.trim();
		if (!query || attachedCustomer) {
			setCustomerResults([]);
			return;
		}
		const timer = setTimeout(() => {
			fetch(`/api/customers?q=${encodeURIComponent(query)}`, {
				credentials: "include",
			})
				.then((r) => r.json())
				.then((data: Customer[]) => setCustomerResults(data.slice(0, 8)))
				.catch(() => {});
		}, 250);
		return () => clearTimeout(timer);
	}, [customerSearch, attachedCustomer]);

	// ── Auto-dismiss toast ────────────────────────────────────────────────────

	useEffect(() => {
		if (!toast) return;
		const timer = setTimeout(() => setToast(null), 3500);
		return () => clearTimeout(timer);
	}, [toast]);

	// ── Cart operations ───────────────────────────────────────────────────────

	function addToCart(product: Product) {
		if (product.stock_quantity === 0) return;
		setCart((prev) => {
			const existing = prev.find((i) => i.product.id === product.id);
			if (existing) {
				return prev.map((i) =>
					i.product.id === product.id
						? { ...i, quantity: i.quantity + 1 }
						: i,
				);
			}
			return [...prev, { product, quantity: 1 }];
		});
	}

	function setQuantity(productId: string, quantity: number) {
		if (quantity <= 0) {
			setCart((prev) => prev.filter((i) => i.product.id !== productId));
		} else {
			setCart((prev) =>
				prev.map((i) =>
					i.product.id === productId ? { ...i, quantity } : i,
				),
			);
		}
	}

	function removeFromCart(productId: string) {
		setCart((prev) => prev.filter((i) => i.product.id !== productId));
	}

	function clearCart() {
		setCart([]);
		localStorage.removeItem(CART_STORAGE_KEY);
	}

	// ── Customer attachment ───────────────────────────────────────────────────

	function attachCustomer(customer: Customer) {
		setAttachedCustomer(customer);
		setCustomerSearch("");
		setCustomerResults([]);
	}

	function detachCustomer() {
		setAttachedCustomer(null);
		setCreditAmount("");
		if (paymentMethod === "store_credit" || paymentMethod === "split") {
			setPaymentMethod("cash");
		}
	}

	// ── SKU scanner ───────────────────────────────────────────────────────────

	function handleSkuScan(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Enter") return;
		const sku = skuInput.trim().toUpperCase();
		const match = products.find(
			(p) => p.sku.toUpperCase() === sku,
		);
		if (match) {
			addToCart(match);
			setSkuInput("");
			setToast({ message: `Added: ${match.name}`, ok: true });
		} else {
			setToast({ message: `SKU not found: ${sku}`, ok: false });
		}
	}

	// ── Checkout ──────────────────────────────────────────────────────────────

	async function handleCheckout() {
		if (cart.length === 0) return;

		if (
			(paymentMethod === "store_credit" ||
				paymentMethod === "split") &&
			!attachedCustomer
		) {
			setToast({
				message: "Attach a customer to use store credit",
				ok: false,
			});
			return;
		}

		if (paymentMethod === "split") {
			const credit = parseFloat(creditAmount);
			if (isNaN(credit) || credit <= 0) {
				setToast({
					message: "Enter a valid store credit amount",
					ok: false,
				});
				return;
			}
			if (credit >= cartTotal) {
				setToast({
					message:
						"For full credit payment, use Store Credit mode",
					ok: false,
				});
				return;
			}
		}

		setCheckoutLoading(true);

		const body: Record<string, unknown> = {
			payment_method: paymentMethod,
			items: cart.map((item) => ({
				product_id: item.product.id,
				quantity: item.quantity,
			})),
		};

		if (attachedCustomer) {
			body.customer_id = attachedCustomer.id;
		}

		if (paymentMethod === "split") {
			body.store_credit_amount = parseFloat(creditAmount);
		}

		try {
			const response = await fetch("/api/sales/checkout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(body),
			});

			const data = await response.json();

			if (response.ok) {
				const creditUsed =
					paymentMethod === "store_credit"
						? cartTotal
						: paymentMethod === "split"
							? parseFloat(creditAmount)
							: 0;

				clearCart();
				setCreditAmount("");
				setPaymentMethod("cash");
				fetchProducts();

				// Refresh the attached customer's balance so it's current.
				if (attachedCustomer && creditUsed > 0) {
					const newBalance =
						parseFloat(attachedCustomer.store_credit_balance) -
						creditUsed;
					setAttachedCustomer((c) =>
						c
							? {
									...c,
									store_credit_balance:
										newBalance.toFixed(2),
								}
							: null,
					);
				}

				setToast({
					message: `Sale complete — $${parseFloat(data.total).toFixed(2)}`,
					ok: true,
				});
			} else {
				setToast({
					message: data.error ?? "Checkout failed",
					ok: false,
				});
			}
		} catch {
			setToast({ message: "Could not reach server", ok: false });
		} finally {
			setCheckoutLoading(false);
		}
	}

	// ── Derived values ────────────────────────────────────────────────────────

	const filteredProducts = search
		? products.filter(
				(p) =>
					p.name.toLowerCase().includes(search.toLowerCase()) ||
					p.sku.toLowerCase().includes(search.toLowerCase()),
			)
		: products;

	const cartTotal = cart.reduce(
		(sum, item) => sum + parseFloat(item.product.price) * item.quantity,
		0,
	);

	const creditApplied =
		paymentMethod === "store_credit"
			? cartTotal
			: paymentMethod === "split"
				? parseFloat(creditAmount) || 0
				: 0;

	const balance = attachedCustomer
		? parseFloat(attachedCustomer.store_credit_balance)
		: 0;

	const maxCredit = Math.min(balance, cartTotal);

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="flex h-[calc(100vh-48px)] gap-0 -m-6">
			{/* ── Left panel: product catalog ─────────────────────────────── */}
			<div className="flex flex-col flex-1 border-r border-[#3c3836] overflow-hidden">
				{/* SKU scanner */}
				<div className="px-4 py-3 border-b border-[#3c3836] bg-[#1d2021]">
					<input
						ref={skuRef}
						type="text"
						value={skuInput}
						onChange={(e) => setSkuInput(e.target.value)}
						onKeyDown={handleSkuScan}
						placeholder="Scan SKU and press Enter…"
						className="w-full bg-[#282828] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#b8bb26] transition-colors placeholder:text-[#665c54]"
					/>
				</div>

				{/* Search filter */}
				<div className="px-4 py-2 border-b border-[#3c3836]">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Filter by name or SKU…"
						className="w-full bg-transparent border-b border-[#3c3836] text-[#ebdbb2] font-mono text-sm py-1 focus:outline-none focus:border-[#fabd2f] transition-colors placeholder:text-[#665c54]"
					/>
				</div>

				{/* Product grid */}
				<div className="flex-1 overflow-y-auto p-4">
					{catalogLoading ? (
						<p className="text-[#928374] font-mono text-sm">
							Loading…
						</p>
					) : catalogError ? (
						<p className="text-[#fb4934] font-mono text-sm">
							{catalogError}
						</p>
					) : filteredProducts.length === 0 ? (
						<p className="text-[#928374] font-mono text-sm">
							No products found.
						</p>
					) : (
						<div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
							{filteredProducts.map((product) => (
								<ProductCard
									key={product.id}
									product={product}
									onClick={() => addToCart(product)}
								/>
							))}
						</div>
					)}
				</div>
			</div>

			{/* ── Right panel: cart ───────────────────────────────────────── */}
			<div className="flex flex-col w-80 xl:w-96 bg-[#1d2021]">
				{/* Customer section */}
				<div className="px-4 py-3 border-b border-[#3c3836]">
					{attachedCustomer ? (
						<div className="flex items-start justify-between">
							<div>
								<p className="text-[#ebdbb2] font-mono text-sm font-bold">
									{attachedCustomer.name}
								</p>
								<p className="text-[#b8bb26] font-mono text-xs">
									Credit: $
									{parseFloat(
										attachedCustomer.store_credit_balance,
									).toFixed(2)}
								</p>
							</div>
							<button
								onClick={detachCustomer}
								className="text-[#665c54] hover:text-[#fb4934] font-mono text-xs transition-colors"
							>
								Detach
							</button>
						</div>
					) : (
						<div className="relative">
							<input
								type="text"
								value={customerSearch}
								onChange={(e) =>
									setCustomerSearch(e.target.value)
								}
								placeholder="Attach customer by name or email…"
								className="w-full bg-[#282828] border border-[#504945] text-[#ebdbb2] font-mono text-xs px-3 py-2 focus:outline-none focus:border-[#83a598] transition-colors placeholder:text-[#665c54]"
							/>
							{customerResults.length > 0 && (
								<ul className="absolute top-full left-0 right-0 bg-[#282828] border border-[#504945] border-t-0 z-10 max-h-48 overflow-y-auto">
									{customerResults.map((customer) => (
										<li key={customer.id}>
											<button
												onClick={() =>
													attachCustomer(customer)
												}
												className="w-full text-left px-3 py-2 font-mono text-xs text-[#ebdbb2] hover:bg-[#3c3836] transition-colors"
											>
												<span className="text-[#ebdbb2]">
													{customer.name}
												</span>
												<span className="text-[#928374] ml-2">
													{customer.email}
												</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>

				{/* Cart header */}
				<div className="px-4 py-2 border-b border-[#3c3836]">
					<h2 className="text-[#fabd2f] font-mono font-bold text-sm">
						Cart
					</h2>
				</div>

				{/* Cart items */}
				<div className="flex-1 overflow-y-auto">
					{cart.length === 0 ? (
						<p className="text-[#665c54] font-mono text-sm px-4 py-6 text-center">
							Cart is empty.
							<br />
							Click a product or scan a SKU.
						</p>
					) : (
						<ul className="divide-y divide-[#3c3836]">
							{cart.map((item) => (
								<CartRow
									key={item.product.id}
									item={item}
									onQuantityChange={(qty) =>
										setQuantity(item.product.id, qty)
									}
									onRemove={() =>
										removeFromCart(item.product.id)
									}
								/>
							))}
						</ul>
					)}
				</div>

				{/* Totals + payment + checkout */}
				<div className="border-t border-[#3c3836] p-4 space-y-3">
					{/* Total / credit breakdown */}
					<div className="space-y-1">
						<div className="flex justify-between items-baseline">
							<span className="text-[#a89984] font-mono text-sm">
								Total
							</span>
							<span className="text-[#fabd2f] font-mono text-xl font-bold">
								${cartTotal.toFixed(2)}
							</span>
						</div>
						{creditApplied > 0 && (
							<>
								<div className="flex justify-between items-baseline">
									<span className="text-[#b8bb26] font-mono text-xs">
										Store Credit
									</span>
									<span className="text-[#b8bb26] font-mono text-xs">
										−${creditApplied.toFixed(2)}
									</span>
								</div>
								<div className="flex justify-between items-baseline border-t border-[#3c3836] pt-1">
									<span className="text-[#ebdbb2] font-mono text-sm">
										Due
									</span>
									<span className="text-[#ebdbb2] font-mono text-sm font-bold">
										$
										{Math.max(
											0,
											cartTotal - creditApplied,
										).toFixed(2)}
									</span>
								</div>
							</>
						)}
					</div>

					{/* Payment method buttons */}
					<div className="grid grid-cols-2 gap-1">
						{(["cash", "card"] as PaymentMethod[]).map(
							(method) => (
								<button
									key={method}
									onClick={() => setPaymentMethod(method)}
									className={paymentButtonClass(
										paymentMethod === method,
									)}
								>
									{method === "cash" ? "Cash" : "Card"}
								</button>
							),
						)}
						{/* Credit options — only shown when a customer is attached */}
						{attachedCustomer &&
							balance > 0 &&
							(
								[
									"store_credit",
									"split",
								] as PaymentMethod[]
							).map((method) => (
								<button
									key={method}
									onClick={() => {
										setPaymentMethod(method);
										if (method === "split")
											setCreditAmount("");
									}}
									className={paymentButtonClass(
										paymentMethod === method,
										"credit",
									)}
								>
									{method === "store_credit"
										? "Credit"
										: "Split"}
								</button>
							))}
					</div>

					{/* Split: credit amount input */}
					{paymentMethod === "split" && attachedCustomer && (
						<div>
							<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
								Credit to apply (max ${maxCredit.toFixed(2)})
							</label>
							<input
								type="number"
								step="0.01"
								min="0.01"
								max={maxCredit}
								value={creditAmount}
								onChange={(e) =>
									setCreditAmount(e.target.value)
								}
								className="w-full bg-[#282828] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#b8bb26] transition-colors"
							/>
						</div>
					)}

					{/* Checkout button */}
					<button
						onClick={handleCheckout}
						disabled={cart.length === 0 || checkoutLoading}
						className="w-full bg-[#b8bb26] text-[#282828] font-mono font-bold py-3 hover:bg-[#98971a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					>
						{checkoutLoading ? "Processing…" : "Checkout"}
					</button>

					{cart.length > 0 && (
						<button
							onClick={clearCart}
							className="w-full text-[#928374] font-mono text-xs hover:text-[#fb4934] transition-colors"
						>
							Clear cart
						</button>
					)}
				</div>
			</div>

			{/* ── Toast ───────────────────────────────────────────────────── */}
			{toast && (
				<div
					className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 font-mono text-sm border shadow-lg ${
						toast.ok
							? "bg-[#1d2021] border-[#b8bb26] text-[#b8bb26]"
							: "bg-[#1d2021] border-[#fb4934] text-[#fb4934]"
					}`}
				>
					{toast.message}
				</div>
			)}
		</div>
	);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProductCard({
	product,
	onClick,
}: {
	product: Product;
	onClick: () => void;
}) {
	const outOfStock = product.stock_quantity === 0;
	return (
		<button
			onClick={onClick}
			disabled={outOfStock}
			className={`text-left border p-3 transition-colors w-full ${
				outOfStock
					? "border-[#3c3836] opacity-40 cursor-not-allowed"
					: "border-[#504945] hover:border-[#fabd2f] hover:bg-[#3c3836] cursor-pointer"
			}`}
		>
			<p className="text-[#ebdbb2] font-mono text-sm leading-tight line-clamp-2">
				{product.name}
			</p>
			{product.is_tcg_single && product.game && (
				<p className="text-[#83a598] font-mono text-xs mt-1">
					{product.game}
					{product.condition ? ` · ${product.condition}` : ""}
				</p>
			)}
			<div className="flex justify-between items-baseline mt-2">
				<span className="text-[#fabd2f] font-mono text-sm font-bold">
					${parseFloat(product.price).toFixed(2)}
				</span>
				<span
					className={`font-mono text-xs ${outOfStock ? "text-[#fb4934]" : "text-[#928374]"}`}
				>
					{outOfStock ? "Out" : `×${product.stock_quantity}`}
				</span>
			</div>
		</button>
	);
}

function CartRow({
	item,
	onQuantityChange,
	onRemove,
}: {
	item: CartItem;
	onQuantityChange: (qty: number) => void;
	onRemove: () => void;
}) {
	const lineTotal = parseFloat(item.product.price) * item.quantity;
	return (
		<li className="px-4 py-3">
			<div className="flex justify-between items-start mb-2">
				<p className="text-[#ebdbb2] font-mono text-sm leading-tight flex-1 mr-2">
					{item.product.name}
				</p>
				<button
					onClick={onRemove}
					className="text-[#665c54] hover:text-[#fb4934] font-mono text-xs transition-colors shrink-0"
				>
					✕
				</button>
			</div>
			<div className="flex justify-between items-center">
				<div className="flex items-center gap-1">
					<button
						onClick={() => onQuantityChange(item.quantity - 1)}
						className="w-6 h-6 border border-[#504945] text-[#a89984] hover:text-[#ebdbb2] font-mono text-sm transition-colors"
					>
						−
					</button>
					<span className="text-[#ebdbb2] font-mono text-sm w-6 text-center">
						{item.quantity}
					</span>
					<button
						onClick={() => onQuantityChange(item.quantity + 1)}
						className="w-6 h-6 border border-[#504945] text-[#a89984] hover:text-[#ebdbb2] font-mono text-sm transition-colors"
					>
						+
					</button>
				</div>
				<span className="text-[#a89984] font-mono text-sm">
					${lineTotal.toFixed(2)}
				</span>
			</div>
		</li>
	);
}

function paymentButtonClass(active: boolean, variant?: "credit") {
	const base = "font-mono text-xs py-2 border transition-colors";
	if (active) {
		return `${base} ${variant === "credit" ? "border-[#b8bb26] bg-[#3c3836] text-[#b8bb26]" : "border-[#fabd2f] bg-[#3c3836] text-[#fabd2f]"}`;
	}
	return `${base} border-[#504945] text-[#928374] hover:border-[#665c54] hover:text-[#ebdbb2]`;
}
