import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "吃啥 · 暖食帖",
  description: "为今天吃什么而生的暖食决策工具",
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
