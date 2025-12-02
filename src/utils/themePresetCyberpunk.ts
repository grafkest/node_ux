import { presetGpnDark, ThemePreset } from '@consta/uikit/Theme';

// We export the base dark preset to ensure structure is correct for the Theme component.
// The actual color overrides are handled via CSS variables in src/main.css
// targeting the .Theme_preset_cyberpunk class.
export const presetCyberpunk: ThemePreset = presetGpnDark;

