import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Nisse ERP",
	description: "Point of Sale & ERP for game shops",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body className="bg-[#282828] text-[#ebdbb2] font-mono">
				{children}
			</body>
		</html>
	);
}
