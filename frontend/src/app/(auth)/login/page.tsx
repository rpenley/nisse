"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
	const router = useRouter();
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
				router.replace("/dashboard");
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
			<div className="border border-[#3c3836] bg-[#1d2021] p-8">
				<h1 className="text-[#fabd2f] font-mono text-2xl font-bold mb-1">
					Nisse
				</h1>
				<p className="text-[#928374] font-mono text-sm mb-8">
					Point of Sale &amp; ERP
				</p>

				<form method="post" onSubmit={handleSubmit} className="space-y-5">
					<div>
						<label
							htmlFor="username"
							className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1"
						>
							Username
						</label>
						<input
							id="username"
							name="username"
							type="text"
							required
							autoComplete="username"
							className="w-full bg-[#282828] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors"
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1"
						>
							Password
						</label>
						<input
							id="password"
							name="password"
							type="password"
							required
							autoComplete="current-password"
							className="w-full bg-[#282828] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f] transition-colors"
						/>
					</div>

					{error && (
						<p className="text-[#fb4934] font-mono text-xs">{error}</p>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold py-2 px-4 hover:bg-[#d79921] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{loading ? "Signing in…" : "Sign in"}
					</button>
				</form>
			</div>
		</div>
	);
}
