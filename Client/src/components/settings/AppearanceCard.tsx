import FontSizeSlider from '../common/FontSizeSlider'
import { MAX_TEXT_SCALE, MIN_TEXT_SCALE, TEXT_SCALE_STEP } from '../../utils/theme'
import { SettingsCard, SettingsRow } from './SettingsCard'
import { OptionPills } from './OptionPills'
import type { usePreferences } from './usePreferences'

type Prefs = ReturnType<typeof usePreferences>

export function AppearanceCard({ prefs }: { prefs: Prefs }) {
  return (
    <SettingsCard icon="appearance" title="Appearance" description="">
      <SettingsRow label="Theme" hint="">
        <OptionPills
          ariaLabel="Theme"
          value={prefs.theme}
          onChange={prefs.changeTheme}
          options={[
            { value: 'light', label: 'Light', icon: 'themeLight' },
            { value: 'dark', label: 'Dark', icon: 'themeDark' },
          ]}
        />
      </SettingsRow>

      <SettingsRow label="Font family" hint="">
        <OptionPills
          ariaLabel="Font family"
          value={prefs.font}
          onChange={prefs.setFont}
          options={[
            { value: 'claude', label: 'Default', fontFamily: "'Inter Variable','Segoe UI',sans-serif" },
            { value: 'clean', label: 'Clean', fontFamily: 'Calibri,Candara,Verdana,sans-serif' },
            { value: 'mono', label: 'Mono', fontFamily: "'Cascadia Code',Consolas,monospace" },
            { value: 'serif', label: 'Serif', fontFamily: 'Georgia,Cambria,serif' },
          ]}
        />
      </SettingsRow>

      <SettingsRow label="Layout density" hint="">
        <OptionPills
          ariaLabel="Layout density"
          value={prefs.density}
          onChange={prefs.setDensity}
          options={[
            { value: 'compact', label: 'Compact', icon: 'densityCompact' },
            { value: 'normal', label: 'Normal', icon: 'densityNormal' },
            { value: 'large', label: 'Large', icon: 'densityLarge' },
            { value: 'spacious', label: 'Spacious', icon: 'densitySpacious' },
          ]}
        />
      </SettingsRow>

      <SettingsRow label="Text size" hint="">
        <FontSizeSlider
          label="Text size"
          value={prefs.textScale}
          min={MIN_TEXT_SCALE}
          max={MAX_TEXT_SCALE}
          step={TEXT_SCALE_STEP}
          onChange={prefs.changeTextScale}
        />
      </SettingsRow>
    </SettingsCard>
  )
}
