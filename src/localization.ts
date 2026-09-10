import type { InterfaceLanguage } from "./preferences";

export type ResolvedLocale = "zh-CN" | "en";

export interface OptionsCopy {
  pageTitle: string;
  settings: string;
  intro: string;
  saving: string;
  saved: string;
  saveFailed: string;
  retry: string;
  loadFailed: string;
  languageSection: string;
  languageSectionDescription: string;
  interfaceLanguage: string;
  languageHelp: string;
  languages: Record<InterfaceLanguage, { label: string; description: string }>;
  highlights: string;
  highlightsDescription: string;
  defaultColor: string;
  defaultColorHelp: string;
  colors: Record<"gold" | "mint" | "coral", { label: string; description: string }>;
  privacy: string;
  privacyDescription: string;
  version: string;
}

export interface PopupCopy {
  tagline: string;
  settings: string;
  currentPage: string;
  cloudSync: string;
  signedIn: string;
  working: string;
  syncNow: string;
  signOut: string;
  supabaseNotConfigured: string;
  email: string;
  password: string;
  signIn: string;
  signUp: string;
  authValidation: string;
  signUpConfirmation: string;
  quickActions: string;
  selectionAction: string;
  existingHighlightAction: string;
  localStorageAction: string;
  updating: string;
  restoreSite: string;
  disableSite: string;
  syncing: (count: number) => string;
  syncFailed: (count: number) => string;
  pendingSync: (count: number) => string;
  syncedAt: (date: string) => string;
  awaitingFirstSync: string;
  syncUnavailable: string;
  readingPage: string;
  disabled: string;
  siteDisabled: string;
  highlightCount: string;
  tabNotFound: string;
  pageUnavailable: string;
  scriptUnavailable: string;
  siteUpdateFailed: string;
}

export interface ContentCopy {
  colors: Record<"gold" | "mint" | "coral", string>;
  note: string;
  tags: string;
  changeColor: string;
  copied: string;
  copyExcerpt: string;
  delete: string;
  sidebarLabel: string;
  sidebarTitle: string;
  collapse: string;
  untitledPage: string;
  highlightCount: (count: number) => string;
  export: string;
  exporting: string;
  exported: string;
  exportFailed: string;
  exportTitle: string;
  exportDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  locateLabel: (index: number) => string;
  locateTitle: string;
  edit: string;
  copy: string;
  copying: string;
  copyFailed: string;
  cancel: string;
  deleting: string;
  confirmDelete: string;
  editorTitle: string;
  notePlaceholder: string;
  tagsPlaceholder: string;
  tagSeparator: string;
  save: string;
}

const OPTIONS_COPY: Record<ResolvedLocale, OptionsCopy> = {
  "zh-CN": {
    pageTitle: "六彩设置",
    settings: "设置",
    intro: "管理跨页面生效的使用偏好",
    saving: "保存中…",
    saved: "已保存",
    saveFailed: "保存失败，请重试",
    retry: "重试",
    loadFailed: "设置读取失败，当前显示默认值。你仍可以重新选择并保存。",
    languageSection: "语言",
    languageSectionDescription: "选择六彩各处使用的界面语言。",
    interfaceLanguage: "界面语言",
    languageHelp: "选择后立即生效，并保存在当前浏览器。",
    languages: {
      auto: { label: "跟随浏览器", description: "自动使用浏览器的首选语言" },
      "zh-CN": { label: "简体中文", description: "使用简体中文界面" },
      en: { label: "English", description: "Use the interface in English" },
    },
    highlights: "划线",
    highlightsDescription: "设置创建批注或标签时使用的默认高亮颜色。",
    defaultColor: "默认高亮颜色",
    defaultColorHelp: "直接点击划线工具条中的颜色时，仍以当次选择为准。",
    colors: {
      gold: { label: "暖黄", description: "醒目但柔和，适合大多数正文" },
      mint: { label: "薄荷", description: "清爽轻盈，适合概念和定义" },
      coral: { label: "珊瑚", description: "强调感更强，适合重点提醒" },
    },
    privacy: "数据与隐私",
    privacyDescription: "设置保存在当前浏览器本地，不依赖登录或网络。",
    version: "版本",
  },
  en: {
    pageTitle: "Liucai Settings",
    settings: "Settings",
    intro: "Manage preferences that apply across pages",
    saving: "Saving…",
    saved: "Saved",
    saveFailed: "Could not save. Please try again.",
    retry: "Retry",
    loadFailed: "Could not load settings. Defaults are shown, and you can still choose and save again.",
    languageSection: "Language",
    languageSectionDescription: "Choose the interface language used across Liucai.",
    interfaceLanguage: "Interface language",
    languageHelp: "Changes apply immediately and are saved in this browser.",
    languages: {
      auto: { label: "Follow browser", description: "Use your browser's preferred language" },
      "zh-CN": { label: "简体中文", description: "Use the interface in Simplified Chinese" },
      en: { label: "English", description: "Use the interface in English" },
    },
    highlights: "Highlights",
    highlightsDescription: "Set the default highlight color used when adding a note or tag.",
    defaultColor: "Default highlight color",
    defaultColorHelp: "Choosing a color directly from the toolbar still overrides this default.",
    colors: {
      gold: { label: "Warm Gold", description: "Visible yet soft for most body text" },
      mint: { label: "Mint", description: "Fresh and light for concepts and definitions" },
      coral: { label: "Coral", description: "Stronger emphasis for important reminders" },
    },
    privacy: "Data & privacy",
    privacyDescription: "Settings stay in this browser and do not require an account or network connection.",
    version: "Version",
  },
};

