import type { ThemeConfig } from 'antd';

/**
 * 两套设计令牌：教师端偏蓝、学生端偏绿（品牌标记、按钮、进度、标签同色系）。
 * 颜色只在这里改，页面里用 CSS 变量 --brand* 承接。
 */
const sharedToken: ThemeConfig['token'] = {
  colorSuccess: '#0f9d6e',
  colorWarning: '#d98a1f',
  colorError: '#d64545',
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
};

const sharedComponents = {
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
};

function makeTheme(accent: {
  primary: string;
  hover: string;
  active: string;
  soft: string;
  shadow: string;
  glow: string;
  rowHover: string;
}): ThemeConfig {
  return {
    token: {
      ...sharedToken,
      colorPrimary: accent.primary,
      colorInfo: '#3358e8',
      colorLink: accent.primary,
      colorLinkHover: accent.hover,
      colorPrimaryHover: accent.hover,
      colorPrimaryActive: accent.active,
      colorPrimaryBg: accent.soft,
      colorPrimaryBgHover: accent.glow,
    },
    components: {
      ...sharedComponents,
      Table: { ...sharedComponents.Table, rowHoverBg: accent.rowHover },
      Tabs: {
        horizontalItemPadding: '10px 2px',
        horizontalItemGutter: 26,
        titleFontSize: 14,
        inkBarColor: accent.primary,
      },
      Segmented: {
        itemSelectedBg: '#ffffff',
        trackBg: '#eef1f8',
        itemSelectedColor: '#1c2b55',
      },
      Input: {
        activeShadow: `0 0 0 3px ${accent.glow}`,
      },
      Select: {
        optionSelectedBg: accent.soft,
      },
      Button: {
        fontWeight: 500,
        primaryShadow: `0 8px 18px -10px ${accent.shadow}`,
      },
      Progress: {
        defaultColor: accent.primary,
      },
    },
  };
}

/** 教师端：蓝 */
export const teacherTheme = makeTheme({
  primary: '#3358e8',
  hover: '#4a6cf0',
  active: '#2845c2',
  soft: '#eef2ff',
  shadow: 'rgba(51, 88, 232, 0.65)',
  glow: 'rgba(51, 88, 232, 0.10)',
  rowHover: '#f6f8ff',
});

/** 学生端：绿（与左侧图形同一色系） */
export const studentTheme = makeTheme({
  primary: '#0f9e77',
  hover: '#12b389',
  active: '#0b7f5f',
  soft: '#e7f8f1',
  shadow: 'rgba(15, 158, 119, 0.55)',
  glow: 'rgba(15, 158, 119, 0.14)',
  rowHover: '#f2fbf7',
});

/** 管理员端：紫，和教师蓝、学生绿区分开 */
export const adminTheme = makeTheme({
  primary: '#6d4ad8',
  hover: '#7f5ee6',
  active: '#5b3bc0',
  soft: '#f1ecff',
  shadow: 'rgba(109, 74, 216, 0.55)',
  glow: 'rgba(109, 74, 216, 0.13)',
  rowHover: '#f8f5ff',
});

/** 兼容旧引用：默认（未登录、教师端）用蓝色主题 */
export const themeConfig = teacherTheme;
