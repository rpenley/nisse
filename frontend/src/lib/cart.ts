/**
 * Pure cart calculation utilities for the POS system.
 *
 * All functions are stateless and work with plain JS numbers so they can be
 * tested without React or a browser environment.
 */

export interface CartItem {
	product_id: string;
	name: string;
	price: number;
	quantity: number;
}

/** Sum of price × quantity across all line items. */
export function cartTotal(items: CartItem[]): number {
	return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Compute the payment breakdown for a split (credit + cash/card) tender.
 *
 * @param total       - Full cart total in dollars.
 * @param creditApplied - Store credit the customer chose to apply.
 * @returns `{ creditUsed, cashDue }` where `cashDue = total - creditUsed`.
 *
 * The function clamps `creditApplied` so it can never exceed `total` and
 * never go below zero.
 */
export function splitBreakdown(
	total: number,
	creditApplied: number,
): { creditUsed: number; cashDue: number } {
	const creditUsed = Math.max(0, Math.min(creditApplied, total));
	return { creditUsed, cashDue: total - creditUsed };
}

/**
 * Increment the quantity of `product_id` in the cart by `delta`.
 * Removes the item when quantity would drop to zero or below.
 */
export function adjustQuantity(
	items: CartItem[],
	product_id: string,
	delta: number,
): CartItem[] {
	return items
		.map((item) =>
			item.product_id === product_id
				? { ...item, quantity: item.quantity + delta }
				: item,
		)
		.filter((item) => item.quantity > 0);
}

/**
 * Add a product to the cart. If it already exists, increment quantity by 1.
 */
export function addToCart(items: CartItem[], product: Omit<CartItem, "quantity">): CartItem[] {
	const existing = items.find((i) => i.product_id === product.product_id);
	if (existing) {
		return adjustQuantity(items, product.product_id, 1);
	}
	return [...items, { ...product, quantity: 1 }];
}
