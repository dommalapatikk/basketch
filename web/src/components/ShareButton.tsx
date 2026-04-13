import { useState } from 'react'

import { Button, type ButtonProps } from './ui/Button'

export interface ShareButtonProps {
  title: string
  text: string
  url?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  children: React.ReactNode
}

export function ShareButton(props: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  function handleShare() {
    const shareUrl = props.url ?? window.location.href

    if (navigator.share) {
      navigator.share({
        title: props.title,
        text: props.text,
        url: shareUrl,
      }).catch(() => {
        // User cancelled — ignore
      })
    } else {
      // Clipboard fallback
      navigator.clipboard.writeText(shareUrl).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {
        // Final fallback: execCommand
        const input = document.createElement('input')
        input.value = shareUrl
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <Button
      variant={props.variant ?? 'outline'}
      size={props.size ?? 'sm'}
      onClick={handleShare}
      type="button"
    >
      {copied ? 'Link copied!' : props.children}
    </Button>
  )
}
