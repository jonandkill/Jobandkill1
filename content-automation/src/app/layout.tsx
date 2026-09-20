import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JOB&KILL 콘텐츠 운영",
  description: "검색 수요·근거·승인·성과를 한 흐름으로 관리하는 잡앤킬 운영 화면",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
