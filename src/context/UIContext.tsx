import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject
} from 'react';

export type ThemeMode = 'light' | 'dark';

type AdminNotice = {
  id: number;
  type: 'success' | 'error';
  message: string;
};

type UIContextValue = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  sidebarRef: RefObject<HTMLDivElement | null>;
  sidebarBaseHeight: number | null;
  sidebarMaxHeight: number | null;
  isDomainTreeOpen: boolean;
  setIsDomainTreeOpen: (value: boolean) => void;
  areFiltersOpen: boolean;
  setAreFiltersOpen: (value: boolean) => void;
  adminNotice: AdminNotice | null;
  showAdminNotice: (type: AdminNotice['type'], message: string) => void;
  dismissAdminNotice: () => void;
  isCreatePanelOpen: boolean;
  setIsCreatePanelOpen: (value: boolean) => void;
};

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: PropsWithChildren) {
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [sidebarBaseHeight, setSidebarBaseHeight] = useState<number | null>(null);
  const sidebarMaxHeight = useMemo(
    () => (sidebarBaseHeight ? sidebarBaseHeight * 2 : null),
    [sidebarBaseHeight]
  );
  const [isDomainTreeOpen, setIsDomainTreeOpen] = useState(false);
  const [areFiltersOpen, setAreFiltersOpen] = useState(true);
  const [adminNotice, setAdminNotice] = useState<AdminNotice | null>(null);
  const adminNoticeIdRef = useRef(0);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'light') {
      setThemeModeState('light');
      return;
    }

    if (saved !== 'light') {
      localStorage.setItem('app-theme', 'light');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('app-theme', themeMode);
  }, [themeMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  useLayoutEffect(() => {
    const element = sidebarRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const target = sidebarRef.current;
      if (!target) {
        return;
      }

      if (isDomainTreeOpen) {
        return;
      }

      if (!areFiltersOpen) {
        return;
      }

      const height = Math.max(target.getBoundingClientRect().height, 0);
      if (height < 1) {
        return;
      }
      setSidebarBaseHeight((prev) => {
        if (prev === null || Math.abs(prev - height) > 0.5) {
          return height;
        }

        return prev;
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isDomainTreeOpen, areFiltersOpen]);

  const showAdminNotice = useCallback(
    (type: AdminNotice['type'], message: string) => {
      adminNoticeIdRef.current += 1;
      setAdminNotice({ id: adminNoticeIdRef.current, type, message });
    },
    []
  );

  const dismissAdminNotice = useCallback(() => {
    setAdminNotice(null);
  }, []);

  const value: UIContextValue = {
    themeMode,
    setThemeMode,
    sidebarRef,
    sidebarBaseHeight,
    sidebarMaxHeight,
    isDomainTreeOpen,
    setIsDomainTreeOpen,
    areFiltersOpen,
    setAreFiltersOpen,
    adminNotice,
    showAdminNotice,
    dismissAdminNotice,
    isCreatePanelOpen,
    setIsCreatePanelOpen
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }

  return context;
}
