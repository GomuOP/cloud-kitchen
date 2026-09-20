import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getCustomerUserId } from "@/lib/auth/session";
import FloatingChat from "./FloatingChat";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Tiffin Tribe — subscription marketplace",
  description: "Meal subscription & fulfilment marketplace",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The assistant only answers questions about a logged-in customer's own
  // data (see app/actions/assistant.ts), so the launcher only renders when
  // a customer session exists — showing it to a logged-out visitor would
  // just redirect them to /login on their first message.
  const customerId = await getCustomerUserId();

  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        {children}
        {customerId && <FloatingChat />}
      </body>
    </html>
  );
}
