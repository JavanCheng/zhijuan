import type { ThemeConfig } from 'antd';

/** 全局设计令牌：颜色、圆角、阴影、字体只在这里改。 */
export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#3358e8',
    colorInfo: '#3358e8',
    colorSuccess: '#0f9d6e',
    colorWarning: '#d98a1f',
    colorError: '#d64545',
    colorLink: '#3358e8',
    colorTextBase: '#141a2a',
    colorText: '#26304a',
    colorTextSecondary: '#6b7488',
    colorTextTertiary: '#98a1b3',
    colorBgBase: '#ffffff',
    colorBgLayout: '#f4f6fb',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: '#e3e7f1',
    colorBorderSecondary: '#eceff6',
    borderRadius: 9,
    borderRadiusLG: 16,
    borderRadiusSM: 7,
    fontSize: 14,
    controlHeight: 38,
    controlHeightLG: 44,
    lineWidth: 1,
    boxShadow: '0 1px 2px rgba(20, 26, 42, 0.04), 0 10px 28px -16px rgba(20, 26, 42, 0.16)',
    boxShadowSecondary: '0 18px 48px -20px rgba(20, 26, 42, 0.28)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  components: {
    Layout: {
      siderBg: '#0b1224',
      headerBg: '#ffffff',
      bodyBg: '#f4f6fb',
      headerHeight: 62,
      headerPadding: '0 26px',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemColor: 'rgba(255,255,255,0.66)',
      darkItemHoverBg: 'rgba(255,255,255,0.06)',
      darkItemSelectedBg: 'rgba(90,124,255,0.18)',
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 10,
    },
    Card: {
      borderRadiusLG: 16,
      bodyPadding: 22,
      headerHeight: 56,
      headerFontSize: 15,
      headerBg: 'transparent',
      colorBorderSecondary: '#eceff6',
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 27,
    },
    Table: {
      headerBg: '#f8f9fd',
      headerColor: '#6b7488',
      headerSplitColor: 'transparent',
      rowHoverBg: '#f6f8ff',
      cellPaddingBlock: 13,
      borderColor: '#f0f2f8',
    },
    Modal: {
      borderRadiusLG: 18,
      titleFontSize: 17,
    },
    Drawer: {
      borderRadiusLG: 18,
    },
    Tabs: {
      horizontalItemPadding: '10px 2px',
      horizontalItemGutter: 26,
      titleFontSize: 14,
      inkBarColor: '#3358e8',
    },
    Segmented: {
      itemSelectedBg: '#ffffff',
      trackBg: '#eef1f8',
      itemSelectedColor: '#1c2b55',
    },
    Input: {
      activeShadow: '0 0 0 3px rgba(51, 88, 232, 0.10)',
    },
    Select: {
      optionSelectedBg: '#eef2ff',
    },
    Button: {
      fontWeight: 500,
      primaryShadow: '0 8px 18px -10px rgba(51, 88, 232, 0.65)',
    },
    Progress: {
      defaultColor: '#3358e8',
    },
  },
};