const POPUP_COPY: Record<ResolvedLocale, PopupCopy> = {
  "zh-CN": {
    tagline: "本地网页高亮与批注",
    settings: "设置",
    currentPage: "当前页面",
    cloudSync: "云端同步",
    signedIn: "已登录",
    working: "处理中……",
    syncNow: "立即同步",
    signOut: "退出",
    supabaseNotConfigured: "构建时尚未配置 Supabase。",
    email: "邮箱",
    password: "密码（至少 6 位）",
    signIn: "登录",
    signUp: "注册",
    authValidation: "请输入邮箱，密码至少 6 位。",
    signUpConfirmation: "注册成功，请按 Supabase 邮件完成验证后再登录。",
    quickActions: "快速操作",
    selectionAction: "选中文本：三色高亮 + 批注 + 标签",
    existingHighlightAction: "点击已划线：调色盘 + 批注 + 标签 + 复制 + 删除",
    localStorageAction: "数据保存到 Chrome IndexedDB",
    updating: "正在更新……",
    restoreSite: "恢复此网站划线",
    disableSite: "在此网站禁用划线",
    syncing: (count) => `同步中 · ${count} 条待上传`,
    syncFailed: (count) => `同步失败 · ${count} 条待上传`,
    pendingSync: (count) => `${count} 条等待同步`,
    syncedAt: (date) => `已同步 · ${date}`,
    awaitingFirstSync: "已登录，等待首次同步",
    syncUnavailable: "同步服务暂不可用。",
    readingPage: "正在读取当前页状态……",
    disabled: "已禁用",
    siteDisabled: "此域名不显示划线入口",
    highlightCount: "当前页高亮数量",
    tabNotFound: "未找到当前标签页。",
    pageUnavailable: "当前页面暂不可读取。",
    scriptUnavailable: "当前页面未注入六彩脚本，请在普通网页中使用。",
    siteUpdateFailed: "网站设置更新失败。",
  },
  en: {
    tagline: "Local web highlights and notes",
    settings: "Settings",
    currentPage: "Current page",
    cloudSync: "Cloud sync",
    signedIn: "Signed in",
    working: "Working…",
    syncNow: "Sync now",
    signOut: "Sign out",
    supabaseNotConfigured: "Supabase was not configured for this build.",
    email: "Email",
    password: "Password (6+ characters)",
    signIn: "Sign in",
    signUp: "Sign up",
    authValidation: "Enter an email and a password with at least 6 characters.",
    signUpConfirmation: "Account created. Verify your email with Supabase, then sign in.",
    quickActions: "Quick actions",
    selectionAction: "Select text: three colors + note + tags",
    existingHighlightAction: "Click a highlight: color + note + tags + copy + delete",
    localStorageAction: "Data is stored in Chrome IndexedDB",
    updating: "Updating…",
    restoreSite: "Enable highlights on this site",
    disableSite: "Disable highlights on this site",
    syncing: (count) => `Syncing · ${count} pending`,
    syncFailed: (count) => `Sync failed · ${count} pending`,
    pendingSync: (count) => `${count} waiting to sync`,
    syncedAt: (date) => `Synced · ${date}`,
    awaitingFirstSync: "Signed in, waiting for the first sync",
    syncUnavailable: "Sync is temporarily unavailable.",
    readingPage: "Reading the current page…",
    disabled: "Disabled",
    siteDisabled: "Highlight controls are hidden on this domain",
    highlightCount: "Highlights on this page",
    tabNotFound: "Could not find the current tab.",
    pageUnavailable: "The current page is unavailable.",
    scriptUnavailable: "Liucai is not available on this page. Try a regular webpage.",
    siteUpdateFailed: "Could not update the site setting.",
  },
};

