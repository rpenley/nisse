import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar />
			<div className="flex flex-col flex-1 overflow-hidden">
				<Header />
				<main className="flex-1 overflow-y-auto bg-[#1d2021] p-6">
					{children}
				</main>
			</div>
		</div>
	);
}
