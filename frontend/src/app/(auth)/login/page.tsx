"use client";
import React, { useState } from "react";

export default function LoginPage() {
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setLoading(true);

		const form = new FormData(event.currentTarget);
		const username = form.get("username") as string;
		const password = form.get("password") as string;

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
				credentials: "include",
			});

			if (response.ok) {
				window.location.assign("/dashboard");
			} else {
				const data = await response.json();
				setError(data.error ?? "Login failed");
			}
		} catch {
			setError("Could not reach the server");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="w-full max-w-sm">
			<div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-8">
				<h1 className="text-zinc-900 text-2xl font-bold mb-1">
					Nisse
				</h1>
				<p className="text-zinc-500 text-sm mb-8">
					Point of Sale &amp; ERP
				</p>

				<form method="post" onSubmit={handleSubmit} className="space-y-5">
					<div>
						<label
							htmlFor="username"
							className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5"
						>
							Username
						</label>
						<input
							id="username"
							name="username"
							type="text"
							required
							autoComplete="username"
							className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5"
						>
							Password
						</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="current-password"
							className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
						/>
					</div>

					{error && (
						<p className="text-rose-600 text-xs">{error}</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{loading ? "Signing in…" : "Sign in"}
					</button>
				</form>
			</div>
		</div>
	);
}
