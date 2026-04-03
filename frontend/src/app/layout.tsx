import type { Metadata } from "next";

import { ThemeProvider, type ThemePreference } from "@/components/ThemeProvider";
import { getCurrentUser } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
	title: "Nisse ERP",
	description: "Point of Sale & ERP for game shops",
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUser();
	const theme = (user?.theme_preference ?? "light") as ThemePreference;

	return (
		<html lang="en">
			<body data-theme={theme} className="font-sans bg-zinc-50 text-zinc-900">
				<ThemeProvider initialTheme={theme}>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
