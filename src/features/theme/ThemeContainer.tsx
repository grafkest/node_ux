import { Theme, type ThemePreset } from '@consta/uikit/Theme';
import type { PropsWithChildren } from 'react';

import styles from '../../App.module.css';

type ThemeContainerProps = PropsWithChildren<{
  preset: ThemePreset;
  themeKey: string;
}>;

export function ThemeContainer({ preset, themeKey, children }: ThemeContainerProps) {
  return (
    <Theme key={themeKey} preset={preset} className={styles.app}>
      {children}
    </Theme>
  );
}
