"use client";

import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark";

interface ThemeContextValue {
	theme: ThemePreference;
	setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
	children,
	initialTheme,
}: {
	children: ReactNode;
	initialTheme: ThemePreference;
}) {
	const [theme, setTheme] = useState<ThemePreference>(initialTheme);

	useEffect(() => {
		document.body.dataset.theme = theme;
	}, [theme]);

	const value = useMemo(() => ({ theme, setTheme }), [theme]);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	const context = useContext(ThemeContext);

	if (!context) {
		throw new Error("useTheme must be used within ThemeProvider");
	}

	return context;
}
