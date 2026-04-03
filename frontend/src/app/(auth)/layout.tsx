import { redirectIfAuthenticated } from "@/lib/auth";

export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await redirectIfAuthenticated();

	return (
		<div className="min-h-screen bg-zinc-50 flex items-center justify-center">
			{children}
		</div>
	);
}
