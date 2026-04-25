import type { Story } from '@ladle/react'
import { Info } from 'lucide-react'
import { useState } from 'react'

import { STORE_KEYS } from '@/lib/store-tokens'

import { Button } from './button'
import { CategoryChip } from './category-chip'
import { Chip } from './chip'
import { Drawer, DrawerContent, DrawerTrigger } from './drawer'
import { Input, SearchInput } from './input'
import { PriceBlock } from './price-block'
import { Sheet, SheetContent, SheetTrigger } from './sheet'
import { StoreChip } from './store-chip'
import { Tag } from './tag'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 32 }}>
    <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-ink-3)', marginBottom: 12 }}>
      {title}
    </h3>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{children}</div>
  </section>
)

// ────────────────────────────────────────────────────────────── BUTTON
export const ButtonAll: Story = () => (
  <>
    <Section title="Primary">
      <Button size="sm">Small</Button>
      <Button>Browse all deals</Button>
      <Button size="lg">Large</Button>
    </Section>
    <Section title="Secondary">
      <Button variant="secondary">Share verdict</Button>
      <Button variant="secondary" size="lg">View my list</Button>
    </Section>
    <Section title="Ghost & link">
      <Button variant="ghost">Cancel</Button>
      <Button variant="link">Read methodology</Button>
    </Section>
    <Section title="Disabled">
      <Button disabled>Submit</Button>
      <Button variant="secondary" disabled>Cancel</Button>
    </Section>
  </>
)

// ────────────────────────────────────────────────────────────── TAG
export const TagAll: Story = () => (
  <>
    <Section title="Positive (cheapest, savings)">
      <Tag tone="positive">Cheapest</Tag>
      <Tag tone="positive">−33%</Tag>
      <Tag tone="positive" size="md">Best price/kg</Tag>
    </Section>
    <Section title="Neutral (compatibility note)">
      <Tag tone="neutral" icon={<Info size={12} />}>Different format · per-unit shown where possible</Tag>
    </Section>
    <Section title="Signal & warning">
      <Tag tone="signal">New</Tag>
      <Tag tone="warning">Limited stock</Tag>
    </Section>
  </>
)

// ────────────────────────────────────────────────────────────── STORE CHIPS
export const StoreChipAll: Story = () => {
  const [selected, setSelected] = useState(new Set(['migros', 'denner']))
  const counts: Record<string, number> = { migros: 143, coop: 745, lidl: 212, denner: 177, spar: 0, volg: 17, aldi: 61 }
  return (
    <Section title="Store filter chips (selected, neutral, disabled when count = 0)">
      {STORE_KEYS.map((store) => (
        <StoreChip
          key={store}
          store={store}
          count={counts[store]}
          selected={selected.has(store)}
          onClick={() => {
            const next = new Set(selected)
            next.has(store) ? next.delete(store) : next.add(store)
            setSelected(next)
          }}
        />
      ))}
    </Section>
  )
}

// ────────────────────────────────────────────────────────────── CATEGORY CHIPS
export const CategoryChipAll: Story = () => {
  const [selected, setSelected] = useState<string | null>('fresh')
  return (
    <Section title="Category chips with accent dot">
      {(['fresh', 'longlife', 'household', 'other'] as const).map((cat) => (
        <CategoryChip
          key={cat}
          category={cat}
          selected={selected === cat}
          onClick={() => setSelected(cat)}
        >
          {cat === 'fresh' ? 'Fresh' : cat === 'longlife' ? 'Long-life' : cat === 'household' ? 'Household' : 'Other'}
        </CategoryChip>
      ))}
    </Section>
  )
}

// ────────────────────────────────────────────────────────────── PRICE BLOCK
export const PriceBlockAll: Story = () => (
  <>
    <Section title="With strike-through and savings">
      <PriceBlock current={5.33} previous={7.95} perUnit="CHF 5.33/kg" savingsPct={33} size="lg" />
    </Section>
    <Section title="No previous price (sale only)">
      <PriceBlock current={2.45} perUnit="100 g = CHF 1.17" />
    </Section>
    <Section title="Small (compact card)">
      <PriceBlock current={11.95} previous={14.95} savingsPct={20} size="sm" />
    </Section>
  </>
)

// ────────────────────────────────────────────────────────────── INPUT
export const InputAll: Story = () => {
  const [search, setSearch] = useState('')
  return (
    <>
      <Section title="Plain input">
        <div style={{ width: 320 }}>
          <Input placeholder="Your name" />
        </div>
      </Section>
      <Section title="Search input with ⌘K hint and clear">
        <div style={{ width: 480 }}>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
          />
        </div>
      </Section>
    </>
  )
}

// ────────────────────────────────────────────────────────────── CHIP (raw)
export const ChipAll: Story = () => (
  <Section title="Generic chip primitive">
    <Chip>Default</Chip>
    <Chip selected>Selected</Chip>
    <Chip count={42}>With count</Chip>
    <Chip disabled count={0}>Disabled</Chip>
  </Section>
)

// ────────────────────────────────────────────────────────────── SHEET (desktop)
export const SheetExample: Story = () => (
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="secondary">Open desktop sheet</Button>
    </SheetTrigger>
    <SheetContent title="Filters" description="Filter the deal list">
      <p style={{ color: 'var(--color-ink-2)' }}>
        Sheet content goes here. On desktop this slides in from the right at 420px wide.
      </p>
    </SheetContent>
  </Sheet>
)

// ────────────────────────────────────────────────────────────── DRAWER (mobile)
export const DrawerExample: Story = () => (
  <Drawer>
    <DrawerTrigger asChild>
      <Button variant="secondary">Open mobile drawer</Button>
    </DrawerTrigger>
    <DrawerContent title="Filters" description="Filter the deal list">
      <p style={{ color: 'var(--color-ink-2)' }}>
        Drawer content goes here. On mobile this slides up from the bottom with drag-to-dismiss.
      </p>
    </DrawerContent>
  </Drawer>
)
