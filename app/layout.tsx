import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "吃啥？",
  description: "好好吃饭 · 暖食帖 AI Food Mood Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&family=Noto+Sans+SC:wght@400;500;700;900&family=Baloo+2:wght@500;600;700;800&family=Caveat:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
