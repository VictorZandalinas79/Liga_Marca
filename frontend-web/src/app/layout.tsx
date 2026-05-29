import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LFM Vilafranca - Fantasy Football",
  description: "Juego de fantasy football entre amigos",
  icons: {
    icon: '/icono_lliga.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} min-h-full flex flex-col bg-slate-50`}>{children}</body>
    </html>
  );
}
