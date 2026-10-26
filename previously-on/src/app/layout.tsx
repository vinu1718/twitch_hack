import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Previously On",
  description: "Live stream recaps for viewers arriving mid-stream.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
