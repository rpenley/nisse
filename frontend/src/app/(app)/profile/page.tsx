"use client";

import { useEffect, useState } from "react";

import { useTheme, type ThemePreference } from "@/components/ThemeProvider";

interface Me {
	id: string;
	username: string;
	role: string;
	theme_preference: ThemePreference;
}

export default function ProfilePage() {
	const { theme, setTheme } = useTheme();
	const [me, setMe] = useState<Me | null>(null);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [themePreference, setThemePreference] = useState<ThemePreference>("light");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

	useEffect(() => {
		fetch("/api/me", { credentials: "include" })
			.then((r) => r.json())
			.then((data: Me) => {
				setMe(data);
				setUsername(data.username);
				setThemePreference(data.theme_preference);
				setTheme(data.theme_preference);
			});
	}, [setTheme]);

	async function handleSave() {
		if (password && password !== confirm) {
			setMessage({ text: "Passwords do not match", ok: false });
			return;
		}
		setSaving(true);
		setMessage(null);
		const previousTheme = theme;
		try {
			const body: Record<string, string> = {};
			if (username.trim() && username !== me?.username) body.username = username.trim();
			if (password) body.password = password;
			if (themePreference !== me?.theme_preference) body.theme_preference = themePreference;
			if (Object.keys(body).length === 0) {
				setMessage({ text: "Nothing changed", ok: false });
				return;
			}
			if (body.theme_preference) {
				setTheme(themePreference);
			}
			const res = await fetch("/api/me/update", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (res.ok) {
				setMe(data);
				setUsername(data.username);
				setThemePreference(data.theme_preference);
				setTheme(data.theme_preference);
				setPassword("");
				setConfirm("");
				setMessage({ text: "Profile updated", ok: true });
			} else {
				setTheme(previousTheme);
				setMessage({ text: data.error ?? "Update failed", ok: false });
			}
		} catch {
			setTheme(previousTheme);
			setMessage({ text: "Could not reach server", ok: false });
		} finally {
			setSaving(false);
		}
	}

	if (!me) return <p className="text-zinc-400 text-sm animate-pulse">Loading…</p>;

	return (
		<div className="max-w-sm">
			<h1 className="text-zinc-900 text-2xl font-bold mb-6">Profile</h1>

			<div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
				{/* Role badge */}
				<div className="flex items-center gap-2 pb-4 border-b border-zinc-100">
					<span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Role</span>
					<span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
						me.role === "admin"
							? "bg-amber-50 text-amber-700"
							: "bg-blue-50 text-blue-700"
					}`}>
						{me.role.toUpperCase()}
					</span>
				</div>

				{/* Username */}
				<div>
					<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
						Username
					</label>
					<input
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
					/>
				</div>

				{/* New password */}
				<div>
					<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
						New Password
					</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Leave blank to keep current"
						className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
					/>
				</div>

				{/* Confirm password */}
				{password && (
					<div>
						<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
							Confirm Password
						</label>
						<input
							type="password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							className="w-full bg-white border border-zinc-200 rounded-lg text-zinc-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
						/>
					</div>
				)}

				<div>
					<label className="block text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1.5">
						Theme
					</label>
					<div className="grid grid-cols-2 gap-2">
						{(["light", "dark"] as ThemePreference[]).map((option) => {
							const active = themePreference === option;
							return (
								<button
									key={option}
									type="button"
									onClick={() => setThemePreference(option)}
									className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
										active
											? "border-blue-600 bg-blue-50 text-blue-700"
											: "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
									}`}
								>
									{option}
								</button>
							);
						})}
					</div>
				</div>

				{/* Message */}
				{message && (
					<p className={`text-xs ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>
						{message.text}
					</p>
				)}

				<button
					onClick={handleSave}
					disabled={saving}
					className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg shadow-sm hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save Changes"}
				</button>
			</div>
		</div>
	);
}
