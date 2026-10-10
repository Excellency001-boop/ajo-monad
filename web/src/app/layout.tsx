import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["400", "600", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ajo — savings circles where trust is money",
  description:
    "The ajo you know, without the collector who runs away. Vouch for each other, collect your pot in full, build a record that follows you. Built on Monad.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4ecdb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-[1060px] flex-1 px-4 pb-24 sm:px-[22px]">{children}</main>
          <footer className="border-t border-line py-6 text-center text-xs text-ink-soft">
            Ajo · built on Monad · testnet — no real money moves
          </footer>
        </Providers>
      </body>
    </html>
  );
}
