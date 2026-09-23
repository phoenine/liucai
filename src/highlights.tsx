import {
  ArrowSquareOutIcon,
  ArrowsDownUpIcon,
  BrowserIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  CheckIcon,
  CopyIcon,
  DotsThreeIcon,
  FunnelSimpleIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  PaletteIcon,
  PencilSimpleIcon,
  PlusIcon,
  RowsIcon,
  SidebarSimpleIcon,
  SparkleIcon,
  SquaresFourIcon,
  StackIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createRoot } from "react-dom/client";
import { HIGHLIGHT_ACCENT } from "./content/highlightTooltip";
import { formatAiExplanationNote } from "./ai/aiNote";
import { SafeMarkdown } from "./content/safeMarkdown";
import { parseTags } from "./content/tags";
import { generateUuid } from "./shared/id";
import {
  LOCAL_DATABASE_SCOPE_STORAGE_KEY,
  isAiStreamUpdate,
  type AiExplanation,
  type HighlightLibraryResponse,
  type StorageResponse,
  type SyncStatus,
} from "./shared/messages";
import {
  getHighlightsCopy,
  resolveInterfaceLocale,
  type HighlightsCopy,
  type HighlightsSort,
  type HighlightsView,
  type ResolvedLocale,
} from "./shared/localization";
import { DEFAULT_PREFERENCES, loadPreferences } from "./shared/preferences";
import type {
  HighlightColor,
  HighlightLibrary,
  HighlightRecord,
  PageRecord,
} from "./shared/types";
import "./highlights.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; library: HighlightLibrary; syncStatus: SyncStatus }
  | { status: "failed" };

type ColorFilter = "all" | HighlightColor;
type Layout = "grid" | "list";

interface LibraryItem {
  highlight: HighlightRecord;
  page: PageRecord;
  pageOrder: number;
}

interface Section {
  key: string;
  title?: string;
  color?: HighlightColor;
  page?: PageRecord;
  items: LibraryItem[];
}

const COLORS: HighlightColor[] = ["gold", "mint", "coral"];
const VIEWS: { id: HighlightsView; icon: typeof StackIcon }[] = [
  { id: "all", icon: StackIcon },
  { id: "pages", icon: BrowserIcon },
  { id: "tags", icon: TagIcon },
  { id: "colors", icon: PaletteIcon },
];
const SORTS: HighlightsSort[] = ["latest", "oldest", "position"];
const RECENT_PAGE_LIMIT = 8;
const LAYOUT_STORAGE_KEY = "liucai.library.layout";
const SIDEBAR_STORAGE_KEY = "liucai.library.sidebar";
const SHORT_TEXT_LENGTH = 24;

