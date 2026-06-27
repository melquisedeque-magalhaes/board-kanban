import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Board Time de IA",
  description: "Kanban de tarefas do time de IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)}>
      <body style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}