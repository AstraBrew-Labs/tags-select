import type { Metadata } from "next";
import "animal-island-ui/style";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovelAI Tags 选择器 · 让灵感慢慢生长",
  description:
    "帮助你快速找到需要的 NovelAI Tags。选择标签生成提示词，粘贴已有 tags 逐项查找中文与分类，收藏常用词并一键复制。",
  applicationName: "NovelAI Tags 选择器",
  openGraph: {
    title: "NovelAI Tags 选择器",
    description: "帮助你快速找到需要的 NovelAI Tags",
    locale: "zh_CN",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      {/* Extensions may inject attributes such as cz-shortcut-listen before hydration.
          Suppress only body-level differences; child components remain checked. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