function HighlightsApp() {
  const [locale, setLocale] = useState<ResolvedLocale>("zh-CN");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [view, setView] = useState<HighlightsView>("all");
  const [pageId, setPageId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState<ColorFilter>("all");
  const [tag, setTag] = useState("all");
  const [withNotes, setWithNotes] = useState(false);
  const [withTags, setWithTags] = useState(false);
  const [sort, setSort] = useState<HighlightsSort>("latest");
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { note: string; tags: string[] }>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [toolbarStuck, setToolbarStuck] = useState(false);
  const browseRef = useRef<HTMLDivElement>(null);
  const browseSentinelRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);
  const copy = getHighlightsCopy(locale);

  const reload = useCallback((showLoading: boolean) => {
    if (showLoading) setState({ status: "loading" });
    return loadLibrary().then(setState).catch(() => setState({ status: "failed" }));
  }, []);

  useEffect(() => {
    void loadPreferences()
      .catch(() => DEFAULT_PREFERENCES)
      .then((preferences) => {
        setLocale(resolveInterfaceLocale(preferences.general.interfaceLanguage));
        return reload(false);
      });
  }, [reload]);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[LOCAL_DATABASE_SCOPE_STORAGE_KEY]) return;
      setPageId(null);
      setSelectedId(null);
      setEdits({});
      void reload(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void reload(false);
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reload]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.pageTitle;
  }, [copy.pageTitle, locale]);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "collapsed" : "expanded");
  }, [sidebarCollapsed]);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  const library = state.status === "ready" ? state.library : null;
  const groups = library?.groups ?? [];
  const items = useMemo(() => groups.flatMap((group, pageOrder) => (
    group.highlights.map((highlight) => ({ highlight, page: group.page, pageOrder }))
  )), [groups]);
  const tags = useMemo(() => Array.from(new Set(
    items.flatMap((item) => item.highlight.tags),
  )).sort((left, right) => left.localeCompare(right, locale)), [items, locale]);
  const usedColors = useMemo(
    () => COLORS.filter((value) => items.some((item) => item.highlight.color === value)),
    [items],
  );
  const activePage = groups.find((group) => group.page.id === pageId)?.page ?? null;

  useEffect(() => {
    if (tag !== "all" && !tags.includes(tag)) setTag("all");
  }, [tag, tags]);

  useEffect(() => {
    if (pageId && !activePage && library) setPageId(null);
  }, [activePage, library, pageId]);

  const showToolbar = library !== null && library.highlightCount > 0;
  useEffect(() => {
    const sentinel = browseSentinelRef.current;
    if (!showToolbar || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      setToolbarStuck(!entry.isIntersecting);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showToolbar]);

  useLayoutEffect(() => {
    const browse = browseRef.current;
    if (!showToolbar || !browse) {
      document.documentElement.style.removeProperty("--lc-drawer-top");
      return;
    }
    let frame = 0;
    const syncDrawerTop = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bottom = browse.getBoundingClientRect().bottom;
        const clearance = Math.max(12, Math.ceil(bottom) + 12);
        document.documentElement.style.setProperty("--lc-drawer-top", `${clearance}px`);
      });
    };
    syncDrawerTop();
    const observer = new ResizeObserver(syncDrawerTop);
    observer.observe(browse);
    window.addEventListener("scroll", syncDrawerTop, { passive: true });
    window.addEventListener("resize", syncDrawerTop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", syncDrawerTop);
      window.removeEventListener("resize", syncDrawerTop);
      document.documentElement.style.removeProperty("--lc-drawer-top");
    };
  }, [showToolbar]);

  const baseItems = useMemo(() => items.filter((item) => (
    (!pageId || item.page.id === pageId)
    && (tag === "all" || item.highlight.tags.includes(tag))
    && (!withNotes || item.highlight.note.trim().length > 0)
    && (!withTags || item.highlight.tags.length > 0)
    && matchesQuery(item, query)
  )), [items, pageId, query, tag, withNotes, withTags]);
  const colorCounts = useMemo(() => countColors(baseItems), [baseItems]);
  const visibleItems = useMemo(
    () => baseItems
      .filter((item) => color === "all" || item.highlight.color === color)
      .sort(comparator(sort)),
    [baseItems, color, sort],
  );
  const sections = useMemo(
    () => buildSections(view, visibleItems, tags, copy),
    [copy, tags, view, visibleItems],
  );
  const selectedItem = items.find((item) => item.highlight.id === selectedId) ?? null;
  const selectedIndex = selectedItem ? visibleItems.indexOf(selectedItem) : -1;
  const activeFilterCount = Number(withNotes) + Number(withTags);

  function showToast(message: string): void {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, 1600);
  }

  async function copyHighlight(record: HighlightRecord): Promise<void> {
    try {
      await navigator.clipboard.writeText(record.text);
      showToast(copy.copied);
    } catch {
      showToast(copy.copyFailed);
    }
  }

  async function removeHighlight(record: HighlightRecord): Promise<void> {
    await deleteHighlight(record);
    setSelectedId(null);
    await reload(false);
  }

  async function saveEdits(record: HighlightRecord, note: string, tags: string[]): Promise<void> {
    const next = { note, tags };
    setEdits((current) => ({ ...current, [record.id]: next }));
    try {
      await updateHighlight(record, next);
    } catch (error) {
      setEdits((current) => {
        const restored = { ...current };
        delete restored[record.id];
        return restored;
      });
      throw error;
    }
  }

  function selectView(next: HighlightsView): void {
    setView(next);
    setPageId(null);
    window.scrollTo({ top: 0 });
  }

  function selectPage(next: string): void {
    setView("all");
    setPageId(next);
    window.scrollTo({ top: 0 });
  }

  const viewCounts: Record<HighlightsView, number> = {
    all: library?.highlightCount ?? 0,
    pages: groups.length,
    tags: tags.length,
    colors: usedColors.length,
  };
  const heading = activePage ? activePage.title || copy.untitledPage : copy.views[view];
  const signedIn = state.status === "ready" && state.syncStatus.signedIn;
  const scopeLabel = state.status !== "ready"
    ? null
    : signedIn
      ? state.syncStatus.email ?? copy.currentAccount
      : copy.guestScope;

  return (
    <div className="lc-app" data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}>
      <aside className="lc-sidebar">
        <div className="lc-sidebar__brand">
          <button
            aria-label={sidebarCollapsed ? copy.expandSidebar : undefined}
            className="lc-sidebar__logo"
            disabled={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed(false)}
            type="button"
          >
            <img alt="" aria-hidden="true" src="icon128.png" />
          </button>
          <div>
            <strong>{copy.brand}</strong>
            <span>{copy.tagline}</span>
          </div>
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? copy.expandSidebar : copy.collapseSidebar}
            className="lc-sidebar__toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? copy.expandSidebar : copy.collapseSidebar}
            type="button"
          >
            <SidebarSimpleIcon aria-hidden="true" size={18} weight="regular" />
          </button>
        </div>

        <nav aria-label={copy.navigation} className="lc-sidebar__nav">
          {VIEWS.map(({ id, icon: Icon }) => (
            <button
              aria-current={view === id && !pageId ? "page" : undefined}
              className="lc-nav-item"
              key={id}
              onClick={() => selectView(id)}
              title={sidebarCollapsed ? copy.views[id] : undefined}
              type="button"
            >
              <Icon aria-hidden="true" size={18} />
              <span>{copy.views[id]}</span>
              <em>{viewCounts[id]}</em>
            </button>
          ))}
        </nav>

        {groups.length > 0 ? (
          <section className="lc-sidebar__recent">
            <h2>{copy.recentPages}</h2>
            <ul>
              {groups.slice(0, RECENT_PAGE_LIMIT).map((group) => (
                <li key={group.page.id}>
                  <button
                    aria-current={pageId === group.page.id ? "page" : undefined}
                    className="lc-recent-page"
                    onClick={() => selectPage(group.page.id)}
                    title={`${group.page.title || copy.untitledPage}\n${group.page.originalUrl}\n${copy.updatedAt(formatDateTime(group.latestUpdatedAt, locale))}`}
                    type="button"
                  >
                    <SiteIcon url={group.page.originalUrl} />
                    <span className="lc-recent-page__body">
                      <strong>{group.page.title || copy.untitledPage}</strong>
                      <span>{displayHost(group.page.originalUrl)} · {formatMonthDay(group.latestUpdatedAt, locale)}</span>
                    </span>
                    <em>{group.highlights.length}</em>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <button
          className="lc-sidebar__settings"
          onClick={() => void openSettings()}
          title={sidebarCollapsed ? copy.settings : undefined}
          type="button"
        >
          <GearSixIcon aria-hidden="true" size={18} />
          <span>{copy.settings}</span>
        </button>
      </aside>

      <main className="lc-main">
        <header className="lc-header">
          <div className="lc-header__title">
            <h1 title={heading}>{heading}</h1>
            <p>{activePage ? displayHost(activePage.originalUrl) : copy.intro}</p>
          </div>
          {scopeLabel && library ? (
            <div className="lc-header__meta">
              <span className="lc-account" data-signed-in={signedIn} title={scopeLabel}>
                <UserIcon aria-hidden="true" size={14} />
                <span>{scopeLabel}</span>
              </span>
              <strong>{copy.total(library.highlightCount)}</strong>
            </div>
          ) : null}
        </header>

        {showToolbar ? (
          <>
            <div aria-hidden="true" className="lc-browse-sentinel" ref={browseSentinelRef} />
            <div className="lc-browse" data-stuck={toolbarStuck} ref={browseRef}>
            <section aria-label={copy.searchLabel} className="lc-toolbar">
              <label className="lc-search">
                <span className="lc-visually-hidden">{copy.searchLabel}</span>
                <MagnifyingGlassIcon aria-hidden="true" size={18} />
                <input
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={copy.searchPlaceholder}
                  type="search"
                  value={query}
                />
              </label>
              <Dropdown
                active={activeFilterCount > 0}
                icon={<FunnelSimpleIcon aria-hidden="true" size={16} />}
                id="filter"
                label={activeFilterCount > 0 ? `${copy.filter} · ${activeFilterCount}` : copy.filter}
                onToggle={setOpenMenu}
                openMenu={openMenu}
              >
                <MenuCheck checked={withNotes} label={copy.filterWithNotes} onClick={() => setWithNotes(!withNotes)} />
                <MenuCheck checked={withTags} label={copy.filterWithTags} onClick={() => setWithTags(!withTags)} />
                {activeFilterCount > 0 ? (
                  <>
                    <hr />
                    <button
                      className="lc-menu__item"
                      onClick={() => {
                        setWithNotes(false);
                        setWithTags(false);
                        setOpenMenu(null);
                      }}
                      type="button"
                    >
                      {copy.clearFilters}
                    </button>
                  </>
                ) : null}
              </Dropdown>
              <Dropdown
                icon={<ArrowsDownUpIcon aria-hidden="true" size={16} />}
                id="sort"
                label={copy.sorts[sort]}
                onToggle={setOpenMenu}
                openMenu={openMenu}
              >
                {SORTS.map((value) => (
                  <MenuCheck
                    checked={sort === value}
                    key={value}
                    label={copy.sorts[value]}
                    onClick={() => {
                      setSort(value);
                      setOpenMenu(null);
                    }}
                  />
                ))}
              </Dropdown>
            </section>

            <div className="lc-filters">
              <div aria-label={copy.colorFilter} className="lc-chips" role="group">
                {(["all", "gold", "mint", "coral"] as const).map((value) => (
                  <button
                    aria-pressed={color === value}
                    className="lc-chip"
                    key={value}
                    onClick={() => setColor(value)}
                    style={value === "all" ? undefined : accentStyle(value)}
                    type="button"
                  >
                    {value === "all" ? null : <i aria-hidden="true" className="lc-dot" />}
                    {value === "all" ? copy.all : copy.colors[value]}
                    <em>{value === "all" ? baseItems.length : colorCounts[value]}</em>
                  </button>
                ))}
                {tags.length > 0 ? (
                  <label className="lc-chip lc-chip--select" data-active={tag !== "all"}>
                    <span className="lc-visually-hidden">{copy.tagFilter}</span>
                    <select onChange={(event) => setTag(event.currentTarget.value)} value={tag}>
                      <option value="all">{copy.allTags}</option>
                      {tags.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <CaretDownIcon aria-hidden="true" size={12} />
                  </label>
                ) : null}
                {activePage ? (
                  <button
                    aria-label={copy.clearPageFilter}
                    className="lc-chip lc-chip--page"
                    onClick={() => setPageId(null)}
                    type="button"
                  >
                    <SiteIcon url={activePage.originalUrl} />
                    <span>{copy.pageFilter}</span>
                    <XIcon aria-hidden="true" size={12} />
                  </button>
                ) : null}
              </div>
              <div className="lc-layout-toggle" role="group">
                <button
                  aria-label={copy.layoutGrid}
                  aria-pressed={layout === "grid"}
                  onClick={() => setLayout("grid")}
                  title={copy.layoutGrid}
                  type="button"
                >
                  <SquaresFourIcon aria-hidden="true" size={17} weight={layout === "grid" ? "fill" : "regular"} />
                </button>
                <button
                  aria-label={copy.layoutList}
                  aria-pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                  title={copy.layoutList}
                  type="button"
                >
                  <RowsIcon aria-hidden="true" size={17} weight={layout === "list" ? "fill" : "regular"} />
                </button>
              </div>
            </div>
            </div>
          </>
        ) : null}

        {state.status === "loading" ? (
          <StatusCard title={copy.loading} />
        ) : state.status === "failed" ? (
          <StatusCard
            action={<button onClick={() => void reload(true)} type="button">{copy.retry}</button>}
            title={copy.loadFailed}
          />
        ) : state.library.highlightCount === 0 ? (
          <StatusCard description={copy.emptyDescription} title={copy.emptyTitle} />
        ) : visibleItems.length === 0 ? (
          <StatusCard description={copy.noResultsDescription} title={copy.noResultsTitle} />
        ) : (
          sections.map((section) => (
            <section className="lc-section" key={section.key}>
              {section.title !== undefined ? (
                <SectionHeader copy={copy} onSelectPage={selectPage} section={section} />
              ) : null}
              <div className="lc-grid" data-layout={layout}>
                {section.items.map((item) => (
                  <HighlightCard
                    copy={copy}
                    item={item}
                    key={`${section.key}:${item.highlight.id}`}
                    locale={locale}
                    menuId={`${section.key}:${item.highlight.id}`}
                    onCopy={() => void copyHighlight(item.highlight)}
                    onOpen={() => setSelectedId(item.highlight.id)}
                    onToggleMenu={setOpenMenu}
                    openMenu={openMenu}
                    selected={selectedId === item.highlight.id}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {selectedItem ? (
        <DetailDrawer
          copy={copy}
          edited={edits[selectedItem.highlight.id]}
          item={selectedItem}
          key={selectedItem.highlight.id}
          locale={locale}
          onClose={() => setSelectedId(null)}
          onCopy={() => void copyHighlight(selectedItem.highlight)}
          onDelete={() => removeHighlight(selectedItem.highlight)}
          onNext={selectedIndex >= 0 && selectedIndex < visibleItems.length - 1
            ? () => setSelectedId(visibleItems[selectedIndex + 1].highlight.id)
            : undefined}
          onPrevious={selectedIndex > 0
            ? () => setSelectedId(visibleItems[selectedIndex - 1].highlight.id)
            : undefined}
          onSave={(note, tags) => saveEdits(selectedItem.highlight, note, tags)}
          signedIn={signedIn}
        />
      ) : null}

      {toast ? <div className="lc-toast" role="status">{toast}</div> : null}
    </div>
  );
}

function SectionHeader({
  copy,
  onSelectPage,
  section,
}: {
  copy: HighlightsCopy;
  onSelectPage: (pageId: string) => void;
  section: Section;
}) {
  const page = section.page;
  return (
    <header className="lc-section__header">
      {page ? <SiteIcon url={page.originalUrl} /> : null}
      {section.color ? <i aria-hidden="true" className="lc-dot" style={accentStyle(section.color)} /> : null}
      {page ? (
        <button className="lc-section__title" onClick={() => onSelectPage(page.id)} type="button">
          {section.title}
        </button>
      ) : (
        <h2 className="lc-section__title">{section.title}</h2>
      )}
      <span className="lc-section__count">
        {page ? `${displayHost(page.originalUrl)} · ` : ""}
        {copy.pageHighlightCount(section.items.length)}
      </span>
      {page ? (
        <a
          aria-label={copy.openPage}
          className="lc-icon-link"
          href={page.originalUrl}
          rel="noreferrer"
          target="_blank"
          title={copy.openPage}
        >
          <ArrowSquareOutIcon aria-hidden="true" size={15} />
        </a>
      ) : null}
    </header>
  );
}

function HighlightCard({
  copy,
  item,
  locale,
  menuId,
  onCopy,
  onOpen,
  onToggleMenu,
  openMenu,
  selected,
}: {
  copy: HighlightsCopy;
  item: LibraryItem;
  locale: ResolvedLocale;
  menuId: string;
  onCopy: () => void;
  onOpen: () => void;
  onToggleMenu: (id: string | null) => void;
  openMenu: string | null;
  selected: boolean;
}) {
  const { highlight, page } = item;
  const note = highlight.note.trim();
  const short = isShortText(highlight.text);
  const long = highlight.text.length > 140 || note.length > 120;
  const menuOpen = openMenu === menuId;
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, menuOpen, () => onToggleMenu(null));

  return (
    <article
      aria-label={`${copy.viewDetails}: ${highlight.text.slice(0, 40)}`}
      className="lc-card"
      data-selected={selected}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      style={accentStyle(highlight.color)}
      tabIndex={0}
    >
      <header className="lc-card__header">
        <i aria-label={copy.colors[highlight.color]} className="lc-card__mark" role="img" />
        {short ? <h3 className="lc-card__title">{highlight.text}</h3> : null}
        <div className="lc-menu-anchor lc-card__menu" ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-label={copy.moreActions}
            className="lc-card__more"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMenu(menuOpen ? null : menuId);
            }}
            type="button"
          >
            <DotsThreeIcon aria-hidden="true" size={18} weight="bold" />
          </button>
          {menuOpen ? (
            <div className="lc-menu lc-menu--end" onClick={(event) => event.stopPropagation()} role="menu">
              <button className="lc-menu__item" onClick={() => { onToggleMenu(null); onOpen(); }} role="menuitem" type="button">
                {copy.viewDetails}
              </button>
              <button className="lc-menu__item" onClick={() => { onToggleMenu(null); onCopy(); }} role="menuitem" type="button">
                <CopyIcon aria-hidden="true" size={15} />
                {copy.copyText}
              </button>
              <a
                className="lc-menu__item"
                href={page.originalUrl}
                onClick={() => onToggleMenu(null)}
                rel="noreferrer"
                role="menuitem"
                target="_blank"
              >
                <ArrowSquareOutIcon aria-hidden="true" size={15} />
                {copy.openPage}
              </a>
            </div>
          ) : null}
        </div>
      </header>

      {short ? null : <p className="lc-card__text">{highlight.text}</p>}

      {note ? (
        <div className="lc-card__note">
          <span className="lc-card__label">{copy.note}</span>
          <div className="lc-card__note-body">
            <SafeMarkdown>{note}</SafeMarkdown>
          </div>
        </div>
      ) : null}

      {highlight.tags.length > 0 ? (
        <ul aria-label={copy.tags} className="lc-tags">
          {highlight.tags.map((value) => <li key={value}>#{value}</li>)}
        </ul>
      ) : null}

      <footer className="lc-card__footer">
        <span className="lc-card__source" title={page.title || copy.untitledPage}>
          <SiteIcon url={page.originalUrl} />
          <span>{displayHost(page.originalUrl)}</span>
        </span>
        {long ? <span className="lc-card__expand">{copy.expand}</span> : null}
        <time dateTime={highlight.createdAt}>{formatDate(highlight.createdAt, locale)}</time>
      </footer>
    </article>
  );
}

type DeleteState = "idle" | "confirm" | "deleting" | "failed";

function DetailDrawer({
  copy,
  edited,
  item,
  locale,
  onClose,
  onCopy,
  onDelete,
  onNext,
  onPrevious,
  onSave,
  signedIn,
}: {
  copy: HighlightsCopy;
  edited?: { note: string; tags: string[] };
  item: LibraryItem;
  locale: ResolvedLocale;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => Promise<void>;
  onNext?: () => void;
  onPrevious?: () => void;
  onSave: (note: string, tags: string[]) => Promise<void>;
  signedIn: boolean;
}) {
  const { highlight, page } = item;
  const note = (edited?.note ?? highlight.note).trim();
  const tags = edited?.tags ?? highlight.tags;
  const closeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>("idle");
  const [moreOpen, setMoreOpen] = useState(false);
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  useDismiss(moreRef, moreOpen, () => setMoreOpen(false));

  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleDelete(): Promise<void> {
    if (deleteState === "idle" || deleteState === "failed") {
      setDeleteState("confirm");
      return;
    }
    if (deleteState !== "confirm") return;
    setDeleteState("deleting");
    try {
      await onDelete();
    } catch {
      setDeleteState("failed");
    }
  }

  return (
    <>
      <div aria-hidden="true" className="lc-drawer-scrim" onClick={onClose} />
      <aside aria-label={copy.detailTitle} aria-modal="true" className="lc-drawer" role="dialog" style={accentStyle(highlight.color)}>
        <button aria-label={copy.closeDetails} className="lc-drawer__close" onClick={onClose} ref={closeRef} type="button">
          <XIcon aria-hidden="true" size={16} />
        </button>

        <div className="lc-drawer__body">
          <header className="lc-drawer__meta">
            <i aria-label={copy.colors[highlight.color]} className="lc-dot" role="img" />
            <time dateTime={highlight.createdAt}>{formatDateTime(highlight.createdAt, locale)}</time>
          </header>

          <blockquote className="lc-drawer__text">{highlight.text}</blockquote>

          <div className="lc-drawer__actions">
            <button onClick={onCopy} type="button">
              <CopyIcon aria-hidden="true" size={16} />
              {copy.copyText}
            </button>
            <a href={page.originalUrl} rel="noreferrer" target="_blank">
              <ArrowSquareOutIcon aria-hidden="true" size={16} />
              {copy.openPage}
            </a>
            <div className="lc-menu-anchor lc-drawer__more-anchor" ref={moreRef}>
              <button
                aria-expanded={moreOpen}
                aria-label={copy.moreActions}
                className="lc-drawer__more"
                onClick={() => setMoreOpen(!moreOpen)}
                type="button"
              >
                <DotsThreeIcon aria-hidden="true" size={18} weight="bold" />
              </button>
              {moreOpen ? (
                <div className="lc-menu lc-menu--end" role="menu">
                  <button
                    className="lc-menu__item"
                    disabled={!signedIn || ai.status === "loading"}
                    onClick={() => {
                      setMoreOpen(false);
                      setAi({ status: "loading" });
                      void requestAiReading(highlight.text, locale, (text) => setAi({ status: "streaming", text }))
                        .then((explanation) => setAi({ status: "ready", explanation }))
                        .catch((error) => setAi({
                          status: "error",
                          message: error instanceof Error ? error.message : String(error),
                        }));
                    }}
                    role="menuitem"
                    title={signedIn ? undefined : copy.aiSignInRequired}
                    type="button"
                  >
                    <SparkleIcon aria-hidden="true" size={15} weight="fill" />
                    {copy.aiReading}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {ai.status !== "idle" ? (
            <AiResult
              copy={copy}
              locale={locale}
              onAppend={(text) => onSave(appendText(note, text), tags)}
              state={ai}
            />
          ) : null}

          <NoteSection
            copy={copy}
            note={note}
            onSave={(next) => onSave(next, tags)}
          />

          <TagSection
            copy={copy}
            tags={tags}
            onSave={(next) => onSave(note, next)}
          />
        </div>

        <footer className="lc-drawer__footer">
          <button
            className="lc-drawer__delete"
            data-state={deleteState}
            disabled={deleteState === "deleting"}
            onBlur={() => {
              if (deleteState === "confirm") setDeleteState("idle");
            }}
            onClick={() => void handleDelete()}
            type="button"
          >
            <TrashIcon aria-hidden="true" size={16} />
            {deleteState === "confirm"
              ? copy.confirmDelete
              : deleteState === "deleting"
                ? copy.deleting
                : copy.delete}
          </button>
          <div className="lc-drawer__nav">
            <button aria-label={copy.previous} disabled={!onPrevious} onClick={onPrevious} type="button">
              <CaretLeftIcon aria-hidden="true" size={16} weight="bold" />
            </button>
            <button aria-label={copy.next} disabled={!onNext} onClick={onNext} type="button">
              <CaretRightIcon aria-hidden="true" size={16} weight="bold" />
            </button>
          </div>
        </footer>
        {deleteState === "failed" ? <p className="lc-drawer__error" role="alert">{copy.deleteFailed}</p> : null}
      </aside>
    </>
  );
}

type AiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "streaming"; text: string }
  | { status: "ready"; explanation: AiExplanation }
  | { status: "error"; message: string };

const AI_COLLAPSE_LENGTH = 280;

function AiResult({
  copy,
  locale,
  onAppend,
  state,
}: {
  copy: HighlightsCopy;
  locale: ResolvedLocale;
  onAppend: (text: string) => Promise<void>;
  state: Exclude<AiState, { status: "idle" }>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [appended, setAppended] = useState(false);
  const [appending, setAppending] = useState(false);
  const text = state.status === "ready"
    ? formatAiExplanationNote(state.explanation, locale)
    : state.status === "streaming" ? state.text : "";

  async function append(): Promise<void> {
    if (state.status !== "ready" || appending) return;
    setAppending(true);
    try {
      await onAppend(formatAiExplanationNote(state.explanation, locale));
      setAppended(true);
    } finally {
      setAppending(false);
    }
  }

  return (
    <section className="lc-ai" data-collapsed={collapsed}>
      <header>
        <h3>
          <SparkleIcon aria-hidden="true" size={15} weight="fill" />
          {copy.aiReading}
        </h3>
        {text.length > AI_COLLAPSE_LENGTH ? (
          <button onClick={() => setCollapsed(!collapsed)} type="button">
            {collapsed ? copy.expandSection : copy.collapseSection}
            {collapsed
              ? <CaretDownIcon aria-hidden="true" size={12} />
              : <CaretUpIcon aria-hidden="true" size={12} />}
          </button>
        ) : null}
      </header>
      {collapsed ? null : (
        <>
          {state.status === "loading" ? <p className="lc-ai__status">{copy.aiLoading}</p> : null}
          {state.status === "error" ? <p className="lc-ai__status" role="alert">{copy.aiError(state.message)}</p> : null}
          {text ? <SafeMarkdown>{text}</SafeMarkdown> : null}
          {state.status === "ready" ? (
            <button className="lc-ai__append" disabled={appending || appended} onClick={() => void append()} type="button">
              {appended ? copy.aiAppended : appending ? copy.aiAppending : copy.aiAppendNote}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function NoteSection({
  copy,
  note,
  onSave,
}: {
  copy: HighlightsCopy;
  note: string;
  onSave: (note: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(): Promise<void> {
    if (saving || draft.trim() === note) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="lc-note">
      <header>
        <h3>{copy.myNote}</h3>
        {editing ? null : (
          <button aria-label={copy.editNote} onClick={() => { setDraft(note); setEditing(true); }} type="button">
            <PencilSimpleIcon aria-hidden="true" size={15} />
          </button>
        )}
      </header>
      {editing ? (
        <>
          <textarea
            autoFocus
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder={copy.notePlaceholder}
            value={draft}
          />
          <div className="lc-note__edit-actions">
            <button
              onClick={() => { setEditing(false); setFailed(false); }}
              type="button"
            >
              {copy.cancelEdit}
            </button>
            <button disabled={saving} onClick={() => void save()} type="button">
              {saving ? copy.saving : copy.save}
            </button>
          </div>
          {failed ? <p className="lc-drawer__error" role="alert">{copy.saveFailed}</p> : null}
        </>
      ) : note ? (
        <div className="lc-note__body">
          <SafeMarkdown>{note}</SafeMarkdown>
        </div>
      ) : (
        <button className="lc-note__empty" onClick={() => { setDraft(""); setEditing(true); }} type="button">
          {copy.addNote}
        </button>
      )}
    </section>
  );
}

function TagSection({
  copy,
  tags,
  onSave,
}: {
  copy: HighlightsCopy;
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [failed, setFailed] = useState(false);

  async function add(): Promise<void> {
    const next = parseTags(`${tags.join(",")},${draft}`);
    setAdding(false);
    setDraft("");
    if (next.join("\u0000") === tags.join("\u0000")) return;
    try {
      setFailed(false);
      await onSave(next);
    } catch {
      setFailed(true);
    }
  }

  async function remove(tag: string): Promise<void> {
    try {
      setFailed(false);
      await onSave(tags.filter((value) => value !== tag));
    } catch {
      setFailed(true);
    }
  }

  return (
    <section className="lc-tag-section">
      <h3>{copy.tags}</h3>
      <ul className="lc-drawer__tags">
        {tags.map((tag) => (
          <li key={tag}>
            <i aria-hidden="true" className="lc-dot" />
            {tag}
            <button aria-label={`${copy.removeTag} ${tag}`} onClick={() => void remove(tag)} type="button">
              <XIcon aria-hidden="true" size={11} />
            </button>
          </li>
        ))}
        <li>
          {adding ? (
            <input
              aria-label={copy.addTag}
              autoFocus
              onBlur={() => void add()}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void add();
                if (event.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              placeholder={copy.tagPlaceholder}
              value={draft}
            />
          ) : (
            <button className="lc-tag-add" onClick={() => setAdding(true)} type="button">
              <PlusIcon aria-hidden="true" size={12} weight="bold" />
              {copy.addTag}
            </button>
          )}
        </li>
      </ul>
      {failed ? <p className="lc-drawer__error" role="alert">{copy.saveFailed}</p> : null}
    </section>
  );
}

function Dropdown({
  active = false,
  children,
  icon,
  id,
  label,
  onToggle,
  openMenu,
}: {
  active?: boolean;
  children: ReactNode;
  icon: ReactNode;
  id: string;
  label: string;
  onToggle: (id: string | null) => void;
  openMenu: string | null;
}) {
  const open = openMenu === id;
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => onToggle(null));
  return (
    <div className="lc-menu-anchor" ref={ref}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="lc-toolbar__button"
        data-active={active}
        onClick={() => onToggle(open ? null : id)}
        type="button"
      >
        {icon}
        <span>{label}</span>
        <CaretDownIcon aria-hidden="true" size={12} />
      </button>
      {open ? <div className="lc-menu lc-menu--end" role="menu">{children}</div> : null}
    </div>
  );
}

function MenuCheck({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-checked={checked} className="lc-menu__item" onClick={onClick} role="menuitemcheckbox" type="button">
      <span className="lc-menu__check">{checked ? <CheckIcon aria-hidden="true" size={14} weight="bold" /> : null}</span>
      {label}
    </button>
  );
}

function StatusCard({ action, description, title }: { action?: ReactNode; description?: string; title: string }) {
  return (
    <section className="lc-status">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action}
    </section>
  );
}

function SiteIcon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(url);
  if (!src || failed) {
    return <span aria-hidden="true" className="lc-site-icon lc-site-icon--fallback">{displayHost(url).charAt(0).toUpperCase()}</span>;
  }
  return <img alt="" aria-hidden="true" className="lc-site-icon" onError={() => setFailed(true)} src={src} />;
}

function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [close, open, ref]);
}

function buildSections(
  view: HighlightsView,
  items: LibraryItem[],
  tags: string[],
  copy: HighlightsCopy,
): Section[] {
  if (view === "all") return [{ key: "all", items }];

  if (view === "pages") {
    const byPage = new Map<string, Section>();
    for (const item of [...items].sort((left, right) => left.pageOrder - right.pageOrder)) {
      const section = byPage.get(item.page.id);
      if (section) section.items.push(item);
      else byPage.set(item.page.id, {
        key: `page:${item.page.id}`,
        title: item.page.title || copy.untitledPage,
        page: item.page,
        items: [item],
      });
    }
    return Array.from(byPage.values());
  }

  if (view === "colors") {
    return COLORS
      .map((value) => ({
        key: `color:${value}`,
        title: copy.colors[value],
        color: value,
        items: items.filter((item) => item.highlight.color === value),
      }))
      .filter((section) => section.items.length > 0);
  }

  const sections: Section[] = tags
    .map((value) => ({
      key: `tag:${value}`,
      title: `#${value}`,
      items: items.filter((item) => item.highlight.tags.includes(value)),
    }))
    .filter((section) => section.items.length > 0);
  const untagged = items.filter((item) => item.highlight.tags.length === 0);
  if (untagged.length > 0) sections.push({ key: "tag:none", title: copy.untagged, items: untagged });
  return sections;
}

function comparator(sort: HighlightsSort): (left: LibraryItem, right: LibraryItem) => number {
  if (sort === "oldest") {
    return (left, right) => left.highlight.createdAt.localeCompare(right.highlight.createdAt);
  }
  if (sort === "position") {
    return (left, right) => (
      left.pageOrder - right.pageOrder
      || left.highlight.selector.start - right.highlight.selector.start
    );
  }
  return (left, right) => right.highlight.createdAt.localeCompare(left.highlight.createdAt);
}

function countColors(items: LibraryItem[]): Record<HighlightColor, number> {
  const counts: Record<HighlightColor, number> = { gold: 0, mint: 0, coral: 0 };
  for (const item of items) counts[item.highlight.color] += 1;
  return counts;
}

function matchesQuery(item: LibraryItem, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    item.highlight.text,
    item.highlight.note,
    ...item.highlight.tags,
    item.page.title,
    item.page.canonicalUrl,
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function isShortText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length <= SHORT_TEXT_LENGTH && !trimmed.includes("\n");
}

function accentStyle(color: HighlightColor): CSSProperties {
  return { "--liucai-accent": HIGHLIGHT_ACCENT[color] } as CSSProperties;
}

function readLayout(): Layout {
  return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === "list" ? "list" : "grid";
}

function readSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
}

async function loadLibrary(): Promise<LoadState> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("LIUCAI_RUNTIME_UNAVAILABLE");
  }
  const [libraryResponse, syncResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: "LIUCAI_STORAGE_GET_HIGHLIGHT_LIBRARY" }) as Promise<HighlightLibraryResponse>,
    chrome.runtime.sendMessage({ type: "LIUCAI_SYNC_GET_STATUS" }) as Promise<StorageResponse<SyncStatus>>,
  ]);
  if (!libraryResponse?.ok) throw new Error(libraryResponse?.error ?? "LIUCAI_LIBRARY_UNAVAILABLE");
  if (!syncResponse?.ok) throw new Error(syncResponse?.error ?? "LIUCAI_SYNC_UNAVAILABLE");
  return { status: "ready", library: libraryResponse.data, syncStatus: syncResponse.data };
}

async function requestAiReading(
  text: string,
  locale: ResolvedLocale,
  onStream: (text: string) => void,
): Promise<AiExplanation> {
  const requestId = generateUuid();
  const handleMessage = (message: unknown) => {
    if (isAiStreamUpdate(message) && message.requestId === requestId) onStream(message.text);
  };
  chrome.runtime.onMessage.addListener(handleMessage);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "LIUCAI_AI_EXPLAIN",
      requestId,
      selectedText: text.slice(0, 1500),
      contextText: "",
      locale,
    }) as StorageResponse<AiExplanation> | undefined;
    if (!response?.ok || !response.data) {
      throw new Error(response && !response.ok ? response.error : "AI_REQUEST_FAILED");
    }
    return response.data;
  } finally {
    chrome.runtime.onMessage.removeListener(handleMessage);
  }
}

function appendText(existing: string, addition: string): string {
  const current = existing.trim();
  return current ? `${current}\n\n${addition.trim()}` : addition.trim();
}

async function updateHighlight(
  record: HighlightRecord,
  edits: { note: string; tags: string[] },
): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: "LIUCAI_STORAGE_PUT_HIGHLIGHT",
    record: { ...record, ...edits, updatedAt: new Date().toISOString() },
  }) as StorageResponse<unknown> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "LIUCAI_SAVE_FAILED");
}

async function deleteHighlight(record: HighlightRecord): Promise<void> {
  const now = new Date().toISOString();
  const response = await chrome.runtime.sendMessage({
    type: "LIUCAI_STORAGE_PUT_HIGHLIGHT",
    record: { ...record, deletedAt: now, updatedAt: now },
  }) as StorageResponse<unknown> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? "LIUCAI_DELETE_FAILED");
}

async function openSettings(): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.runtime?.openOptionsPage) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  window.location.href = "options.html";
}

function faviconUrl(pageUrl: string): string | null {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return null;
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(value: string, locale: ResolvedLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return locale === "zh-CN"
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

function formatMonthDay(value: string, locale: ResolvedLocale): string {
  return new Date(value).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
}

function formatDateTime(value: string, locale: ResolvedLocale): string {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<HighlightsApp />);
