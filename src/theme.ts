import type { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2f5be2',
    colorInfo: '#2f5be2',
    colorSuccess: '#0f9d6e',
    colorWarning: '#d48806',
    colorError: '#d33c3c',
    colorLink: '#2f5be2',
    colorTextBase: '#121826',
    colorBgLayout: '#f5f6fb',
    colorBorderSecondary: '#e4e8f2',
    borderRadius: 10,
    fontSize: 14,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: {
      siderBg: '#0f1830',
      headerBg: '#ffffff',
      bodyBg: '#f5f6fb',
      headerHeight: 60,
      headerPadding: '0 26px',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.68)',
      darkItemHoverBg: 'rgba(255,255,255,0.06)',
      darkItemSelectedBg: 'rgba(94,130,255,0.18)',
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 10,
    },
    Card: {
      borderRadiusLG: 14,
      bodyPadding: 20,
      headerHeight: 52,
      headerFontSize: 15,
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 26,
    },
    Table: {
      headerBg: '#fafbfe',
      headerColor: '#7a839a',
      headerSplitColor: 'transparent',
    },
    Modal: {
      borderRadiusLG: 16,
    },
  },
};
