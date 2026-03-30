/**
 * MSW request handlers used by frontend tests.
 *
 * Each handler intercepts a specific `/api/*` route and returns fixture data
 * so tests run independently of the Rust backend.
 */
import { http, HttpResponse } from "msw";

export const PRODUCT_ID = "00000000-0000-0000-0000-000000000001";
export const CUSTOMER_ID = "00000000-0000-0000-0000-000000000002";

export const handlers = [
	// Inventory list
	http.get("/api/inventory", () => {
		return HttpResponse.json([
			{
				id: PRODUCT_ID,
				sku: "TEST-001",
				name: "Test Card",
				price: "10.00",
				stock_quantity: 5,
				is_tcg_single: false,
				tcg_id: null,
				game: null,
				set_name: null,
				condition: null,
				foil: null,
			},
		]);
	}),

	// Customer list / search
	http.get("/api/customers", () => {
		return HttpResponse.json([
			{
				id: CUSTOMER_ID,
				name: "Alice",
				email: "alice@example.com",
				store_credit_balance: "25.00",
			},
		]);
	}),

	// Checkout — success
	http.post("/api/sales/checkout", () => {
		return HttpResponse.json(
			{
				sale_id: "00000000-0000-0000-0000-000000000003",
				total: "10.00",
				payment_method: "cash",
				created_at: new Date().toISOString(),
			},
			{ status: 201 },
		);
	}),
];
