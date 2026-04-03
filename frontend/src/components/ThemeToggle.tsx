"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

import { useTheme, type ThemePreference } from "@/components/ThemeProvider";

async function persistTheme(theme: ThemePreference) {
	const response = await fetch("/api/me/update", {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ theme_preference: theme }),
	});

	if (!response.ok) {
		throw new Error("Failed to save theme");
	}
}

export default function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [saving, setSaving] = useState(false);

	async function handleToggle() {
		const nextTheme: ThemePreference = theme === "light" ? "dark" : "light";
		const previousTheme = theme;

		setTheme(nextTheme);
		setSaving(true);

		try {
			await persistTheme(nextTheme);
		} catch {
			setTheme(previousTheme);
		} finally {
			setSaving(false);
		}
	}

	return (
		<button
			type="button"
			onClick={handleToggle}
			disabled={saving}
			aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
			title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
			className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
		>
			{theme === "light" ? (
				<Moon className="h-4 w-4" strokeWidth={1.8} />
			) : (
				<Sun className="h-4 w-4" strokeWidth={1.8} />
			)}
		</button>
	);
}
