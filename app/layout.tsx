import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "æž—çš„å·¥ä½œå°ï½œæ¯æ—¥è®¡åˆ’ã€çµæ„Ÿä¸Žå¤ç›˜",
  description: "ä¸€ä¸ªå®‰é™ã€ä¸“æ³¨çš„ä¸ªäººå·¥ä½œå°ã€‚å®Œæˆæ¯æ—¥è®¡åˆ’ï¼Œæ”¶è—çµæ„Ÿï¼Œè®¤çœŸå¤ç›˜æ¯ä¸€å¤©ã€‚",
  openGraph: {
    title: "æž—çš„å·¥ä½œå°",
    description: "æŠŠä»Šå¤©ï¼Œè¿‡å¾—å…·ä½“ä¸€ç‚¹ã€‚",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "æž—çš„å·¥ä½œå°" }],
    locale: "zh_CN",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "æž—çš„å·¥ä½œå°", description: "æŠŠä»Šå¤©ï¼Œè¿‡å¾—å…·ä½“ä¸€ç‚¹ã€‚", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

