import type { Metadata } from "next";
import "./globals.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import { LangProvider } from "@/i18n";

export const metadata: Metadata = {
  title: "Toronto streets where parking is free",
  description:
    "Every Toronto street coloured by what the parking rules the city itself publishes say about it: free with a time limit, no parking rule published, no parking, or only winter rules. With street search, Near me, and open data downloads.",
  openGraph: {
    title: "Toronto streets where parking is free",
    description:
      "A map of every Toronto street, coloured by the parking rules the city itself publishes. Free with a time limit, no rule published, no parking, or only winter rules.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper text-ink antialiased">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
