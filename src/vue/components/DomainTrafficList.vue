<script setup lang="ts">
import { computed } from 'vue'

import type { DomainTrafficItem } from '@/services/domain-traffic'

const props = defineProps<{
  items: DomainTrafficItem[]
  columns: {
    domain: string
    proxy: string
    direct: string
    total: string
  }
  formatBytes: (bytes: number) => string
}>()

const maxTotal = computed(() =>
  props.items.reduce((max, item) => Math.max(max, item.total), 0),
)

const barWidths = (item: DomainTrafficItem) => {
  const base = maxTotal.value || 1
  return {
    proxy: `${(item.proxyTotal / base) * 100}%`,
    direct: `${(item.directTotal / base) * 100}%`,
  }
}
</script>

<template>
  <div class="dt-list">
    <div class="dt-list__head">
      <span>{{ columns.domain }}</span>
      <span>{{ columns.proxy }}</span>
      <span>{{ columns.direct }}</span>
      <span>{{ columns.total }}</span>
    </div>

    <div v-for="item in items" :key="item.domain" class="dt-row">
      <div class="dt-row__domain" :title="item.domain">{{ item.domain }}</div>
      <div class="dt-row__bytes dt-row__bytes--proxy">
        {{ formatBytes(item.proxyTotal) }}
      </div>
      <div class="dt-row__bytes dt-row__bytes--direct">
        {{ formatBytes(item.directTotal) }}
      </div>
      <div class="dt-row__bytes">{{ formatBytes(item.total) }}</div>
      <div class="dt-row__bar">
        <span
          class="dt-bar dt-bar--proxy"
          :style="{ width: barWidths(item).proxy }"
        />
        <span
          class="dt-bar dt-bar--direct"
          :style="{ width: barWidths(item).direct }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dt-list {
  border-radius: var(--cx-radius-md, 8px);
  border: 1px solid var(--cx-divider, var(--divider-color));
  background: var(--background-paper);

  &__head,
  .dt-row {
    display: grid;
    grid-template-columns: minmax(140px, 1.6fr) 0.9fr 0.9fr 0.9fr;
    gap: 8px;
    align-items: center;
    padding: 10px 14px;
  }

  &__head {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--cx-divider, var(--divider-color));
  }
}

.dt-row {
  position: relative;
  font-size: 13px;
  border-bottom: 1px solid
    color-mix(in srgb, var(--cx-divider, #ddd) 70%, transparent);

  &:last-child {
    border-bottom: 0;
  }

  &__domain {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__bytes {
    font-variant-numeric: tabular-nums;

    &--proxy {
      color: var(--primary-main);
    }

    &--direct {
      color: #2e7d32;
    }
  }

  &__bar {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 0;
    height: 2px;
    display: flex;
    overflow: hidden;
    border-radius: 1px;
    opacity: 0.85;
  }
}

.dt-bar {
  display: block;
  height: 100%;

  &--proxy {
    background: var(--primary-main);
  }

  &--direct {
    background: #2e7d32;
  }
}

@media (max-width: 720px) {
  .dt-list {
    &__head,
    .dt-row {
      grid-template-columns: 1.4fr 0.8fr 0.8fr;
    }

    &__head span:nth-child(4),
    .dt-row__bytes:nth-child(4) {
      display: none;
    }
  }
}
</style>
