import { useEffect } from 'react';

export type FaviconTone = 'blue' | 'green' | 'purple';

const TONE_FILE: Record<FaviconTone, string> = {
  blue: '/favicon.svg',
  green: '/favicon-green.svg',
  purple: '/favicon-purple.svg',
};

/**
 * 浏览器标签图标跟随角色：教师端蓝（index.html 默认）、学生端绿、管理员端紫。
 * 只改 index.html 里那一个 link。
 */
export function useFavicon(tone: FaviconTone) {
  useEffect(() => {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
      document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]');
    if (!link) return;
    link.href = TONE_FILE[tone];
  }, [tone]);
}
