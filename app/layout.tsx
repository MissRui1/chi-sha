import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}