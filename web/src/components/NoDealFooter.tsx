// v4 footer line listing stores without any deal in the band's format.

import type { Store } from '@shared/types'
import { STORE_META } from '@shared/types'

interface NoDealFooterProps {
  subCategoryLabel: string
  stores: Store[]
}

export function NoDealFooter({ subCategoryLabel, stores }: NoDealFooterProps) {
  if (stores.length === 0) return null
  const names = stores.map((s) => STORE_META[s].label).join(', ')
  return (
    <p className='mt-3 text-[12px] text-[#8a8f98]'>
      📫 No {subCategoryLabel.toLowerCase()} deals at: {names}
    </p>
  )
}
