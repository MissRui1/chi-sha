import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "吃啥？",
  description: "AI Food Mood Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
