"use client";

import { useEffect, useState } from "react";

interface Me {
	id: string;
	username: string;
	role: string;
}

export default function ProfilePage() {
	const [me, setMe] = useState<Me | null>(null);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

	useEffect(() => {
		fetch("/api/me", { credentials: "include" })
			.then((r) => r.json())
			.then((data: Me) => {
				setMe(data);
				setUsername(data.username);
			});
	}, []);

	async function handleSave() {
		if (password && password !== confirm) {
			setMessage({ text: "Passwords do not match", ok: false });
			return;
		}
		setSaving(true);
		setMessage(null);
		try {
			const body: Record<string, string> = {};
			if (username.trim() && username !== me?.username) body.username = username.trim();
			if (password) body.password = password;
			if (Object.keys(body).length === 0) {
				setMessage({ text: "Nothing changed", ok: false });
				return;
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
				setPassword("");
				setConfirm("");
				setMessage({ text: "Profile updated", ok: true });
			} else {
				setMessage({ text: data.error ?? "Update failed", ok: false });
			}
		} catch {
			setMessage({ text: "Could not reach server", ok: false });
		} finally {
			setSaving(false);
		}
	}

	if (!me) return <p className="text-[#928374] font-mono text-sm">Loading…</p>;

	return (
		<div className="max-w-sm">
			<h1 className="text-[#fabd2f] font-mono text-2xl font-bold mb-6">Profile</h1>

			<div className="border border-[#3c3836] bg-[#282828] p-5 space-y-4">
				{/* Role badge */}
				<div className="flex items-center gap-2 pb-3 border-b border-[#3c3836]">
					<span className="text-[#a89984] font-mono text-xs uppercase tracking-wider">Role</span>
					<span className={`font-mono text-xs px-1.5 py-0.5 border ${
						me.role === "admin"
							? "border-[#fabd2f] text-[#fabd2f]"
							: "border-[#83a598] text-[#83a598]"
					}`}>
						{me.role.toUpperCase()}
					</span>
				</div>

				{/* Username */}
				<div>
					<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
						Username
					</label>
					<input
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f]"
					/>
				</div>

				{/* New password */}
				<div>
					<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
						New Password
					</label>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						placeholder="Leave blank to keep current"
						className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 placeholder-[#665c54] focus:outline-none focus:border-[#fabd2f]"
					/>
				</div>

				{/* Confirm password */}
				{password && (
					<div>
						<label className="block text-[#a89984] font-mono text-xs uppercase tracking-wider mb-1">
							Confirm Password
						</label>
						<input
							type="password"
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							className="w-full bg-[#1d2021] border border-[#504945] text-[#ebdbb2] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#fabd2f]"
						/>
					</div>
				)}

				{/* Message */}
				{message && (
					<p className={`font-mono text-xs ${message.ok ? "text-[#b8bb26]" : "text-[#fb4934]"}`}>
						{message.text}
					</p>
				)}

				<button
					onClick={handleSave}
					disabled={saving}
					className="w-full bg-[#fabd2f] text-[#282828] font-mono text-sm font-bold py-2 hover:bg-[#d79921] transition-colors disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save Changes"}
				</button>
			</div>
		</div>
	);
}
