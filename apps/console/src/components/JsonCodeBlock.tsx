'use client'

import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { useCallback, useMemo, useState } from 'react'

import { jsonLowlight } from '@/lib/jsonLowlight'

import styles from './JsonCodeBlock.module.css'

const jsxRuntime = { Fragment, jsx, jsxs }

export type JsonCodeBlockProps = Readonly<{
  code: string
  className?: string
}>

function formatJsonIfPossible(source: string): string {
  try {
    return JSON.stringify(JSON.parse(source), null, 2)
  } catch {
    return source
  }
}

export function JsonCodeBlock({ code, className }: JsonCodeBlockProps) {
  const { formatted, highlighted } = useMemo(() => {
    const formattedCode = formatJsonIfPossible(code)
    const tree = jsonLowlight.highlight('json', formattedCode)
    return {
      formatted: formattedCode,
      highlighted: toJsxRuntime(tree, jsxRuntime),
    }
  }, [code])

  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch {
      setCopied(false)
    }
  }, [formatted])

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <div className={styles.toolbar}>
        <span className={styles.lang}>JSON</span>
        <button
          type="button"
          className={[styles.copyBtn, copied ? styles.copyBtnCopied : ''].filter(Boolean).join(' ')}
          onClick={copy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy JSON to clipboard'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={styles.scroll}>{highlighted}</div>
    </div>
  )
}
