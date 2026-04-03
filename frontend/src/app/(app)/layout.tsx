import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { requireCurrentUser } from "@/lib/auth";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireCurrentUser();

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar />
			<div className="flex flex-col flex-1 overflow-hidden">
				<Header />
				<main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
					{children}
				</main>
			</div>
		</div>
	);
}
