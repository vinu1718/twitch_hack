import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const display = localFont({
  src: "./fonts/Anton-Regular.ttf",
  variable: "--font-display",
  display: "swap",
});
const ui = localFont({
  src: "./fonts/Geist-Variable.ttf",
  variable: "--font-ui",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Previously On",
  description: "Live stream recaps for viewers arriving mid-stream.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
