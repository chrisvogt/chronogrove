'use client'

import { CHRONOGROVE_THEMES, type ChronogroveThemeId } from '@/theme/chronogroveTheme'
import { CHRONOGROVE_THEME_INFO } from '@/theme/chronogroveThemeInfo'
import styles from './ChronogroveThemeOptionList.module.css'

export function ChronogroveThemeOptionList({
  value,
  disabled,
  labelledBy,
  onSelect,
}: Readonly<{
  value: ChronogroveThemeId
  disabled?: boolean
  labelledBy: string
  onSelect: (id: ChronogroveThemeId) => void
}>) {
  return (
    <div className={styles.options} role="radiogroup" aria-labelledby={labelledBy}>
      {CHRONOGROVE_THEMES.map((id) => {
        const meta = CHRONOGROVE_THEME_INFO[id]
        const selected = value === id
        return (
          <label
            key={id}
            className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
          >
            <input
              type="radio"
              name="chronogrove-theme-option"
              value={id}
              className={styles.radioInput}
              checked={selected}
              onChange={() => onSelect(id)}
              disabled={disabled}
            />
            <span className={styles.optionTitle}>{meta.label}</span>
            <span className={styles.optionBlurb}>{meta.blurb}</span>
            <span className={styles.swatchStrip} data-theme-preview={id} aria-hidden />
          </label>
        )
      })}
    </div>
  )
}
