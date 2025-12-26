import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TerritoryRun",
  description: "Claim real-world territory on the move."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-hero">
        {children}
      </body>
    </html>
  );
}
