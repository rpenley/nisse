import { describe, it, expect } from "vitest";
import {
	addToCart,
	adjustQuantity,
	cartTotal,
	splitBreakdown,
	type CartItem,
} from "@/lib/cart";

// ── cartTotal ─────────────────────────────────────────────────────────────────

describe("cartTotal", () => {
	it("returns 0 for an empty cart", () => {
		expect(cartTotal([])).toBe(0);
	});

	it("sums price × quantity for a single item", () => {
		const items: CartItem[] = [
			{ product_id: "a", name: "Widget", price: 9.99, quantity: 3 },
		];
		expect(cartTotal(items)).toBeCloseTo(29.97);
	});

	it("sums across multiple items", () => {
		const items: CartItem[] = [
			{ product_id: "a", name: "A", price: 10.0, quantity: 2 },
			{ product_id: "b", name: "B", price: 5.0, quantity: 4 },
		];
		expect(cartTotal(items)).toBe(40.0);
	});
});

// ── splitBreakdown ────────────────────────────────────────────────────────────

describe("splitBreakdown", () => {
	it("applies partial credit correctly", () => {
		const { creditUsed, cashDue } = splitBreakdown(50.0, 20.0);
		expect(creditUsed).toBe(20.0);
		expect(cashDue).toBe(30.0);
	});

	it("clamps credit to the total (customer cannot overpay with credit)", () => {
		const { creditUsed, cashDue } = splitBreakdown(30.0, 99.0);
		expect(creditUsed).toBe(30.0);
		expect(cashDue).toBe(0.0);
	});

	it("clamps negative credit to zero", () => {
		const { creditUsed, cashDue } = splitBreakdown(50.0, -5.0);
		expect(creditUsed).toBe(0.0);
		expect(cashDue).toBe(50.0);
	});

	it("exact-match credit: cashDue is 0", () => {
		const { cashDue } = splitBreakdown(25.0, 25.0);
		expect(cashDue).toBe(0.0);
	});
});

// ── adjustQuantity ────────────────────────────────────────────────────────────

describe("adjustQuantity", () => {
	const initial: CartItem[] = [
		{ product_id: "x", name: "X", price: 5.0, quantity: 2 },
		{ product_id: "y", name: "Y", price: 3.0, quantity: 1 },
	];

	it("increments quantity for the target item", () => {
		const result = adjustQuantity(initial, "x", 1);
		expect(result.find((i) => i.product_id === "x")?.quantity).toBe(3);
	});

	it("decrements quantity for the target item", () => {
		const result = adjustQuantity(initial, "x", -1);
		expect(result.find((i) => i.product_id === "x")?.quantity).toBe(1);
	});

	it("removes the item when quantity reaches zero", () => {
		const result = adjustQuantity(initial, "y", -1);
		expect(result.find((i) => i.product_id === "y")).toBeUndefined();
		expect(result).toHaveLength(1);
	});

	it("does not affect other items", () => {
		const result = adjustQuantity(initial, "x", 5);
		expect(result.find((i) => i.product_id === "y")?.quantity).toBe(1);
	});
});

// ── addToCart ─────────────────────────────────────────────────────────────────

describe("addToCart", () => {
	it("adds a new product as quantity 1", () => {
		const result = addToCart([], {
			product_id: "z",
			name: "Z",
			price: 10.0,
		});
		expect(result).toHaveLength(1);
		expect(result[0].quantity).toBe(1);
	});

	it("increments quantity when product already exists", () => {
		const initial: CartItem[] = [
			{ product_id: "z", name: "Z", price: 10.0, quantity: 2 },
		];
		const result = addToCart(initial, { product_id: "z", name: "Z", price: 10.0 });
		expect(result).toHaveLength(1);
		expect(result[0].quantity).toBe(3);
	});

	it("does not mutate the original array", () => {
		const initial: CartItem[] = [];
		addToCart(initial, { product_id: "a", name: "A", price: 1.0 });
		expect(initial).toHaveLength(0);
	});
});