const CONTENT_COPY: Record<ResolvedLocale, ContentCopy> = {
  "zh-CN": {
    colors: { gold: "暖黄", mint: "薄荷", coral: "珊瑚" },
    note: "批注",
    tags: "标签",
    changeColor: "修改颜色",
    copied: "已复制",
    copyExcerpt: "复制摘录",
    delete: "删除",
    sidebarLabel: "六彩划线列表",
    sidebarTitle: "划线列表",
    collapse: "收起",
    untitledPage: "未命名页面",
    highlightCount: (count) => `${count} 条`,
    export: "导出",
    exporting: "导出中…",
    exported: "已导出",
    exportFailed: "导出失败",
    exportTitle: "导出 Obsidian Markdown",
    exportDescription: "包含 Frontmatter、原文链接、批注和标签",
    emptyTitle: "还没有划线",
    emptyDescription: "在网页中选中文本后，点击颜色即可加入这里。",
    locateLabel: (index) => `定位第 ${index} 条划线`,
    locateTitle: "定位到网页划线",
    edit: "编辑",
    copy: "复制",
    copying: "复制中…",
    copyFailed: "复制失败",
    cancel: "取消",
    deleting: "删除中…",
    confirmDelete: "确认删除",
    editorTitle: "批注与标签",
    notePlaceholder: "写下想法；输入 1. 或 - 创建列表……",
    tagsPlaceholder: "输入标签，如 AI/Agent，测试/用例设计",
    tagSeparator: "，",
    save: "保存",
  },
  en: {
    colors: { gold: "Warm Gold", mint: "Mint", coral: "Coral" },
    note: "Note",
    tags: "Tags",
    changeColor: "Change color",
    copied: "Copied",
    copyExcerpt: "Copy excerpt",
    delete: "Delete",
    sidebarLabel: "Liucai highlights",
    sidebarTitle: "Highlights",
    collapse: "Collapse",
    untitledPage: "Untitled page",
    highlightCount: (count) => `${count} ${count === 1 ? "highlight" : "highlights"}`,
    export: "Export",
    exporting: "Exporting…",
    exported: "Exported",
    exportFailed: "Export failed",
    exportTitle: "Export Obsidian Markdown",
    exportDescription: "Includes Frontmatter, source links, notes, and tags",
    emptyTitle: "No highlights yet",
    emptyDescription: "Select text on the page, then choose a color to add it here.",
    locateLabel: (index) => `Locate highlight ${index}`,
    locateTitle: "Locate on page",
    edit: "Edit",
    copy: "Copy",
    copying: "Copying…",
    copyFailed: "Copy failed",
    cancel: "Cancel",
    deleting: "Deleting…",
    confirmDelete: "Confirm delete",
    editorTitle: "Note & tags",
    notePlaceholder: "Write a thought; type 1. or - to start a list…",
    tagsPlaceholder: "Add tags, e.g. AI/Agent, testing/test design",
    tagSeparator: ", ",
    save: "Save",
  },
};

export function resolveInterfaceLocale(
  preference: InterfaceLanguage,
  browserLanguage = globalThis.navigator?.language ?? "en",
): ResolvedLocale {
  if (preference !== "auto") return preference;
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function getOptionsCopy(locale: ResolvedLocale): OptionsCopy {
  return OPTIONS_COPY[locale];
}

export function getPopupCopy(locale: ResolvedLocale): PopupCopy {
  return POPUP_COPY[locale];
}

export function getContentCopy(locale: ResolvedLocale): ContentCopy {
  return CONTENT_COPY[locale];
}
